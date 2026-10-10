import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createInitialState, reduce} from '../src/engine/state.mjs';
import {scoreSelection} from '../1-foundation/starter/controls.mjs';

const data = JSON.parse(readFileSync(new URL('../1-foundation/data/challenge.json', import.meta.url)));
const pick = (state, ...ids) => ids.reduce((s, id) => reduce(data, s, {type: 'select', id}), state);

test('a new game starts on the choose stage with nothing selected', () => {
  const state = createInitialState();
  assert.equal(state.stage, 'choose');
  assert.deepEqual(state.selected, []);
  assert.equal(state.confirmed, false);
});

test('selecting the same control twice keeps it once and says why', () => {
  const state = pick(createInitialState(), 'P3', 'P3');
  assert.deepEqual(state.selected, ['P3']);
  assert.match(state.error, /already chosen/);
});

test('selecting an unknown control is rejected', () => {
  const state = pick(createInitialState(), 'X9');
  assert.deepEqual(state.selected, []);
  assert.match(state.error, /"X9" is not a control/);
});

test('a control that costs more than the budget left is rejected straight away', () => {
  const state = pick(createInitialState(), 'P2', 'D4', 'D1', 'R2');
  assert.deepEqual(state.selected, ['P2', 'D4', 'D1']);
  assert.match(state.error, /Not enough budget for .*£300,000 is left/);
});

test('a control that fits the budget left is still accepted', () => {
  const state = pick(createInitialState(), 'P2', 'D4', 'D1', 'R1');
  assert.deepEqual(state.selected, ['P2', 'D4', 'D1', 'R1']);
  assert.equal(state.error, null);
});

test('a successful pick clears the previous error', () => {
  const state = pick(createInitialState(), 'X9', 'P3');
  assert.equal(state.error, null);
});

test('confirming a valid choice locks it and scores it', () => {
  const state = reduce(data, pick(createInitialState(), 'P3', 'D3', 'R1'), {type: 'confirm'});
  assert.equal(state.confirmed, true);
  assert.equal(state.stage, 'story');
  assert.equal(state.result.total, 14);
});

test('confirming without a Respond control shows an error and stays unlocked', () => {
  const state = reduce(data, pick(createInitialState(), 'P3', 'D3'), {type: 'confirm'});
  assert.equal(state.confirmed, false);
  assert.match(state.error, /Missing: Respond/);
});

test('the choice cannot change after confirming', () => {
  let state = reduce(data, pick(createInitialState(), 'P3', 'D3', 'R1'), {type: 'confirm'});
  state = reduce(data, state, {type: 'select', id: 'P1'});
  state = reduce(data, state, {type: 'deselect', id: 'P3'});
  assert.deepEqual(state.selected, ['P3', 'D3', 'R1']);
});

const confirmed = () => reduce(data, pick(createInitialState(), 'P3', 'D3', 'R1'), {type: 'confirm'});
const next = (state, times = 1) => {
  for (let i = 0; i < times; i++) state = reduce(data, state, {type: 'next'});
  return state;
};

test('next does nothing before the choice is confirmed', () => {
  const state = pick(createInitialState(), 'P3', 'D3', 'R1');
  assert.equal(next(state), state);
});

test('each phase runs story, then reveal, then checkpoint', () => {
  let state = confirmed();
  assert.equal(state.stage, 'story');
  state = next(state);
  assert.equal(state.stage, 'reveal');
  state = next(state);
  assert.equal(state.stage, 'checkpoint');
  assert.equal(state.phase, 0);
});

test('after a checkpoint the next phase starts with its story', () => {
  const state = next(confirmed(), 3);
  assert.equal(state.stage, 'story');
  assert.equal(state.phase, 1);
});

test('after the fourth checkpoint the game shows the outcome', () => {
  const state = next(confirmed(), 12);
  assert.equal(state.stage, 'outcome');
  assert.equal(state.phase, 3);
});

test('next does nothing on the outcome screen', () => {
  const outcome = next(confirmed(), 12);
  assert.equal(next(outcome), outcome);
});

test('reset starts a new game', () => {
  const state = reduce(data, pick(createInitialState(), 'P3'), {type: 'reset'});
  assert.deepEqual(state, createInitialState());
});

test('a whole game plays from choosing to outcome with scores matching the scoring module', () => {
  const choice = ['P5', 'P6', 'P7', 'D1', 'R1', 'R2', 'R4'];
  const expected = scoreSelection(data, choice);
  let state = reduce(data, pick(createInitialState(), ...choice), {type: 'confirm'});
  const seen = [];

  while (state.stage !== 'outcome') {
    if (state.stage === 'reveal') seen.push(state.result.phases[state.phase].score);
    const before = state;
    state = reduce(data, state, {type: 'next'});
    assert.notEqual(state, before, `the game got stuck on ${before.stage}`);
  }

  assert.deepEqual(seen, expected.phases.map(p => p.score));
  assert.equal(state.result.total, expected.total);
  assert.deepEqual(state.selected, choice);
});
