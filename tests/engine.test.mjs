import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createInitialState, reduce, timeLeft} from '../src/engine/state.mjs';
import {POINTS_PER_SECURE_ANSWER} from '../src/config.mjs';
import {scoreSelection} from '../1-foundation/starter/controls.mjs';

const data = JSON.parse(readFileSync(new URL('../1-foundation/data/challenge.json', import.meta.url)));
const bank = JSON.parse(readFileSync(new URL('../1-foundation/data/questions.json', import.meta.url)));
const game = {data, bank};
const pick = (state, ...ids) => ids.reduce((s, id) => reduce(game, s, {type: 'select', id}), state);

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
  const state = reduce(game, pick(createInitialState(), 'P3', 'D3', 'R1'), {type: 'confirm'});
  assert.equal(state.confirmed, true);
  assert.equal(state.stage, 'story');
  assert.equal(state.result.total, 14);
});

test('confirming without a Respond control shows an error and stays unlocked', () => {
  const state = reduce(game, pick(createInitialState(), 'P3', 'D3'), {type: 'confirm'});
  assert.equal(state.confirmed, false);
  assert.match(state.error, /Missing: Respond/);
});

test('the choice cannot change after confirming', () => {
  let state = reduce(game, pick(createInitialState(), 'P3', 'D3', 'R1'), {type: 'confirm'});
  state = reduce(game, state, {type: 'select', id: 'P1'});
  state = reduce(game, state, {type: 'deselect', id: 'P3'});
  assert.deepEqual(state.selected, ['P3', 'D3', 'R1']);
});

const confirmed = () => reduce(game, pick(createInitialState(), 'P3', 'D3', 'R1'), {type: 'confirm'});
const next = (state, times = 1) => {
  for (let i = 0; i < times; i++) state = reduce(game, state, {type: 'next', now: 0});
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
  const state = reduce(game, pick(createInitialState(), 'P3'), {type: 'reset'});
  assert.deepEqual(state, createInitialState());
});

test('a whole game plays from choosing to outcome with scores matching the scoring module', () => {
  const choice = ['P5', 'P6', 'P7', 'D1', 'R1', 'R2', 'R4'];
  const expected = scoreSelection(data, choice);
  let state = reduce(game, pick(createInitialState(), ...choice), {type: 'confirm'});
  const seen = [];

  while (state.stage !== 'outcome') {
    if (state.stage === 'reveal') seen.push(state.result.phases[state.phase].score);
    const before = state;
    state = reduce(game, state, {type: 'next', now: 0});
    assert.notEqual(state, before, `the game got stuck on ${before.stage}`);
  }

  assert.deepEqual(seen, expected.phases.map(p => p.score));
  assert.equal(state.result.total, expected.total);
  assert.deepEqual(state.selected, choice);
});

// --- Behaviour checkpoints ---

const SECOND = 1000;
const atCheckpoint = () => next(confirmed(), 2); // phase 1 checkpoint, timer started at 0
const question = id => bank.questions.find(q => q.id === id);
const wrongChoice = id => ['A', 'B', 'C', 'D'].find(letter => letter !== question(id).correct);
const act = (state, action) => reduce(game, state, action);

test('a checkpoint picks story questions for the current phase and starts the timer', () => {
  const {checkpoint} = atCheckpoint();
  assert.ok(checkpoint.questionIds.length > 0);
  for (const id of checkpoint.questionIds) assert.equal(question(id).phase_id, 'phase_1');
  assert.equal(timeLeft(checkpoint.timer, 0), 120 * SECOND);
  assert.equal(checkpoint.expired, false);
});

test('a checkpoint cannot start without the current time', () => {
  const state = act(next(confirmed()), {type: 'next'});
  assert.equal(state.stage, 'reveal');
  assert.match(state.error, /current time/);
});

test('a secure answer earns behaviour points', () => {
  const state = act(atCheckpoint(), {type: 'answer', questionId: 'Q01', choice: question('Q01').correct, now: 5 * SECOND});
  assert.equal(state.answers.length, 1);
  assert.equal(state.answers[0].correct, true);
  assert.equal(state.behaviourPoints[0], POINTS_PER_SECURE_ANSWER);
});

test('a wrong answer earns no behaviour points', () => {
  const state = act(atCheckpoint(), {type: 'answer', questionId: 'Q01', choice: wrongChoice('Q01'), now: 5 * SECOND});
  assert.equal(state.answers[0].correct, false);
  assert.equal(state.behaviourPoints[0], 0);
});

test('behaviour points are kept separate from the control score', () => {
  const before = atCheckpoint();
  const after = act(before, {type: 'answer', questionId: 'Q01', choice: question('Q01').correct, now: 5 * SECOND});
  assert.equal(after.result.total, before.result.total);
});

test('the same question cannot be answered twice by the same player', () => {
  let state = act(atCheckpoint(), {type: 'answer', questionId: 'Q01', choice: wrongChoice('Q01'), now: 5 * SECOND});
  state = act(state, {type: 'answer', questionId: 'Q01', choice: question('Q01').correct, now: 6 * SECOND});
  assert.equal(state.answers.length, 1);
  assert.equal(state.behaviourPoints[0], 0);
  assert.match(state.error, /already been answered/);
});

test('a question from outside this checkpoint is rejected', () => {
  const state = act(atCheckpoint(), {type: 'answer', questionId: 'Q22', choice: 'A', now: 5 * SECOND});
  assert.equal(state.answers.length, 0);
  assert.match(state.error, /not part of this checkpoint/);
});

test('an answer outside a checkpoint is ignored', () => {
  const story = confirmed();
  assert.equal(act(story, {type: 'answer', questionId: 'Q01', choice: 'B', now: 5 * SECOND}), story);
});

test('an answer after the time runs out earns nothing and ends the checkpoint', () => {
  const state = act(atCheckpoint(), {type: 'answer', questionId: 'Q01', choice: question('Q01').correct, now: 121 * SECOND});
  assert.equal(state.answers.length, 0);
  assert.equal(state.checkpoint.expired, true);
  assert.match(state.error, /Time is up/);
});

test('a timeout sent before the time is up is ignored', () => {
  const state = atCheckpoint();
  assert.equal(act(state, {type: 'timeout', now: 60 * SECOND}), state);
});

test('a timeout after the time is up ends the checkpoint', () => {
  const state = act(atCheckpoint(), {type: 'timeout', now: 120 * SECOND});
  assert.equal(state.checkpoint.expired, true);
});

test('pausing stops the clock and resuming starts it again', () => {
  let state = act(atCheckpoint(), {type: 'pause', now: 30 * SECOND});
  assert.equal(timeLeft(state.checkpoint.timer, 90 * SECOND), 90 * SECOND);
  state = act(state, {type: 'resume', now: 90 * SECOND});
  assert.equal(timeLeft(state.checkpoint.timer, 100 * SECOND), 80 * SECOND);
});

test('a paused checkpoint does not run out of time', () => {
  let state = act(atCheckpoint(), {type: 'pause', now: 10 * SECOND});
  state = act(state, {type: 'timeout', now: 500 * SECOND});
  assert.equal(state.checkpoint.expired, false);
});

test('moving on with unanswered questions scores them as zero', () => {
  const state = act(atCheckpoint(), {type: 'next', now: 10 * SECOND});
  assert.equal(state.stage, 'story');
  assert.equal(state.phase, 1);
  assert.equal(state.checkpoint, null);
  assert.equal(state.behaviourPoints[0], 0);
});

test('with several players, each question scores the team average', () => {
  let state = act(atCheckpoint(), {type: 'answer', questionId: 'Q01', player: 'amy', choice: question('Q01').correct, now: 5 * SECOND});
  state = act(state, {type: 'answer', questionId: 'Q01', player: 'ben', choice: wrongChoice('Q01'), now: 6 * SECOND});
  assert.equal(state.answers.length, 2);
  assert.equal(state.behaviourPoints[0], POINTS_PER_SECURE_ANSWER / 2);
});
