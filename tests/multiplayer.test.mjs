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

async function httpTeam(base) {
  const {status, body: host} = await postJson(`${base}/api/rooms`, {});
  assert.equal(status, 201);
  const players = [];
  for (const name of ['Ana', 'Ben', 'Cal']) {
    const joined = await postJson(`${base}/api/rooms/${host.code}/join`, {name});
    assert.equal(joined.status, 200);
    players.push(joined.body);
  }
  const action = (token, request) => postJson(`${base}/api/rooms/${host.code}/actions`, {token, action: request});
  return {host, players, action};
}

async function joinHttpTeam(base, code, teamName, names) {
  const players = [];
  for (const name of names) {
    const joined = await postJson(`${base}/api/rooms/${code}/join`, {name, team: teamName});
    assert.equal(joined.status, 200);
    assert.equal(joined.body.team, teamName);
    players.push(joined.body);
  }
  return players;
}

test('server: the teams endpoint reports names, player counts and start status', async t => {
  const base = await startServer(t);
  const {body: host} = await postJson(`${base}/api/rooms`, {});
  const teamsUrl = `${base}/api/rooms/${host.code}/teams`;
  const empty = await fetch(teamsUrl).then(r => r.json());
  assert.deepEqual(empty.teams, []);
  assert.equal(empty.started, false);
  assert.ok(empty.maxTeams >= 2);
  await joinHttpTeam(base, host.code, 'Red', ['Ana', 'Ben']);
  await joinHttpTeam(base, host.code, 'Blue', ['Cal']);
  const waiting = await fetch(teamsUrl).then(r => r.json());
  assert.deepEqual(waiting.teams, [{name: 'Red', players: 2}, {name: 'Blue', players: 1}]);
  assert.equal(waiting.started, false);
});

test('server: two teams in one room have separate budgets and baskets', async t => {
  const base = await startServer(t);
  const {body: host} = await postJson(`${base}/api/rooms`, {});
  const [red] = await joinHttpTeam(base, host.code, 'Red', ['Ana', 'Ben']);
  const [blue] = await joinHttpTeam(base, host.code, 'Blue', ['Cal', 'Dev']);
  const url = `${base}/api/rooms/${host.code}/actions`;
  assert.equal((await postJson(url, {token: red.token, action: buy('P2')})).status, 200);
  const redView = (await firstView(base, host.code, red.token)).view;
  const blueView = (await firstView(base, host.code, blue.token)).view;
  const hostView = (await firstView(base, host.code, host.token)).view;
  assert.deepEqual(redView.state.selected, ['P2']);
  assert.deepEqual(blueView.state.selected, []);
  assert.equal(redView.team.name, 'Red');
  assert.equal(blueView.team.name, 'Blue');
  assert.deepEqual(hostView.teams.map(team => [team.name, team.state.selected]), [['Red', ['P2']], ['Blue', []]]);
  assert.doesNotMatch(JSON.stringify(hostView), new RegExp(red.token));
});

test('server: confirming waits for two players on every team, then locks both plans', async t => {
  const base = await startServer(t);
  const {body: host} = await postJson(`${base}/api/rooms`, {});
  await joinHttpTeam(base, host.code, 'Red', ['Ana', 'Ben']);
  await joinHttpTeam(base, host.code, 'Blue', ['Cal']);
  const url = `${base}/api/rooms/${host.code}/actions`;
  const early = await postJson(url, {token: host.token, action: {type: 'confirm'}});
  assert.equal(early.status, 409);
  assert.match(early.body.error, /Blue needs 1 more player/);
  assert.equal((await firstView(base, host.code, host.token)).view.state.confirmed, false);
  await joinHttpTeam(base, host.code, 'Blue', ['Dev']);
  assert.equal((await postJson(url, {token: host.token, action: {type: 'confirm'}})).status, 200);
  const view = (await firstView(base, host.code, host.token)).view;
  assert.equal(view.state.stage, 'story');
  assert.ok(view.teams.every(team => team.state.confirmed));
  assert.equal((await fetch(`${base}/api/rooms/${host.code}/teams`).then(r => r.json())).started, true);
});

test('server: after starting, players may join an existing team but not create a new one', async t => {
  const base = await startServer(t);
  const {body: host} = await postJson(`${base}/api/rooms`, {});
  await joinHttpTeam(base, host.code, 'Red', ['Ana', 'Ben']);
  const actionUrl = `${base}/api/rooms/${host.code}/actions`;
  assert.equal((await postJson(actionUrl, {token: host.token, action: {type: 'confirm'}})).status, 200);
  const rejected = await postJson(`${base}/api/rooms/${host.code}/join`, {name: 'Late', team: 'Blue'});
  assert.equal(rejected.status, 409);
  assert.match(rejected.body.error, /new teams can't join/);
  const accepted = await postJson(`${base}/api/rooms/${host.code}/join`, {name: 'Late', team: 'Red'});
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.team, 'Red');
});

test('server: a two-player team lets its first player select Respond controls', async t => {
  const base = await startServer(t);
  const {body: host} = await postJson(`${base}/api/rooms`, {});
  const [first, second] = await joinHttpTeam(base, host.code, 'Red', ['Ana', 'Ben']);
  const url = `${base}/api/rooms/${host.code}/actions`;
  assert.equal((await postJson(url, {token: first.token, action: buy('R1')})).status, 200);
  assert.equal((await postJson(url, {token: second.token, action: buy('R2')})).status, 403);
  const view = (await firstView(base, host.code, first.token)).view;
  assert.deepEqual(view.you.categories, ['Prevent', 'Respond']);
  assert.deepEqual(view.state.selected, ['R1']);
});

test('server: two teams share the checkpoint clock but keep their answers and scores separate', async t => {
  const base = await startServer(t);
  const {body: host} = await postJson(`${base}/api/rooms`, {});
  const red = await joinHttpTeam(base, host.code, 'Red', ['Ana', 'Ben']);
  const blue = await joinHttpTeam(base, host.code, 'Blue', ['Cal', 'Dev']);
  const url = `${base}/api/rooms/${host.code}/actions`;
  for (const type of ['confirm', 'next', 'next']) {
    assert.equal((await postJson(url, {token: host.token, action: {type}})).status, 200);
  }
  const redBefore = (await firstView(base, host.code, red[0].token)).view;
  const blueBefore = (await firstView(base, host.code, blue[0].token)).view;
  assert.equal(redBefore.state.stage, 'checkpoint');
  assert.equal(blueBefore.state.stage, 'checkpoint');
  assert.deepEqual(redBefore.state.checkpoint, blueBefore.state.checkpoint);
  const [questionId] = redBefore.state.checkpoint.questionIds;
  const correct = game.bank.questions.find(q => q.id === questionId).correct;
  const wrong = ['A', 'B', 'C', 'D'].find(choice => choice !== correct);
  assert.equal((await postJson(url, {
    token: red[0].token, action: {type: 'answer', questionId, choice: correct},
  })).status, 200);
  assert.equal((await postJson(url, {
    token: blue[0].token, action: {type: 'answer', questionId, choice: wrong},
  })).status, 200);
  const redAfter = (await firstView(base, host.code, red[0].token)).view;
  const blueAfter = (await firstView(base, host.code, blue[0].token)).view;
  assert.equal(redAfter.state.answers.length, 1);
  assert.equal(blueAfter.state.answers.length, 1);
  assert.equal(redAfter.state.behaviourPoints[0], POINTS_PER_SECURE_ANSWER / 2);
  assert.equal(blueAfter.state.behaviourPoints[0], 0);
  assert.deepEqual(redAfter.teams.map(team => team.state.behaviourPoints[0]), [POINTS_PER_SECURE_ANSWER / 2, 0]);
});

test('server: room creation returns a unique code and host seat', async t => {
  const base = await startServer(t);
  const first = await postJson(`${base}/api/rooms`, {});
  const second = await postJson(`${base}/api/rooms`, {});
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.match(first.body.code, /^VAULT-\d{2}$/);
  assert.notEqual(first.body.code, second.body.code);
  assert.ok(first.body.token);
  assert.notEqual(first.body.token, second.body.token);
});

test('server: joining assigns roles in order and refuses a blank name', async t => {
  const base = await startServer(t);
  const {body: host} = await postJson(`${base}/api/rooms`, {});
  const missing = await postJson(`${base}/api/rooms/${host.code}/join`, {name: '   '});
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /name/);
  const roles = [];
  for (const name of ['Ana', 'Ben', 'Cal', 'Dev']) {
    const joined = await postJson(`${base}/api/rooms/${host.code}/join`, {name});
    assert.equal(joined.status, 200);
    roles.push(joined.body.category);
    assert.ok(joined.body.token);
  }
  assert.deepEqual(roles, ['Prevent', 'Detect', 'Respond', 'Prevent']);
});

test('server: players cannot use host actions and host cannot answer', async t => {
  const base = await startServer(t);
  const {host, players, action} = await httpTeam(base);
  assert.equal((await action(players[0].token, {type: 'confirm'})).status, 403);
  assert.equal((await action(players[0].token, {type: 'next'})).status, 403);
  assert.equal((await action(players[0].token, {type: 'reset'})).status, 403);
  assert.equal((await action(host.token, {type: 'answer', questionId: 'Q01', choice: 'A'})).status, 403);
  assert.equal((await firstView(base, host.code, host.token)).view.state.stage, 'choose');
});

test('server: host confirmation locks purchases and advances every seat to a checkpoint', async t => {
  const base = await startServer(t);
  const {host, players, action} = await httpTeam(base);
  for (const [player, id] of players.map((player, i) => [player, ['P3', 'D3', 'R1'][i]])) {
    assert.equal((await action(player.token, buy(id))).status, 200);
  }
  assert.equal((await action(host.token, {type: 'confirm'})).status, 200);
  assert.equal((await action(players[0].token, buy('P4'))).status, 409);
  assert.equal((await action(host.token, {type: 'next'})).status, 200);
  const beforeCheckpoint = Date.now();
  assert.equal((await action(host.token, {type: 'next', now: 0})).status, 200);
  const afterCheckpoint = Date.now();
  for (const token of [host.token, ...players.map(player => player.token)]) {
    const {view} = await firstView(base, host.code, token);
    assert.equal(view.state.stage, 'checkpoint');
    assert.deepEqual(view.state.selected, ['P3', 'D3', 'R1']);
    assert.equal(view.state.checkpoint.questionIds.length, 4);
    assert.ok(view.state.checkpoint.timer.startedAt >= beforeCheckpoint);
    assert.ok(view.state.checkpoint.timer.startedAt <= afterCheckpoint);
  }
});

test('server: an answer uses the seat ID and rejects a second answer', async t => {
  const base = await startServer(t);
  const {host, players, action} = await httpTeam(base);
  for (let i = 0; i < players.length; i++) {
    assert.equal((await action(players[i].token, buy(['P3', 'D3', 'R1'][i]))).status, 200);
  }
  for (const type of ['confirm', 'next', 'next']) assert.equal((await action(host.token, {type})).status, 200);
  const before = (await firstView(base, host.code, host.token)).view;
  const [questionId] = before.state.checkpoint.questionIds;
  assert.equal((await action(players[0].token, {
    type: 'answer', questionId, choice: 'A', player: 'fake-player', now: 0,
  })).status, 200);
  assert.equal((await action(players[0].token, {type: 'answer', questionId, choice: 'B'})).status, 409);
  const after = (await firstView(base, host.code, host.token)).view;
  assert.equal(after.state.answers.length, 1);
  assert.equal(after.state.answers[0].player, after.players[0].id);
});

test('server: a player can remove their control before confirmation', async t => {
  const base = await startServer(t);
  const {host, players, action} = await httpTeam(base);
  assert.equal((await action(players[0].token, buy('P3'))).status, 200);
  assert.equal((await action(players[0].token, {type: 'deselect', id: 'P3'})).status, 200);
  assert.deepEqual((await firstView(base, host.code, host.token)).view.state.selected, []);
});

test('server: only the host can pause and resume the shared checkpoint clock', async t => {
  const base = await startServer(t);
  const {host, players, action} = await httpTeam(base);
  for (let i = 0; i < players.length; i++) {
    assert.equal((await action(players[i].token, buy(['P3', 'D3', 'R1'][i]))).status, 200);
  }
  for (const type of ['confirm', 'next', 'next']) assert.equal((await action(host.token, {type})).status, 200);
  assert.equal((await action(players[0].token, {type: 'pause'})).status, 403);
  assert.equal((await action(host.token, {type: 'pause'})).status, 200);
  assert.notEqual((await firstView(base, host.code, host.token)).view.state.checkpoint.timer.pausedAt, null);
  assert.equal((await action(host.token, {type: 'resume'})).status, 200);
  assert.equal((await firstView(base, host.code, players[0].token)).view.state.checkpoint.timer.pausedAt, null);
  assert.equal((await action(host.token, {type: 'timeout'})).status, 200);
  assert.equal((await firstView(base, host.code, host.token)).view.state.checkpoint.expired, false);
});

test('server: an invalid action returns 400 and does not change the room', async t => {
  const base = await startServer(t);
  const {host, players, action} = await httpTeam(base);
  const invalid = await action(players[0].token, {type: 'hack'});
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /not something the game can do/);
  assert.deepEqual((await firstView(base, host.code, host.token)).view.state.selected, []);
  assert.equal((await action(players[0].token, buy('P3'))).status, 200);
});

test('server: host reset clears the game but keeps the same players', async t => {
  const base = await startServer(t);
  const {host, players, action} = await httpTeam(base);
  assert.equal((await action(players[0].token, buy('P3'))).status, 200);
  assert.equal((await action(host.token, {type: 'reset'})).status, 200);
  const {view} = await firstView(base, host.code, players[0].token);
  assert.equal(view.state.stage, 'choose');
  assert.deepEqual(view.state.selected, []);
  assert.equal(view.players.length, 3);
});

test('server: auxiliary APIs and the home page work from the same server', async t => {
  const base = await startServer(t);
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Zero Hour/);
  const addresses = await fetch(`${base}/api/join-addresses`);
  assert.equal(addresses.status, 200);
  assert.ok(Array.isArray((await addresses.json()).addresses));
  const assets = await fetch(`${base}/api/assets`);
  assert.equal(assets.status, 200);
  assert.ok(Array.isArray((await assets.json()).files));
  assert.equal((await fetch(`${base}/api/not-a-route`)).status, 404);
  assert.equal((await fetch(`${base}/index.html`, {method: 'POST'})).status, 405);
});

test('server: a wrong room code is refused with a readable message', async t => {
  const base = await startServer(t);
  for (const [route, body] of [['join', {name: 'Ben'}], ['actions', {token: 'none', action: buy('P3')}]]) {
    const res = await postJson(`${base}/api/rooms/VAULT-00/${route}`, body);
    assert.equal(res.status, 404);
    assert.match(res.body.error, /No game with code VAULT-00/);
  }
  const events = await fetch(`${base}/api/rooms/VAULT-00/events?token=none`);
  assert.equal(events.status, 404);
  assert.match((await events.json()).error, /No game with code VAULT-00/);
});

test('server: two room codes keep their players and baskets separate', async t => {
  const base = await startServer(t);
  const {body: red} = await postJson(`${base}/api/rooms`, {});
  const {body: blue} = await postJson(`${base}/api/rooms`, {});
  assert.notEqual(red.code, blue.code);
  const redPlayer = (await postJson(`${base}/api/rooms/${red.code}/join`, {name: 'Red'})).body;
  const bluePlayer = (await postJson(`${base}/api/rooms/${blue.code}/join`, {name: 'Blue'})).body;
  assert.equal((await postJson(`${base}/api/rooms/${red.code}/actions`, {
    token: redPlayer.token, action: buy('P3'),
  })).status, 200);
  const redView = (await firstView(base, red.code, red.token)).view;
  const blueView = (await firstView(base, blue.code, bluePlayer.token)).view;
  assert.deepEqual(redView.state.selected, ['P3']);
  assert.deepEqual(blueView.state.selected, []);
  assert.deepEqual(redView.players.map(p => p.name), ['Red']);
  assert.deepEqual(blueView.players.map(p => p.name), ['Blue']);
});

test('server: a seat from one room cannot act in another room', async t => {
  const base = await startServer(t);
  const {body: red} = await postJson(`${base}/api/rooms`, {});
  const {body: blue} = await postJson(`${base}/api/rooms`, {});
  const redPlayer = (await postJson(`${base}/api/rooms/${red.code}/join`, {name: 'Red'})).body;
  const attempt = await postJson(`${base}/api/rooms/${blue.code}/actions`, {
    token: redPlayer.token, action: buy('P3'),
  });
  assert.equal(attempt.status, 403);
  assert.deepEqual((await firstView(base, blue.code, blue.token)).view.state.selected, []);
});

test('server: a role violation through the API leaves the basket unchanged', async t => {
  const base = await startServer(t);
  const {body: host} = await postJson(`${base}/api/rooms`, {});
  const gate = (await postJson(`${base}/api/rooms/${host.code}/join`, {name: 'Gate'})).body;
  const attempt = await postJson(`${base}/api/rooms/${host.code}/actions`, {
    token: gate.token, action: buy('D3'),
  });
  assert.equal(attempt.status, 403);
  assert.match(attempt.body.error, /Only a Detect player/);
  assert.deepEqual((await firstView(base, host.code, host.token)).view.state.selected, []);
});

test('server: malformed JSON returns 400 and the server still accepts a valid request', async t => {
  const base = await startServer(t);
  const bad = await fetch(`${base}/api/rooms`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{bad json',
  });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /valid JSON/);
  assert.equal((await postJson(`${base}/api/rooms`, {})).status, 201);
});

test('server: an oversized JSON body returns 413', async t => {
  const base = await startServer(t);
  const res = await postJson(`${base}/api/rooms`, {padding: 'x'.repeat(8192)});
  assert.equal(res.status, 413);
  assert.match(res.body.error, /too large/);
});

test('server: an open event stream receives a purchase without reconnecting', {timeout: 5000}, async t => {
  const base = await startServer(t);
  const {body: host} = await postJson(`${base}/api/rooms`, {});
  const player = (await postJson(`${base}/api/rooms/${host.code}/join`, {name: 'Ana'})).body;
  const controller = new AbortController();
  t.after(() => controller.abort());
  const response = await fetch(`${base}/api/rooms/${host.code}/events?token=${host.token}`, {signal: controller.signal});
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  async function nextView() {
    while (!pending.includes('\n\n')) {
      const {value, done} = await reader.read();
      assert.equal(done, false, 'the live stream closed before the next update');
      pending += decoder.decode(value, {stream: true});
    }
    const end = pending.indexOf('\n\n');
    const event = pending.slice(0, end);
    pending = pending.slice(end + 2);
    return JSON.parse(event.slice('data: '.length));
  }
  assert.deepEqual((await nextView()).state.selected, []);
  assert.equal((await postJson(`${base}/api/rooms/${host.code}/actions`, {
    token: player.token, action: buy('P3'),
  })).status, 200);
  assert.deepEqual((await nextView()).state.selected, ['P3']);
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

test('server: hidden files and folders such as .git are never served to the Wi-Fi', async t => {
  const base = await startServer(t);
  for (const path of ['/.git/HEAD', '/.git/config', '/%2egit/HEAD', '/.gitignore', '/src/.hidden']) {
    const res = await fetch(base + path);
    assert.equal(res.status, 404, path);
    assert.doesNotMatch(await res.text(), /ref:|\[core\]/, path);
  }
  assert.equal((await fetch(`${base}/index.html`)).status, 200, 'normal game files are still served');
});
