// Network-client tests run without a browser using controlled fetch, storage and SSE.
// They verify the client contract independently of the server and UI.
import test from 'node:test';
import assert from 'node:assert/strict';

let instance = 0;
async function clientFor(t, {storageThrows = false} = {}) {
  const listeners = new Map();
  const values = new Map();
  const requests = [];
  const responses = [];
  const streams = [];
  class FakeEventSource {
    static CLOSED = 2;
    constructor(url) { this.url = url; this.readyState = 1; this.closed = false; streams.push(this); }
    close() { this.closed = true; this.readyState = 2; }
  }
  const replacements = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    sessionStorage: {
      getItem(key) { if (storageThrows) throw new Error('Storage disabled'); return values.get(key) ?? null; },
      setItem(key, value) { if (storageThrows) throw new Error('Storage disabled'); values.set(key, value); },
      removeItem(key) { if (storageThrows) throw new Error('Storage disabled'); values.delete(key); },
    },
    EventSource: FakeEventSource,
    fetch: async (url, options = {}) => {
      requests.push({url, ...options});
      const reply = responses.shift();
      if (!reply) throw new Error(`Unexpected request to ${url}`);
      if (reply.error) throw reply.error;
      return {ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body};
    },
  };
  const originals = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, {value, configurable: true, writable: true});
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const module = await import(new URL(`../src/net/client.mjs?audit=${++instance}`, import.meta.url));
  return {module, requests, responses, values, streams, listeners};
}

test('audit client: creating a game remembers the host seat and posts JSON', async t => {
  const c = await clientFor(t);
  c.responses.push({status: 201, body: {code: 'VAULT-42', token: 'host-token'}});
  assert.deepEqual(await c.module.createGame(), {code: 'VAULT-42', token: 'host-token'});
  assert.deepEqual(c.module.currentSeat(), {code: 'VAULT-42', token: 'host-token', host: true});
  assert.equal(c.requests[0].url, '/api/rooms');
  assert.equal(c.requests[0].method, 'POST');
  assert.equal(c.requests[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(c.requests[0].body), {});
});

test('audit client: joining normalises the room code and retains the player seat on refresh', async t => {
  const c = await clientFor(t);
  c.responses.push({status: 200, body: {code: 'VAULT-42', token: 'player-token', category: 'Prevent'}});
  await c.module.joinGame('  vault-42  ', 'Alice');
  assert.equal(c.requests[0].url, '/api/rooms/VAULT-42/join');
  assert.deepEqual(JSON.parse(c.requests[0].body), {name: 'Alice'});
  const refreshed = await import(new URL(`../src/net/client.mjs?audit=${++instance}`, import.meta.url));
  assert.deepEqual(refreshed.currentSeat(), {code: 'VAULT-42', token: 'player-token', category: 'Prevent', host: false});
});

test('audit client: room-code path characters are encoded before posting', async t => {
  const c = await clientFor(t);
  c.responses.push({status: 404, body: {error: 'No room'}});
  await c.module.joinGame('vault/../42', 'Alice');
  assert.equal(c.requests[0].url, '/api/rooms/VAULT%2F..%2F42/join');
});

test('audit client: rejected joins preserve an existing seat and show the server error', async t => {
  const c = await clientFor(t);
  c.values.set('zero-hour-seat', JSON.stringify({code: 'VAULT-10', token: 'old', host: false}));
  c.responses.push({status: 404, body: {error: 'No such room'}});
  assert.deepEqual(await c.module.joinGame('VAULT-99', 'Alice'), {error: 'No such room'});
  assert.equal(c.module.currentSeat().token, 'old');
});

test('audit client: disabled storage still supports joining, sending and clearing in the current tab', async t => {
  const c = await clientFor(t, {storageThrows: true});
  c.responses.push({status: 200, body: {code: 'VAULT-42', token: 'player-token', category: 'Prevent'}});
  await c.module.joinGame('VAULT-42', 'Alice');
  c.responses.push({status: 200, body: {ok: true}});
  assert.deepEqual(await c.module.send({type: 'select', id: 'P3'}), {ok: true});
  assert.equal(JSON.parse(c.requests[1].body).token, 'player-token');
  c.module.clearSeat();
  assert.deepEqual(c.module.currentSeat(), {});
});

test('audit client: corrupt JSON storage is handled as no saved seat', async t => {
  const c = await clientFor(t);
  c.values.set('zero-hour-seat', '{broken');
  assert.deepEqual(c.module.currentSeat(), {});
  assert.deepEqual(await c.module.send({type: 'reset'}), {error: 'Create or join a game first.'});
  assert.throws(() => c.module.listen(() => {}), /Create or join/);
  assert.equal(c.requests.length, 0);
});

test('audit client: send uses the saved token and returns a readable error for an HTTP refusal', async t => {
  const c = await clientFor(t);
  c.values.set('zero-hour-seat', JSON.stringify({code: 'VAULT-42', token: 'seat-token'}));
  c.responses.push({status: 409, body: {error: 'The choice is locked'}});
  const answer = {type: 'select', id: 'P3'};
  assert.deepEqual(await c.module.send(answer), {error: 'The choice is locked'});
  assert.equal(c.requests[0].url, '/api/rooms/VAULT-42/actions');
  assert.deepEqual(JSON.parse(c.requests[0].body), {token: 'seat-token', action: answer});
});

test('audit client: an HTTP refusal without a message still provides a status error', async t => {
  const c = await clientFor(t);
  c.responses.push({status: 503, body: {}});
  assert.deepEqual(await c.module.createGame(), {error: 'Request failed (503).'});
  assert.deepEqual(c.module.currentSeat(), {});
});

test('audit client: live messages reach the view callback and close shuts down the stream', async t => {
  const c = await clientFor(t);
  c.values.set('zero-hour-seat', JSON.stringify({code: 'VAULT-42', token: 'secret?&token'}));
  const received = [];
  const handle = c.module.listen(view => received.push(view));
  assert.equal(c.streams[0].url, '/api/rooms/VAULT-42/events?token=secret%3F%26token');
  const view = {code: 'VAULT-42', state: {stage: 'choose'}};
  c.streams[0].onmessage({data: JSON.stringify(view)});
  assert.deepEqual(received, [view]);
  handle.close();
  assert.equal(c.streams[0].closed, true);
});

test('audit client: temporary SSE disconnection lets the browser retry without opening a second stream', async t => {
  const c = await clientFor(t);
  c.values.set('zero-hour-seat', JSON.stringify({code: 'VAULT-42', token: 'seat'}));
  const notices = [];
  c.module.listen(() => {}, notice => notices.push(notice));
  c.streams[0].readyState = 0; // CONNECTING: native EventSource is already retrying.
  await c.streams[0].onerror();
  assert.equal(notices.length, 1);
  assert.match(notices[0], /Trying to reconnect/);
  assert.equal(c.requests.length, 0);
  assert.equal(c.streams.length, 1);
});

test('audit client: a permanently lost seat is cleared and reports onLost once', async t => {
  const c = await clientFor(t);
  c.values.set('zero-hour-seat', JSON.stringify({code: 'VAULT-42', token: 'seat'}));
  let lost = 0;
  c.module.listen(() => {}, () => {}, () => lost++);
  c.streams[0].readyState = 2;
  c.responses.push({status: 403}, {status: 403});
  await c.streams[0].onerror();
  await c.streams[0].onerror();
  assert.deepEqual(c.module.currentSeat(), {});
  assert.equal(lost, 1, 'the documented onLost callback must run once even if multiple errors arrive');
});

test('audit client: a closed connection with a valid seat retries after two seconds', async t => {
  const c = await clientFor(t);
  t.mock.timers.enable({apis: ['setTimeout']});
  c.values.set('zero-hour-seat', JSON.stringify({code: 'VAULT-42', token: 'seat'}));
  const handle = c.module.listen(() => {});
  t.after(() => handle.close());
  c.streams[0].readyState = 2;
  c.responses.push({status: 200});
  await c.streams[0].onerror();
  assert.equal(c.requests[0].method, 'HEAD');
  t.mock.timers.tick(1999);
  assert.equal(c.streams.length, 1);
  t.mock.timers.tick(1);
  assert.equal(c.streams.length, 2);
});

test('audit client: closing the handle prevents a scheduled reconnect', async t => {
  const c = await clientFor(t);
  t.mock.timers.enable({apis: ['setTimeout']});
  c.values.set('zero-hour-seat', JSON.stringify({code: 'VAULT-42', token: 'seat'}));
  const handle = c.module.listen(() => {});
  c.streams[0].readyState = 2;
  c.responses.push({status: 200});
  await c.streams[0].onerror();
  handle.close();
  t.mock.timers.tick(2000);
  assert.equal(c.streams.length, 1);
});

test('audit client: page exit suppresses lost-connection warnings and network probes', async t => {
  const c = await clientFor(t);
  c.values.set('zero-hour-seat', JSON.stringify({code: 'VAULT-42', token: 'seat'}));
  const notices = [];
  c.module.listen(() => {}, notice => notices.push(notice));
  c.listeners.get('pagehide')();
  c.streams[0].readyState = 2;
  await c.streams[0].onerror();
  assert.deepEqual(notices, []);
  assert.equal(c.requests.length, 0);
});
