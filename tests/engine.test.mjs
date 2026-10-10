import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createInitialState, reduce} from '../src/engine/state.mjs';

const data = JSON.parse(readFileSync(new URL('../1-foundation/data/challenge.json', import.meta.url)));
const pick = (state, ...ids) => ids.reduce((s, id) => reduce(data, s, {type: 'select', id}), state);

test('a new game starts on the choose stage with nothing selected', () => {
  const state = createInitialState();
  assert.equal(state.stage, 'choose');
  assert.deepEqual(state.selected, []);
  assert.equal(state.confirmed, false);
});

test('selecting the same control twice keeps it once', () => {
  const state = pick(createInitialState(), 'P3', 'P3');
  assert.deepEqual(state.selected, ['P3']);
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
