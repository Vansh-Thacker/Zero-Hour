// Tests for multiplayer: one shared game, one shared budget, players on separate devices.
// Hard cases from 3-stretch/multiplayer.md, plus roles and joining late.
//
// These tests are SKIPPED until src/multiplayer/room.mjs exists. They then run on their own.
//
// ---------------------------------------------------------------- the agreed contract
// Keep the shared-game rules in a pure module, separate from the server, so they can be
// tested without a network. The server only receives messages, calls these functions one
// at a time (so two messages at the same moment are applied in turn), stores the new room
// and sends viewFor() to every device.
//
//   createRoom(challenge, code)                    -> room
//   joinRoom(room, {code, playerId, role})         -> {room, error}
//   act(challenge, room, playerId, action)         -> {room, error}
//        action: {type: 'select', id} | {type: 'deselect', id} | {type: 'confirm'}
//   viewFor(room, playerId)                        -> {code, selected, spent, budget, confirmed, players, you}
//
//   role is 'Prevent', 'Detect', 'Respond' or 'facilitator'. A player may only select or
//   deselect controls in their own category. Only the facilitator may confirm.
//   On a rule break, `room` is returned unchanged and `error` is a readable message.
//   No function changes the room it is given.
// ------------------------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreSelection } from '../1-foundation/starter/controls.mjs';

let mp = null;
try { mp = await import('../src/multiplayer/room.mjs'); } catch { /* not built yet */ }
const skip = mp ? false : 'waiting for src/multiplayer/room.mjs (Vansh)';

const challenge = JSON.parse(readFileSync(new URL('../1-foundation/data/challenge.json', import.meta.url)));
const cost = id => challenge.controls.find(c => c.id === id).cost;
const CODE = 'ABC123';

// Small helpers so each test reads as a story.
function newRoom(...players) {
  let room = mp.createRoom(challenge, CODE);
  for (const [playerId, role] of players) {
    const r = mp.joinRoom(room, { code: CODE, playerId, role });
    assert.equal(r.error ?? null, null, `join ${playerId}`);
    room = r.room;
  }
  return room;
}
const team = () => newRoom(['ana', 'Prevent'], ['ben', 'Detect'], ['cal', 'Respond'], ['fay', 'facilitator']);
function play(room, ...steps) {
  for (const [playerId, action] of steps) {
    const r = mp.act(challenge, room, playerId, action);
    assert.equal(r.error ?? null, null, `${playerId} ${JSON.stringify(action)}`);
    room = r.room;
  }
  return room;
}
const select = id => ({ type: 'select', id });

// ---------------------------------------------------------------- joining

test('players join the same game with the room code', { skip }, () => {
  const room = team();
  assert.equal(mp.viewFor(room, 'ana').players.length, 4);
});

test('a wrong room code is refused with a readable message', { skip }, () => {
  const room = team();
  const r = mp.joinRoom(room, { code: 'WRONG1', playerId: 'dee', role: 'Detect' });
  assert.ok(r.error);
  assert.equal(r.room, room);
});

test('a player who drops out and rejoins sees the game as it is now, not twice in the list', { skip }, () => {
  let room = play(team(), ['ana', select('P3')], ['ben', select('D3')]);
  const r = mp.joinRoom(room, { code: CODE, playerId: 'ana', role: 'Prevent' });
  assert.equal(r.error ?? null, null);
  const view = mp.viewFor(r.room, 'ana');
  assert.deepEqual([...view.selected].sort(), ['D3', 'P3']);
  assert.equal(view.players.filter(p => p.id === 'ana').length, 1);
});

test('someone joining after Confirm sees the locked choice and cannot change it', { skip }, () => {
  let room = play(team(), ['ana', select('P3')], ['ben', select('D3')], ['cal', select('R1')], ['fay', { type: 'confirm' }]);
  const joined = mp.joinRoom(room, { code: CODE, playerId: 'dee', role: 'Prevent' });
  assert.equal(joined.error ?? null, null);
  assert.equal(mp.viewFor(joined.room, 'dee').confirmed, true);
  const r = mp.act(challenge, joined.room, 'dee', select('P4'));
  assert.ok(r.error);
  assert.deepEqual([...mp.viewFor(r.room, 'dee').selected].sort(), ['D3', 'P3', 'R1']);
});

// ---------------------------------------------------------------- one shared state

test('every player sees the same basket and the same budget', { skip }, () => {
  const room = play(team(), ['ana', select('P3')], ['ben', select('D3')]);
  const views = ['ana', 'ben', 'cal', 'fay'].map(id => mp.viewFor(room, id));
  for (const v of views) {
    assert.deepEqual([...v.selected].sort(), ['D3', 'P3']);
    assert.equal(v.spent, cost('P3') + cost('D3'));
    assert.equal(v.budget, challenge.budget);
  }
});

test('two picks that spend the last of the budget at once: only the first goes through', { skip }, () => {
  // P2 + P7 + D4 + R2 = £2,900,000, leaving £100,000.
  // Then Detect picks D3 (£100,000) and Respond picks R6 (£100,000) at the same moment.
  const room = play(team(), ['ana', select('P2')], ['ana', select('P7')], ['ben', select('D4')], ['cal', select('R2')]);
  assert.equal(challenge.budget - mp.viewFor(room, 'fay').spent, 100000);
  const first = mp.act(challenge, room, 'ben', select('D3'));
  const second = mp.act(challenge, first.room, 'cal', select('R6'));
  assert.equal(first.error ?? null, null);
  assert.match(second.error, /budget/i);
  const view = mp.viewFor(second.room, 'fay');
  assert.ok(view.selected.includes('D3') && !view.selected.includes('R6'));
  assert.equal(view.spent, challenge.budget);
});

test('the same control picked by two devices at once is only added once', { skip }, () => {
  let room = newRoom(['ana', 'Prevent'], ['amy', 'Prevent'], ['fay', 'facilitator']);
  room = mp.act(challenge, room, 'ana', select('P3')).room;
  const r = mp.act(challenge, room, 'amy', select('P3'));
  assert.deepEqual(mp.viewFor(r.room, 'fay').selected.filter(id => id === 'P3'), ['P3']);
});

// ---------------------------------------------------------------- roles

test('a player cannot pick a control outside their role', { skip }, () => {
  const room = team();
  const r = mp.act(challenge, room, 'ana', select('D3')); // ana is Prevent
  assert.ok(r.error);
  assert.equal(r.room, room);
});

test('a player cannot remove a control outside their role', { skip }, () => {
  const room = play(team(), ['ben', select('D3')]);
  const r = mp.act(challenge, room, 'ana', { type: 'deselect', id: 'D3' });
  assert.ok(r.error);
  assert.ok(mp.viewFor(r.room, 'fay').selected.includes('D3'));
});

test('a device that never joined cannot act', { skip }, () => {
  const room = team();
  const r = mp.act(challenge, room, 'stranger', select('P3'));
  assert.ok(r.error);
  assert.equal(r.room, room);
});

// ---------------------------------------------------------------- the scoring rules still apply

test('confirm is refused while a category is missing, with the scoring module message', { skip }, () => {
  const room = play(team(), ['ana', select('P3')], ['ben', select('D3')]);
  const r = mp.act(challenge, room, 'fay', { type: 'confirm' });
  assert.match(r.error, /Missing: Respond/);
  assert.equal(mp.viewFor(r.room, 'fay').confirmed, false);
});

test('a confirmed shared game scores exactly what the scoring module gives', { skip }, () => {
  const room = play(team(), ['ana', select('P3')], ['ben', select('D3')], ['cal', select('R1')], ['fay', { type: 'confirm' }]);
  const view = mp.viewFor(room, 'fay');
  assert.equal(view.confirmed, true);
  assert.equal(scoreSelection(challenge, view.selected).total, 14);
});

test('nothing can be picked after Confirm', { skip }, () => {
  const room = play(team(), ['ana', select('P3')], ['ben', select('D3')], ['cal', select('R1')], ['fay', { type: 'confirm' }]);
  assert.ok(mp.act(challenge, room, 'ana', select('P4')).error);
});

test('an unknown control ID is refused', { skip }, () => {
  assert.ok(mp.act(challenge, team(), 'ana', select('P99')).error);
});

test('shared-game functions never change the room they are given', { skip }, () => {
  const room = team();
  const before = JSON.stringify(room);
  mp.act(challenge, room, 'ana', select('P3'));
  mp.joinRoom(room, { code: CODE, playerId: 'dee', role: 'Detect' });
  assert.equal(JSON.stringify(room), before);
});
