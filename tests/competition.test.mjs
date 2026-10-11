// Tests for the team battle in multiplayer: several teams in one room, each building its own wall
// with its own £3m (src/server/competition.mjs), and the standings that compare the walls
// (src/ui/standings.mjs). The one-team rules are tested in multiplayer.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreSelection} from '../1-foundation/starter/controls.mjs';
import {CHECKPOINT_SECONDS, POINTS_PER_SECURE_ANSWER} from '../src/config.mjs';
import {loadGameData} from '../src/engine/loadData.mjs';
import {
  MAX_TEAMS, MIN_TEAM_SIZE, actCompetition, competitionView, createCompetition, joinCompetition, leaveCompetition, sharedState,
  trackConnection,
} from '../src/server/competition.mjs';
import {scorePlan} from '../src/engine/scores.mjs';
import {revealedUpTo, standings} from '../src/ui/standings.mjs';

const game = await loadGameData();
const {data} = game;
const buy = id => ({type: 'select', id});

// Two teams of two. In a team of two the first player looks after Prevent and Respond.
function twoTeams() {
  const room = createCompetition('VAULT-77');
  const red = ['Ana', 'Ben'].map(name => joinCompetition(room, name, 'Red').player);
  const blue = ['Cat', 'Dev'].map(name => joinCompetition(room, name, 'Blue').player);
  return {room, red, blue, host: room.hostToken};
}

// Red buys a strong plan, Blue a weak one, and the host locks both.
function lockedTeams() {
  const t = twoTeams();
  for (const [p, id] of [[t.red[0], 'P5'], [t.red[0], 'P6'], [t.red[1], 'D4'], [t.red[0], 'R1'], [t.red[0], 'R2']]) actCompetition(t.room, p.token, buy(id), game);
  for (const [p, id] of [[t.blue[0], 'P3'], [t.blue[1], 'D3'], [t.blue[0], 'R6']]) actCompetition(t.room, p.token, buy(id), game);
  actCompetition(t.room, t.host, {type: 'confirm'}, game, 1_000);
  return t;
}

const team = (room, name) => room.teams.find(t => t.name === name);

// ================================================================ forming teams

test('a refused join never leaves an empty team behind that would stop the night starting', () => {
  const room = createCompetition('VAULT-2');
  assert.throws(() => joinCompetition(room, '   ', 'Ghosts'), /Enter your name/);
  assert.throws(() => joinCompetition(room, 42, 'Ghosts'), /Enter your name/);
  assert.equal(room.teams.length, 0);
});

test('joining again with the same name in the same team gets the same seat back, not a ghost player', () => {
  const {room, red} = twoTeams();
  const again = joinCompetition(room, '  ana ', 'red');   // a closed tab or a new phone: same person
  assert.equal(again.player.token, red[0].token);
  assert.equal(team(room, 'Red').players.length, 2, 'the team does not grow');
  assert.deepEqual(competitionView(room, red[0].token).you.categories, ['Prevent', 'Respond'], 'squads are not reshuffled');
});

test("a player who comes back does not lower their team's quiz points", () => {
  const t = lockedTeams();
  actCompetition(t.room, t.host, {type: 'next'}, game, 2_000);
  actCompetition(t.room, t.host, {type: 'next'}, game, 3_000);
  const back = joinCompetition(t.room, 'Ben', 'Red').player;   // Ben's phone reloaded in a new tab
  const questions = team(t.room, 'Red').state.checkpoint.questionIds;
  const secure = id => game.bank.questions.find(q => q.id === id).correct;
  for (const p of [t.red[0], back]) {
    for (const id of questions) actCompetition(t.room, p.token, {type: 'answer', questionId: id, choice: secure(id)}, game, 4_000);
  }
  assert.equal(team(t.room, 'Red').state.behaviourPoints[0], POINTS_PER_SECURE_ANSWER * questions.length, 'full points, not shared with a ghost');
});

test('players join a team by name, and the same name in any case is the same team', () => {
  const room = createCompetition('VAULT-1');
  joinCompetition(room, 'Ana', 'Red Team');
  joinCompetition(room, 'Ben', '  red team ');
  joinCompetition(room, 'Cat', 'Blue');
  assert.deepEqual(room.teams.map(t => [t.name, t.players.length]), [['Red Team', 2], ['Blue', 1]]);
});

test('a player who gives no team name joins the first default team', () => {
  const room = createCompetition('VAULT-2');
  const {team: joined} = joinCompetition(room, 'Ana');
  assert.equal(joined.name, 'Team 1');
});

test(`a room holds at most ${MAX_TEAMS} teams; the next new team is refused with a readable message`, () => {
  const room = createCompetition('VAULT-3');
  for (let i = 1; i <= MAX_TEAMS; i++) joinCompetition(room, `P${i}`, `Team ${i}`);
  assert.throws(() => joinCompetition(room, 'Late', 'Team 99'), err => err.status === 409 && /most teams/.test(err.message));
  assert.equal(room.teams.length, MAX_TEAMS);
  assert.doesNotThrow(() => joinCompetition(room, 'Extra', 'Team 3'));   // joining an existing team is fine
});

test('a team can have any number of players', () => {
  const room = createCompetition('VAULT-4');
  for (let i = 0; i < 12; i++) joinCompetition(room, `Player ${i}`, 'Big');
  assert.equal(team(room, 'Big').players.length, 12);
});

test('a team name that is not text is refused', () => {
  const room = createCompetition('VAULT-5');
  assert.throws(() => joinCompetition(room, 'Ana', {name: 'Red'}), err => err.status === 400);
  assert.equal(room.teams.length, 0);
});

test('in a team of two the first player also chooses Respond, so every category has someone', () => {
  const {room, red} = twoTeams();
  assert.deepEqual(competitionView(room, red[0].token).you.categories, ['Prevent', 'Respond']);
  assert.deepEqual(competitionView(room, red[1].token).you.categories, ['Detect']);
  actCompetition(room, red[0].token, buy('R1'), game);
  assert.throws(() => actCompetition(room, red[1].token, buy('P3'), game), err => err.status === 403);
  assert.deepEqual(team(room, 'Red').state.selected, ['R1']);
});

// ================================================================ separate walls, separate budgets

test('each team has its own £3m: one team spending does not touch another team', () => {
  const {room, red, blue} = twoTeams();
  actCompetition(room, red[1].token, buy('D4'), game);         // £1,000,000
  actCompetition(room, blue[1].token, buy('D4'), game);        // the same control, bought separately
  assert.deepEqual(team(room, 'Red').state.selected, ['D4']);
  assert.deepEqual(team(room, 'Blue').state.selected, ['D4']);
});

test("a player can only change their own team's plan", () => {
  const {room, red} = twoTeams();
  actCompetition(room, red[1].token, buy('D3'), game);
  assert.deepEqual(team(room, 'Blue').state.selected, []);
});

test('a player sees their own team and every team, and no view contains a token', () => {
  const {room, red, blue, host} = twoTeams();
  const view = competitionView(room, red[0].token);
  assert.equal(view.team.name, 'Red');
  assert.deepEqual(view.players.map(p => p.name), ['Ana', 'Ben']);
  assert.deepEqual(view.teams.map(t => t.name), ['Red', 'Blue']);
  for (const token of [red[0].token, host]) {
    const text = JSON.stringify(competitionView(room, token));
    for (const secret of [...red, ...blue].map(p => p.token).concat(host)) assert.ok(!text.includes(secret));
  }
  assert.equal(competitionView(room, 'not-a-seat'), null);
});

// ================================================================ starting the night

test(`the night cannot start while a team has fewer than ${MIN_TEAM_SIZE} players, and nothing changes`, () => {
  const room = createCompetition('VAULT-6');
  const [ana, ben] = ['Ana', 'Ben'].map(name => joinCompetition(room, name, 'Red').player);
  joinCompetition(room, 'Solo', 'Blue');
  for (const id of ['P3', 'R1']) actCompetition(room, ana.token, buy(id), game);
  actCompetition(room, ben.token, buy('D3'), game);
  assert.throws(() => actCompetition(room, room.hostToken, {type: 'confirm'}, game),
    err => err.status === 409 && /Blue needs 1 more player/.test(err.message));
  assert.equal(sharedState(room).confirmed, false);
  assert.equal(team(room, 'Red').state.confirmed, false);
});

test('a team can lock a plan without all three categories, and it scores its controls as usual', () => {
  const {room, red, blue, host} = twoTeams();
  for (const [p, id] of [[red[0], 'P3'], [red[1], 'D3'], [red[0], 'R1'], [blue[1], 'D4']]) actCompetition(room, p.token, buy(id), game);
  actCompetition(room, host, {type: 'confirm'}, game);
  const blueResult = team(room, 'Blue').state.result;
  assert.equal(team(room, 'Blue').state.confirmed, true);
  assert.deepEqual(blueResult.phases.map(p => p.score), data.phases.map(phase => phase.scores.D4));
  assert.deepEqual(team(room, 'Red').state.result, scoreSelection(data, ['P3', 'D3', 'R1']));
});

test('a team that bought nothing can still be locked, and its wall scores 0', () => {
  const {room, host} = twoTeams();
  actCompetition(room, host, {type: 'confirm'}, game);
  assert.ok(room.teams.every(t => t.state.confirmed && t.state.result.total === 0));
});

test('the host cannot start with nobody in the room', () => {
  const room = createCompetition('VAULT-8');
  assert.throws(() => actCompetition(room, room.hostToken, {type: 'confirm'}, game), err => err.status === 409);
});

test("locking the plans scores each team's own plan with the scoring module", () => {
  const {room} = lockedTeams();
  assert.deepEqual(team(room, 'Red').state.result, scoreSelection(data, ['P5', 'P6', 'D4', 'R1', 'R2']));
  assert.deepEqual(team(room, 'Blue').state.result, scoreSelection(data, ['P3', 'D3', 'R6']));
});

test('once the night has started the room is locked: nobody new can join any team', () => {
  const {room} = lockedTeams();
  for (const teamName of ['Green', 'Blue']) {
    assert.throws(() => joinCompetition(room, 'Late', teamName), err => err.status === 423 && /locked/.test(err.message));
  }
  assert.deepEqual(room.teams.map(t => t.players.length), [2, 2]);
  assert.equal(room.teams.length, 2);
});

test('players already in a locked room keep their seats and can still play', () => {
  const {room, red} = lockedTeams();
  assert.equal(competitionView(room, red[0].token).team.name, 'Red');
});

test('a player already in a locked room can come back with the same name and team, and gets the same seat', () => {
  const {room, red} = lockedTeams();
  const back = joinCompetition(room, 'ana', 'red').player;
  assert.equal(back.id, red[0].id);
  assert.equal(team(room, 'Red').players.length, 2);
});

test('a new night unlocks the room again', () => {
  const {room, host} = lockedTeams();
  actCompetition(room, host, {type: 'reset'}, game);
  assert.doesNotThrow(() => joinCompetition(room, 'Late', 'Green'));
});

test('the host moves every team through the night together, with one shared clock', () => {
  const {room, host} = lockedTeams();
  actCompetition(room, host, {type: 'next'}, game, 2_000);
  actCompetition(room, host, {type: 'next'}, game, 2_000);
  for (const t of room.teams) {
    assert.equal(t.state.stage, 'checkpoint');
    assert.equal(t.state.checkpoint.timer.startedAt, 2_000);
  }
  actCompetition(room, host, {type: 'pause'}, game, 3_000);
  assert.ok(room.teams.every(t => t.state.checkpoint.timer.pausedAt === 3_000));
});

test('in each team, a player who misses a question counts as 0 in that team\'s average', () => {
  const {room, red, blue, host} = lockedTeams();
  actCompetition(room, host, {type: 'next'}, game, 2_000);
  actCompetition(room, host, {type: 'next'}, game, 2_000);
  const id = team(room, 'Red').state.checkpoint.questionIds[0];
  const right = game.bank.questions.find(q => q.id === id).correct;
  actCompetition(room, red[0].token, {type: 'answer', questionId: id, choice: right}, game, 3_000);
  actCompetition(room, blue[0].token, {type: 'answer', questionId: id, choice: right}, game, 3_000);
  actCompetition(room, blue[1].token, {type: 'answer', questionId: id, choice: right}, game, 3_000);
  actCompetition(room, host, {type: 'timeout'}, game, 2_000 + CHECKPOINT_SECONDS * 1000);
  assert.equal(team(room, 'Red').state.behaviourPoints[0], POINTS_PER_SECURE_ANSWER / 2);
  assert.equal(team(room, 'Blue').state.behaviourPoints[0], POINTS_PER_SECURE_ANSWER);
});

test('the host cannot buy controls or answer for a team', () => {
  const {room, host} = twoTeams();
  assert.throws(() => actCompetition(room, host, buy('P3'), game), err => err.status === 403);
});

test('reset starts a fresh night for every team and keeps the teams and players', () => {
  const {room, host} = lockedTeams();
  actCompetition(room, host, {type: 'reset'}, game);
  assert.ok(room.teams.every(t => t.state.stage === 'choose' && t.state.selected.length === 0));
  assert.deepEqual(room.teams.map(t => t.players.length), [2, 2]);
});

// ================================================================ comparing the walls

test('nothing is revealed before the first reveal, and everything at the end', () => {
  assert.equal(revealedUpTo({confirmed: false}), -1);
  assert.equal(revealedUpTo({confirmed: true, stage: 'story', phase: 0}), -1);
  assert.equal(revealedUpTo({confirmed: true, stage: 'reveal', phase: 1}), 1);
  assert.equal(revealedUpTo({confirmed: true, stage: 'outcome', phase: 3}), 3);
});

test('at the end, teams are ranked by how much of the attack their wall held', () => {
  const {room} = lockedTeams();
  const rows = standings(data, competitionView(room, room.hostToken).teams, 3);
  assert.deepEqual(rows.map(r => [r.name, r.rank]), [['Red', 1], ['Blue', 2]]);
  assert.ok(rows[0].wallPercent > rows[1].wallPercent);
  for (const row of rows) {
    assert.equal(row.attacks, 40);
    assert.equal(row.cracks, row.attacks - row.phases.reduce((sum, p) => sum + p.held, 0));
    assert.equal(row.control, team(room, row.name).state.result.total);
  }
});

test('teams with the same wall and the same points share a rank', () => {
  const {room} = twoTeams();
  for (const name of ['Red', 'Blue']) {
    const t = team(room, name);
    t.state = {...t.state, confirmed: true, selected: ['P3', 'D3', 'R1'], result: scoreSelection(data, ['P3', 'D3', 'R1'])};
  }
  const rows = standings(data, competitionView(room, room.hostToken).teams, 3);
  assert.deepEqual(rows.map(r => r.rank), [1, 1]);
});

test('standings only count the phases revealed so far', () => {
  const {room} = lockedTeams();
  const rows = standings(data, competitionView(room, room.hostToken).teams, 0);
  assert.ok(rows.every(r => r.phases.length === 1 && r.attacks === 10));
});

// ================================================================ scoring a plan in team battle

test('scorePlan gives exactly what the scoring module gives when all three categories are covered', () => {
  for (const plan of [['P3', 'D3', 'R1'], ['P5', 'P6', 'D4', 'R1', 'R2'], ['P1', 'D1', 'D2', 'R4']]) {
    assert.deepEqual(scorePlan(data, plan), scoreSelection(data, plan));
  }
});

test('scorePlan still refuses a plan over budget, a control twice or an unknown control', () => {
  assert.throws(() => scorePlan(data, ['P2', 'D4', 'D5', 'P7']), /Over budget/);
  assert.throws(() => scorePlan(data, ['D3', 'D3']), /twice/);
  assert.throws(() => scorePlan(data, ['X9']), /not a control/);
});

// ================================================================ leaving, and no ghost players

test('a player who leaves before the night starts disappears from the room, so the host sees no ghost', () => {
  const {room, red} = twoTeams();
  assert.equal(leaveCompetition(room, red[1].token), true);
  assert.deepEqual(team(room, 'Red').players.map(p => p.name), ['Ana']);
  assert.equal(competitionView(room, red[1].token), null);
});

test('when the last player of a team leaves, the empty team goes too', () => {
  const {room, red} = twoTeams();
  for (const p of red) leaveCompetition(room, p.token);
  assert.deepEqual(room.teams.map(t => t.name), ['Blue']);
});

test('a team whose player left needs another player again before the night can start', () => {
  const {room, red, host} = twoTeams();
  leaveCompetition(room, red[1].token);
  assert.throws(() => actCompetition(room, host, {type: 'confirm'}, game), /Red needs 1 more player/);
});

test('after the night starts, a player who leaves is marked as left and no longer counts in the team average', () => {
  const {room, red, host} = lockedTeams();
  actCompetition(room, host, {type: 'next'}, game, 2_000);
  actCompetition(room, host, {type: 'next'}, game, 2_000);
  leaveCompetition(room, red[1].token);
  const view = competitionView(room, host).teams.find(t => t.name === 'Red');
  assert.deepEqual(view.players.map(p => [p.name, p.left]), [['Ana', false], ['Ben', true]]);
  const id = team(room, 'Red').state.checkpoint.questionIds[0];
  const right = game.bank.questions.find(q => q.id === id).correct;
  actCompetition(room, red[0].token, {type: 'answer', questionId: id, choice: right}, game, 3_000);
  assert.equal(team(room, 'Red').state.behaviourPoints[0], POINTS_PER_SECURE_ANSWER);
});

test('a player who left can come back with the same name and team', () => {
  const {room, red} = lockedTeams();
  leaveCompetition(room, red[1].token);
  const back = joinCompetition(room, 'Ben', 'Red').player;
  assert.equal(back.id, red[1].id);
  assert.equal(back.left, false);
});

test('the host cannot leave, and an unknown seat leaving changes nothing', () => {
  const {room, host} = twoTeams();
  assert.throws(() => leaveCompetition(room, host), err => err.status === 400);
  assert.equal(leaveCompetition(room, 'not-a-seat'), false);
  assert.equal(room.teams.length, 2);
});

test('the host sees who has the game open right now', () => {
  const {room, red, host} = twoTeams();
  trackConnection(room, red[0].token, +1);
  const online = () => competitionView(room, host).teams.find(t => t.name === 'Red').players.map(p => p.online);
  assert.deepEqual(online(), [true, false]);
  trackConnection(room, red[0].token, -1);
  assert.deepEqual(online(), [false, false]);
});
