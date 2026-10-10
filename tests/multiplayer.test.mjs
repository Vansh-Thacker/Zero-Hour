// Tests for multiplayer: the room rules (src/server/rooms.mjs) and the real server
// (src/server/server.mjs). Hard cases from 3-stretch/multiplayer.md and TEAM_PLAN.md:
// two players over budget at once, the same control twice, a control outside the player's
// role, a refresh, joining after Confirm, a wrong room code, and the shared checkpoint timer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {scoreSelection} from '../1-foundation/starter/controls.mjs';
import {CHECKPOINT_SECONDS, POINTS_PER_SECURE_ANSWER} from '../src/config.mjs';
import {loadGameData} from '../src/engine/loadData.mjs';
import {act, createRoom, joinRoom, viewFor} from '../src/server/rooms.mjs';

const game = await loadGameData();
const {data} = game;
const cost = id => data.controls.find(c => c.id === id).cost;
const total = ids => ids.reduce((sum, id) => sum + cost(id), 0);
const buy = id => ({type: 'select', id});

// Ana (Prevent), Ben (Detect), Cal (Respond): roles go out in that order.
function team() {
  const room = createRoom('VAULT-42');
  const [ana, ben, cal] = ['Ana', 'Ben', 'Cal'].map(name => joinRoom(room, name));
  return {room, ana, ben, cal, host: room.hostToken};
}
// A team that has bought P3, D3 and R1 and been confirmed by the host.
function confirmedTeam() {
  const t = team();
  for (const [p, id] of [[t.ana, 'P3'], [t.ben, 'D3'], [t.cal, 'R1']]) act(t.room, p.token, buy(id), game);
  act(t.room, t.host, {type: 'confirm'}, game);
  return t;
}
// Move a confirmed team on to phase 1's checkpoint, started at time `at`.
function atCheckpoint(at = 1_000) {
  const t = confirmedTeam();
  act(t.room, t.host, {type: 'next'}, game, at);     // story -> reveal
  act(t.room, t.host, {type: 'next'}, game, at);     // reveal -> checkpoint
  return t;
}

// ================================================================ joining and seats

test('roles are handed out in turn: Prevent, Detect, Respond, then Prevent again', () => {
  const room = createRoom('VAULT-10');
  assert.deepEqual(['A', 'B', 'C', 'D'].map(name => joinRoom(room, name).category), ['Prevent', 'Detect', 'Respond', 'Prevent']);
});

test('a name is needed to join, and long names are cut to 24 characters', () => {
  const room = createRoom('VAULT-11');
  assert.throws(() => joinRoom(room, '   '), err => err.status === 400);
  assert.equal(joinRoom(room, 'x'.repeat(40)).name.length, 24);
});

test("a view never contains anyone's token", () => {
  const {room, ana, ben, cal, host} = team();
  for (const token of [ana.token, host]) {
    const text = JSON.stringify(viewFor(room, token));
    for (const secret of [ana.token, ben.token, cal.token, host]) assert.ok(!text.includes(secret));
  }
});

test('someone who is not in the game gets no view and cannot act', () => {
  const {room} = team();
  assert.equal(viewFor(room, 'stranger'), null);
  assert.throws(() => act(room, 'stranger', buy('P3'), game), err => err.status === 403);
});

// ================================================================ shared choosing

test('every player and the host see the same basket', () => {
  const {room, ana, ben, cal, host} = team();
  act(room, ana.token, buy('P3'), game);
  act(room, ben.token, buy('D3'), game);
  for (const token of [ana.token, ben.token, cal.token, host]) assert.deepEqual(viewFor(room, token).state.selected, ['P3', 'D3']);
});

test('a player can buy and remove controls in their own role', () => {
  const {room, ben} = team();
  act(room, ben.token, buy('D4'), game);
  assert.deepEqual(room.state.selected, ['D4']);
  act(room, ben.token, {type: 'deselect', id: 'D4'}, game);
  assert.deepEqual(room.state.selected, []);
});

test('a player cannot buy a control outside their role, and nothing changes', () => {
  const {room, ana} = team();
  assert.throws(() => act(room, ana.token, buy('D3'), game), err => err.status === 403 && /Only a Detect player/.test(err.message));
  assert.deepEqual(room.state.selected, []);
});

test("a player cannot remove another role's control", () => {
  const {room, ana, ben} = team();
  act(room, ben.token, buy('D3'), game);
  assert.throws(() => act(room, ana.token, {type: 'deselect', id: 'D3'}, game), err => err.status === 403);
  assert.deepEqual(room.state.selected, ['D3']);
});

test('the host cannot buy controls', () => {
  const {room, host} = team();
  assert.throws(() => act(room, host, buy('P3'), game), err => err.status === 403);
});

test('the same control chosen twice (two Prevent phones) is only added once', () => {
  const room = createRoom('VAULT-12');
  const [ana, , , dev] = ['Ana', 'Ben', 'Cal', 'Dev'].map(name => joinRoom(room, name)); // Ana and Dev are both Prevent
  act(room, ana.token, buy('P3'), game);
  act(room, dev.token, buy('P3'), game);
  assert.deepEqual(room.state.selected, ['P3']);
});

test('a purchase over the shared budget is refused with the engine message, and nothing changes', () => {
  const {room, ana, ben, cal} = team();
  for (const [p, id] of [[ana, 'P2'], [ana, 'P7'], [ben, 'D4'], [cal, 'R2']]) act(room, p.token, buy(id), game); // £2,900,000
  assert.throws(() => act(room, ben.token, buy('D1'), game), err => err.status === 409 && /£100,000 is left/.test(err.message));
  assert.equal(total(room.state.selected), 2_900_000);
  assert.equal(room.state.error, null, 'a refusal is never stored in the shared state');
});

test('two players spending the last £100,000: the first goes through, the second is refused', () => {
  const {room, ana, ben, cal} = team();
  for (const [p, id] of [[ana, 'P2'], [ana, 'P7'], [ben, 'D4'], [cal, 'R2']]) act(room, p.token, buy(id), game);
  act(room, ben.token, buy('D3'), game);
  assert.throws(() => act(room, cal.token, buy('R6'), game), err => err.status === 409);
  assert.ok(room.state.selected.includes('D3') && !room.state.selected.includes('R6'));
  assert.equal(total(room.state.selected), data.budget);
});

test('refused attempts appear in the shared log, so everyone sees why', () => {
  const {room, ana} = team();
  assert.throws(() => act(room, ana.token, buy('D3'), game));
  const [latest] = viewFor(room, ana.token).log;
  assert.equal(latest.ok, false);
  assert.match(latest.text, /^Ana: Only a Detect player/);
});

// ================================================================ confirm and the lock

test('only the host can confirm', () => {
  const {room, ana} = team();
  assert.throws(() => act(room, ana.token, {type: 'confirm'}, game), err => err.status === 403);
});

test("confirm is refused while a category is missing, with the scoring module's message", () => {
  const {room, ana, ben, host} = team();
  act(room, ana.token, buy('P3'), game);
  act(room, ben.token, buy('D3'), game);
  assert.throws(() => act(room, host, {type: 'confirm'}, game), /Missing: Respond/);
  assert.equal(room.state.confirmed, false);
});

test('a confirmed shared game scores exactly what the scoring module gives', () => {
  const {room} = confirmedTeam();
  assert.equal(room.state.confirmed, true);
  assert.equal(room.state.result.total, scoreSelection(data, ['P3', 'D3', 'R1']).total);
});

test('nothing can be bought or removed after Confirm', () => {
  const {room, ana} = confirmedTeam();
  assert.throws(() => act(room, ana.token, buy('P4'), game), err => err.status === 409);
  assert.throws(() => act(room, ana.token, {type: 'deselect', id: 'P3'}, game), err => err.status === 409);
  assert.deepEqual(room.state.selected, ['P3', 'D3', 'R1']);
});

test('someone joining after Confirm sees the locked choice and cannot change it', () => {
  const {room} = confirmedTeam();
  const late = joinRoom(room, 'Dev');
  assert.equal(viewFor(room, late.token).state.confirmed, true);
  assert.throws(() => act(room, late.token, buy('P4'), game), err => err.status === 409);
});

// ================================================================ running the game

test("players cannot use the host's controls", () => {
  const {room, ana} = confirmedTeam();
  for (const type of ['next', 'pause', 'resume', 'reset']) {
    assert.throws(() => act(room, ana.token, {type}, game), err => err.status === 403, type);
  }
});

test('the host moves the whole room through story, reveal and checkpoint', () => {
  const {room, ana} = atCheckpoint();
  assert.equal(room.state.stage, 'checkpoint');
  assert.equal(viewFor(room, ana.token).state.stage, 'checkpoint');
});

test('each player answers on their own phone, and the team scores the average', () => {
  const {room, ana, ben, cal} = atCheckpoint();
  const [qid] = room.state.checkpoint.questionIds;
  const question = game.bank.questions.find(q => q.id === qid);
  const wrong = ['A', 'B', 'C', 'D'].find(x => x !== question.correct);
  act(room, ana.token, {type: 'answer', questionId: qid, choice: question.correct}, game, 2_000);
  act(room, ben.token, {type: 'answer', questionId: qid, choice: question.correct}, game, 2_000);
  act(room, cal.token, {type: 'answer', questionId: qid, choice: wrong}, game, 2_000);
  assert.equal(room.state.answers.length, 3);
  assert.ok(Math.abs(room.state.behaviourPoints[0] - POINTS_PER_SECURE_ANSWER * 2 / 3) < 1e-9);
});

test('a player cannot answer the same question twice', () => {
  const {room, ana} = atCheckpoint();
  const [qid] = room.state.checkpoint.questionIds;
  act(room, ana.token, {type: 'answer', questionId: qid, choice: 'A'}, game, 2_000);
  assert.throws(() => act(room, ana.token, {type: 'answer', questionId: qid, choice: 'B'}, game, 3_000), err => err.status === 409);
  assert.equal(room.state.answers.length, 1);
});

test("the server's clock decides: an answer after time is up scores nothing", () => {
  const {room, ana} = atCheckpoint(1_000);
  const [qid] = room.state.checkpoint.questionIds;
  const late = 1_000 + CHECKPOINT_SECONDS * 1000 + 1;
  assert.throws(() => act(room, ana.token, {type: 'answer', questionId: qid, choice: 'A'}, game, late), /Time is up/);
  assert.equal(room.state.answers.length, 0);
});

test('while the host has paused, the shared clock stops for everyone', () => {
  const {room, host, ana} = atCheckpoint(1_000);
  act(room, host, {type: 'pause'}, game, 11_000);
  act(room, host, {type: 'resume'}, game, 611_000); // ten minutes later
  const [qid] = room.state.checkpoint.questionIds;
  act(room, ana.token, {type: 'answer', questionId: qid, choice: 'A'}, game, 612_000); // still in time
  assert.equal(room.state.answers.length, 1);
});

test('someone joining after Confirm can still answer the questions', () => {
  const {room} = atCheckpoint();
  const late = joinRoom(room, 'Dev');
  const [qid] = room.state.checkpoint.questionIds;
  act(room, late.token, {type: 'answer', questionId: qid, choice: 'A'}, game, 2_000);
  assert.equal(room.state.answers[0].player, late.id);
});

test('the host cannot answer for the players', () => {
  const {room, host} = atCheckpoint();
  const [qid] = room.state.checkpoint.questionIds;
  assert.throws(() => act(room, host, {type: 'answer', questionId: qid, choice: 'A'}, game, 2_000), err => err.status === 403);
});

test('a device cannot pretend to be another player or set its own time', () => {
  const {room, ana, ben} = atCheckpoint(1_000);
  const [qid] = room.state.checkpoint.questionIds;
  act(room, ana.token, {type: 'answer', questionId: qid, choice: 'A', player: ben.id, now: 0}, game, 5_000);
  assert.equal(room.state.answers[0].player, ana.id);
});

test('an unknown action or control is refused', () => {
  const {room, ana} = team();
  assert.throws(() => act(room, ana.token, {type: 'hack'}, game), err => err.status === 400);
  assert.throws(() => act(room, ana.token, buy('P99'), game), err => err.status === 400);
});

test('reset by the host starts a fresh shared game and keeps the players', () => {
  const {room, host} = confirmedTeam();
  act(room, host, {type: 'reset'}, game);
  assert.deepEqual(room.state.selected, []);
  assert.equal(room.state.confirmed, false);
  assert.equal(room.players.length, 3);
});

// ================================================================ the real server

/** Start the multiplayer server on a free port; resolves to its base URL. */
function startServer(t) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/server/server.mjs'], {
      cwd: new URL('..', import.meta.url), env: {...process.env, PORT: '0'}, stdio: ['ignore', 'pipe', 'pipe'],
    });
    t.after(() => child.kill());
    let out = '';
    child.stdout.on('data', chunk => {
      out += chunk;
      const m = /http:\/\/127\.0\.0\.1:(\d+)\//.exec(out);
      if (m) resolve(`http://127.0.0.1:${m[1]}`);
    });
    child.stderr.on('data', chunk => { out += chunk; });
    child.on('exit', code => reject(new Error(`server exited (${code}): ${out}`)));
  });
}

const postJson = (url, body) =>
  fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})
    .then(async res => ({status: res.status, body: await res.json()}));

/** Open the live stream with a seat's token and return the first view it sends. */
async function firstView(base, code, token) {
  const controller = new AbortController();
  const res = await fetch(`${base}/api/rooms/${code}/events?token=${token}`, {signal: controller.signal});
  if (res.status !== 200) { controller.abort(); return {status: res.status}; }
  const reader = res.body.getReader();
  let text = '';
  while (!text.includes('\n\n')) text += new TextDecoder().decode((await reader.read()).value);
  controller.abort();
  return {status: 200, view: JSON.parse(/^data: (.*)$/m.exec(text)[1])};
}

test('server: a wrong room code is refused with a readable message', async t => {
  const base = await startServer(t);
  const res = await postJson(`${base}/api/rooms/VAULT-00/join`, {name: 'Ben'});
  assert.equal(res.status, 404);
  assert.match(res.body.error, /No game with code VAULT-00/);
});

test('server: two players spending the last £100,000 at the same moment: only one goes through', async t => {
  const base = await startServer(t);
  const {body: {code}} = await postJson(`${base}/api/rooms`, {});
  const joined = [];
  for (const name of ['Ana', 'Ben', 'Cal']) joined.push((await postJson(`${base}/api/rooms/${code}/join`, {name})).body);
  const byRole = Object.fromEntries(joined.map(p => [p.category, p.token]));
  const actAs = (role, action) => postJson(`${base}/api/rooms/${code}/actions`, {token: byRole[role], action});
  for (const [role, id] of [['Prevent', 'P2'], ['Prevent', 'P7'], ['Detect', 'D4'], ['Respond', 'R2']]) {
    assert.equal((await actAs(role, buy(id))).status, 200);
  }
  // Both requests leave at once. Exactly one is accepted.
  const results = await Promise.all([actAs('Detect', buy('D3')), actAs('Respond', buy('R6'))]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const {view} = await firstView(base, code, byRole.Prevent);
  assert.equal(total(view.state.selected), data.budget);
});

test('server: a phone that refreshes or reconnects with its seat sees the game as it is now', async t => {
  const base = await startServer(t);
  const {body: {code}} = await postJson(`${base}/api/rooms`, {});
  const ana = (await postJson(`${base}/api/rooms/${code}/join`, {name: 'Ana'})).body;
  const ben = (await postJson(`${base}/api/rooms/${code}/join`, {name: 'Ben'})).body;
  await firstView(base, code, ana.token);                                  // Ana connects, then drops out
  await postJson(`${base}/api/rooms/${code}/actions`, {token: ben.token, action: buy('D3')});
  const {view} = await firstView(base, code, ana.token);                   // Ana comes back with her seat
  assert.deepEqual(view.state.selected, ['D3']);
  assert.equal(view.players.length, 2, 'reconnecting does not add a second seat');
});

test('server: a seat check says whether a seat is still in the game', async t => {
  const base = await startServer(t);
  const {body: {code, token}} = await postJson(`${base}/api/rooms`, {});
  const head = tok => fetch(`${base}/api/rooms/${code}/events?token=${tok}`, {method: 'HEAD'}).then(r => r.status);
  assert.equal(await head(token), 200);
  assert.equal(await head('stranger'), 403);
  assert.equal((await fetch(`${base}/api/rooms/VAULT-00/events?token=x`, {method: 'HEAD'})).status, 404);
});

test('server: an unknown seat cannot listen or act', async t => {
  const base = await startServer(t);
  const {body: {code}} = await postJson(`${base}/api/rooms`, {});
  assert.equal((await firstView(base, code, 'stranger')).status, 403);
  assert.equal((await postJson(`${base}/api/rooms/${code}/actions`, {token: 'stranger', action: buy('P3')})).status, 403);
});
