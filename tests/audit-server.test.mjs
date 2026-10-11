// Regression audit of the multiplayer room and HTTP boundary.
// Uses real supplied data and an isolated server on an OS-assigned free port.
import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {CHECKPOINT_SECONDS, POINTS_PER_SECURE_ANSWER} from '../src/config.mjs';
import {loadGameData} from '../src/engine/loadData.mjs';
import {act, createRoom, joinRoom, viewFor} from '../src/server/rooms.mjs';

const game = await loadGameData();

function checkpointTeam() {
  const room = createRoom('AUDIT');
  const players = ['A', 'B', 'C'].map(name => joinRoom(room, name));
  for (const [i, id] of ['P3', 'D3', 'R1'].entries()) {
    act(room, players[i].token, {type: 'select', id}, game, 1000);
  }
  act(room, room.hostToken, {type: 'confirm'}, game, 1000);
  act(room, room.hostToken, {type: 'next'}, game, 1000);
  act(room, room.hostToken, {type: 'next'}, game, 1000);
  return {room, players};
}

test('audit room: an unanswered player still counts in the team average at timeout', () => {
  const {room, players} = checkpointTeam();
  const id = room.state.checkpoint.questionIds[0];
  const question = game.bank.questions.find(q => q.id === id);
  act(room, players[0].token, {type: 'answer', questionId: id, choice: question.correct}, game, 2000);
  act(room, room.hostToken, {type: 'timeout'}, game, 1000 + CHECKPOINT_SECONDS * 1000);
  assert.ok(Math.abs(room.state.behaviourPoints[0] - POINTS_PER_SECURE_ANSWER / 3) < 1e-9,
    'one secure answer and two unanswered players must earn one third of the question points');
});

test('audit room: malformed actions do not mutate a confirmed game', () => {
  const {room, players} = checkpointTeam();
  const original = structuredClone(room.state);
  for (const action of [null, [], {}, {type: 'answer'}, {type: 'answer', questionId: 'Q01', choice: 'Z'}]) {
    assert.throws(() => act(room, players[0].token, action, game, 2000), error => error.status === 400);
    assert.deepEqual(room.state, original);
  }
});

test('audit room: early timeout is ignored and answered questions survive genuine timeout', () => {
  const {room, players} = checkpointTeam();
  const id = room.state.checkpoint.questionIds[0];
  const question = game.bank.questions.find(q => q.id === id);
  act(room, players[0].token, {type: 'answer', questionId: id, choice: question.correct}, game, 2000);
  const answers = structuredClone(room.state.answers);
  act(room, room.hostToken, {type: 'timeout'}, game, 2001);
  assert.equal(room.state.checkpoint.expired, false);
  act(room, room.hostToken, {type: 'timeout'}, game, 1000 + CHECKPOINT_SECONDS * 1000);
  assert.equal(room.state.checkpoint.expired, true);
  assert.deepEqual(room.state.answers, answers);
  assert.throws(() => act(room, players[1].token, {type: 'answer', questionId: id, choice: question.correct}, game, 1000 + CHECKPOINT_SECONDS * 1000), /Time is up/);
});

test('audit room: reset keeps seat identities and removes every previous result and answer', () => {
  const {room, players} = checkpointTeam();
  const id = room.state.checkpoint.questionIds[0];
  act(room, players[0].token, {type: 'answer', questionId: id, choice: 'A'}, game, 2000);
  const seats = structuredClone(room.players);
  act(room, room.hostToken, {type: 'reset'}, game, 3000);
  assert.equal(room.state.stage, 'choose');
  assert.equal(room.state.phase, 0);
  assert.equal(room.state.checkpoint, null);
  assert.equal(room.state.result, null);
  assert.deepEqual(room.state.answers, []);
  assert.deepEqual(room.state.behaviourPoints, [0, 0, 0, 0]);
  assert.deepEqual(room.players, seats);
  for (const player of players) assert.equal(viewFor(room, player.token).you.id, player.id);
});

test('audit room: no seat from a different room can act or read a view', () => {
  const {room, players} = checkpointTeam();
  const other = createRoom('OTHER');
  for (const token of [room.hostToken, players[0].token]) {
    assert.equal(viewFor(other, token), null);
    assert.throws(() => act(other, token, {type: 'reset'}, game), error => error.status === 403);
  }
});

let base;
let child;
before(async () => {
  child = spawn(process.execPath, ['src/server/server.mjs'], {
    cwd: new URL('..', import.meta.url), env: {...process.env, PORT: '0'}, stdio: ['ignore', 'pipe', 'pipe'],
  });
  base = await new Promise((resolve, reject) => {
    let output = '';
    const deadline = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 10000);
    const fail = error => { clearTimeout(deadline); reject(error); };
    child.once('error', fail);
    child.once('exit', code => fail(new Error(`Server exited (${code}): ${output}`)));
    child.stderr.on('data', chunk => { output += chunk; });
    child.stdout.on('data', chunk => {
      output += chunk;
      const found = /http:\/\/127\.0\.0\.1:(\d+)\//.exec(output);
      if (found) { clearTimeout(deadline); resolve(`http://127.0.0.1:${found[1]}`); }
    });
  });
});
after(async () => {
  if (child && child.exitCode === null) {
    const stopped = once(child, 'exit');
    child.kill();
    await Promise.race([stopped, delay(5000, undefined, {ref: false})]);
  }
});

async function post(path, body) {
  const response = await fetch(base + path, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
  });
  return {status: response.status, body: await response.json()};
}
async function newRoom() {
  const result = await post('/api/rooms', {});
  assert.equal(result.status, 201);
  return result.body;
}
const action = (room, token, value) => post(`/api/rooms/${room.code}/actions`, {token, action: value});

async function stream(room, token) {
  const controller = new AbortController();
  const response = await fetch(`${base}/api/rooms/${room.code}/events?token=${encodeURIComponent(token)}`, {signal: controller.signal});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return {
    close() { controller.abort(); },
    async next(timeout = 8000) {
      const deadline = setTimeout(() => controller.abort(new Error('No event arrived before the deadline')), timeout);
      try {
        for (;;) {
          const separator = buffer.indexOf('\n\n');
          if (separator >= 0) {
            const frame = buffer.slice(0, separator);
            buffer = buffer.slice(separator + 2);
            const data = /^data: (.*)$/m.exec(frame);
            if (data) return JSON.parse(data[1]);
          } else {
            const chunk = await reader.read();
            if (chunk.done) throw new Error('Live stream ended before a view arrived');
            buffer += decoder.decode(chunk.value, {stream: true});
          }
        }
      } finally { clearTimeout(deadline); }
    },
  };
}

test('audit HTTP: root, host, player and module assets load with correct content types; HEAD has no body', async () => {
  for (const [path, contentType] of [['/', 'text/html'], ['/host.html', 'text/html'], ['/play.html', 'text/html'], ['/src/net/client.mjs', 'text/javascript']]) {
    const response = await fetch(base + path, {signal: AbortSignal.timeout(8000)});
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), new RegExp(contentType));
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok((await response.text()).length > 0);
  }
  const head = await fetch(base + '/', {method: 'HEAD'});
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('audit HTTP: unknown files/routes and unsupported file methods return controlled errors', async () => {
  assert.equal((await fetch(base + '/does-not-exist.html')).status, 404);
  assert.equal((await fetch(base + '/api/unknown')).status, 404);
  assert.equal((await fetch(base + '/', {method: 'DELETE'})).status, 405);
});

test('audit HTTP: Git internals must not be served to a game participant', async () => {
  const response = await fetch(base + '/.git/HEAD', {signal: AbortSignal.timeout(8000)});
  await response.text();
  assert.ok([403, 404].includes(response.status), `Expected 403/404; received ${response.status}`);
});

test('audit HTTP: invalid JSON receives 400 and oversized JSON receives 413', async () => {
  const malformed = await fetch(base + '/api/rooms', {method: 'POST', body: '{', signal: AbortSignal.timeout(8000)});
  assert.equal(malformed.status, 400);
  assert.match((await malformed.json()).error, /valid JSON/);
  const oversized = await fetch(base + '/api/rooms', {method: 'POST', body: JSON.stringify({padding: 'x'.repeat(9000)}), signal: AbortSignal.timeout(8000)});
  assert.equal(oversized.status, 413);
});

test('audit HTTP: a null join body is a client error, not an internal server error', async () => {
  const room = await newRoom();
  assert.equal((await post(`/api/rooms/${room.code}/join`, null)).status, 400);
});

test('audit HTTP: a null actions body is a client error, not an internal server error', async () => {
  const room = await newRoom();
  assert.equal((await post(`/api/rooms/${room.code}/actions`, null)).status, 400);
});

test('audit HTTP: a non-string player name is rejected before creating a seat', async () => {
  const room = await newRoom();
  assert.equal((await post(`/api/rooms/${room.code}/join`, {name: {anything: true}})).status, 400);
});

test('audit HTTP: roles are enforced and a seat token cannot be used in another room', async () => {
  const room = await newRoom();
  const other = await newRoom();
  const player = (await post(`/api/rooms/${room.code}/join`, {name: 'Audit player'})).body;
  assert.equal((await action(room, player.token, {type: 'select', id: 'D3'})).status, 403);
  assert.equal((await action(room, player.token, {type: 'reset'})).status, 403);
  assert.equal((await action(room, room.token, {type: 'select', id: 'P3'})).status, 403);
  assert.equal((await action(other, player.token, {type: 'select', id: 'P3'})).status, 403);
  assert.equal((await action(other, room.token, {type: 'reset'})).status, 403);
});

test('audit SSE: host and player receive the same live update without reload or token disclosure', async t => {
  const room = await newRoom();
  const player = (await post(`/api/rooms/${room.code}/join`, {name: 'Audit player'})).body;
  const hostEvents = await stream(room, room.token);
  const playerEvents = await stream(room, player.token);
  t.after(() => { hostEvents.close(); playerEvents.close(); });
  await hostEvents.next();
  await playerEvents.next();
  assert.equal((await action(room, player.token, {type: 'select', id: 'P3'})).status, 200);
  // Views also arrive when someone comes online, so wait for the one that shows the purchase.
  const purchase = async events => { for (;;) { const view = await events.next(); if (view.state.selected.length) return view; } };
  const [hostView, playerView] = await Promise.all([purchase(hostEvents), purchase(playerEvents)]);
  assert.deepEqual(hostView.state.selected, ['P3']);
  assert.deepEqual(hostView.state, playerView.state);
  assert.equal(hostView.you.host, true);
  assert.equal(playerView.you.host, false);
  for (const view of [hostView, playerView]) {
    assert.ok(Number.isFinite(view.serverNow));
    const text = JSON.stringify(view);
    assert.ok(!text.includes(room.token));
    assert.ok(!text.includes(player.token));
  }
});

test('audit HTTP: a shared game completes all four phases, scores independently and resets with seats preserved', async t => {
  const room = await newRoom();
  const players = [];
  for (const name of ['Alice', 'Bob', 'Cam']) players.push((await post(`/api/rooms/${room.code}/join`, {name})).body);
  for (const [i, id] of ['P3', 'D3', 'R1'].entries()) assert.equal((await action(room, players[i].token, {type: 'select', id})).status, 200);
  assert.equal((await action(room, room.token, {type: 'confirm'})).status, 200);
  const events = await stream(room, room.token);
  t.after(() => events.close());
  let view = await events.next();
  const initialControlResult = structuredClone(view.state.result);
  for (let phase = 0; phase < 4; phase++) {
    assert.equal(view.state.phase, phase);
    assert.equal(view.state.stage, 'story');
    for (const stage of ['reveal', 'checkpoint']) {
      assert.equal((await action(room, room.token, {type: 'next'})).status, 200);
      view = await events.next();
      assert.equal(view.state.stage, stage);
    }
    assert.equal(view.state.checkpoint.questionIds.length, 4);
    for (const questionId of view.state.checkpoint.questionIds) {
      const question = game.bank.questions.find(q => q.id === questionId);
      const wrong = ['A', 'B', 'C', 'D'].find(choice => choice !== question.correct);
      for (const [i, player] of players.entries()) {
        assert.equal((await action(room, player.token, {type: 'answer', questionId, choice: i === 0 ? question.correct : wrong})).status, 200);
        view = await events.next();
      }
    }
    assert.ok(Math.abs(view.state.behaviourPoints[phase] - 4 * POINTS_PER_SECURE_ANSWER / 3) < 1e-9);
    assert.deepEqual(view.state.result, initialControlResult);
    assert.equal((await action(room, room.token, {type: 'next'})).status, 200);
    view = await events.next();
  }
  assert.equal(view.state.stage, 'outcome');
  assert.equal(view.state.answers.length, 48);
  assert.equal((await action(room, room.token, {type: 'reset'})).status, 200);
  view = await events.next();
  assert.equal(view.state.stage, 'choose');
  assert.equal(view.players.length, 3);
  assert.deepEqual(view.state.answers, []);
  assert.equal(view.state.result, null);
});

// Deliberately real time: verifies the server's one-second expiry sweep, rather than
// merely calling timeout ourselves. This adds approximately two minutes to the suite.
test('audit SSE: the server automatically expires a checkpoint after its configured real-time limit', {timeout: CHECKPOINT_SECONDS * 1000 + 20000}, async t => {
  const room = await newRoom();
  for (const [i, name] of ['A', 'B', 'C'].entries()) {
    const joined = (await post(`/api/rooms/${room.code}/join`, {name})).body;
    assert.equal((await action(room, joined.token, {type: 'select', id: ['P3', 'D3', 'R1'][i]})).status, 200);
  }
  await action(room, room.token, {type: 'confirm'});
  await action(room, room.token, {type: 'next'});
  await action(room, room.token, {type: 'next'});
  const events = await stream(room, room.token);
  t.after(() => events.close());
  const initial = await events.next();
  assert.equal(initial.state.checkpoint.expired, false);
  const expired = await events.next(CHECKPOINT_SECONDS * 1000 + 10000);
  assert.equal(expired.state.checkpoint.expired, true);
  assert.ok(expired.serverNow - initial.state.checkpoint.timer.startedAt >= CHECKPOINT_SECONDS * 1000);
  assert.deepEqual(expired.state.behaviourPoints, [0, 0, 0, 0]);
  assert.deepEqual(expired.state.answers, []);
});
