// Audit coverage for shared engine helpers. Expectations come from the rules,
// including an independent enumeration of every basket in the six-control fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isValidAction} from '../src/engine/actions.mjs';
import {selectionSummary, canSelect} from '../src/engine/selection.mjs';
import {phaseScore, controlScoreSoFar, behaviourTotal, finalTotal, bestPossiblePhaseScore} from '../src/engine/scores.mjs';
import {currentPhase, isLastPhase, phaseLabel} from '../src/engine/phases.mjs';
import {createInitialState} from '../src/engine/state.mjs';

const fixture = JSON.parse(readFileSync(new URL('../1-foundation/data/fixture.json', import.meta.url)));
const data = JSON.parse(readFileSync(new URL('../1-foundation/data/challenge.json', import.meta.url)));
const categories = ['Prevent', 'Detect', 'Respond'];
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

test('audit/actions: every supported action accepts its documented payload', () => {
  const actions = [
    {type: 'select', id: 'P1'}, {type: 'deselect', id: 'P1'},
    {type: 'confirm'}, {type: 'reset'}, {type: 'next'}, {type: 'next', now: 0},
    {type: 'answer', questionId: 'Q01', choice: 'A', now: 0, player: 'player-1'},
    ...['pause', 'resume', 'timeout'].map(type => ({type, now: 0})),
  ];
  for (const action of actions) assert.equal(isValidAction(freeze(action)), true, JSON.stringify(action));
});

test('audit/actions: malformed objects, unknown actions and blank IDs are rejected', () => {
  const bad = [null, undefined, [], 'select', 5, {}, {type: 'hack'},
    {type: 'select'}, {type: 'select', id: ' '}, {type: 'deselect', id: 12},
    {type: 'answer', questionId: ' ', choice: 'A', now: 0},
    {type: 'answer', questionId: 'Q01', choice: 'a', now: 0},
    {type: 'confirm', player: ' '}, {type: 'reset', player: 0}];
  for (const action of bad) assert.equal(isValidAction(action), false, JSON.stringify(action));
});

test('audit/actions: every clocked action rejects negative, infinite, NaN and string times', () => {
  for (const now of [-1, NaN, Infinity, -Infinity, '1000', null]) {
    for (const type of ['answer', 'next', 'pause', 'resume', 'timeout']) {
      assert.equal(isValidAction({type, now, questionId: 'Q01', choice: 'A'}), false, `${type}: ${String(now)}`);
    }
  }
  for (const type of ['answer', 'pause', 'resume', 'timeout']) {
    assert.equal(isValidAction({type, questionId: 'Q01', choice: 'A'}), false);
  }
});

test('audit/selection: an empty basket exposes the full budget and all three missing categories', () => {
  assert.deepEqual(selectionSummary(fixture, []), {
    spent: 0, left: 1000000,
    counts: {Prevent: 0, Detect: 0, Respond: 0}, missing: categories, canConfirm: false,
  });
});

test('audit/selection: every one of the 64 fixture baskets follows the budget and category rules', () => {
  for (let mask = 0; mask < 2 ** fixture.controls.length; mask++) {
    const chosen = fixture.controls.filter((_, n) => mask & (1 << n));
    const ids = Object.freeze(chosen.map(c => c.id));
    const spent = chosen.reduce((sum, c) => sum + c.cost, 0);
    const missing = categories.filter(category => !chosen.some(c => c.category === category));
    const summary = selectionSummary(freeze(fixture), ids);
    assert.equal(summary.spent, spent, String(mask));
    assert.equal(summary.left, fixture.budget - spent, String(mask));
    assert.deepEqual(summary.missing, missing, String(mask));
    assert.equal(summary.canConfirm, spent <= fixture.budget && missing.length === 0, String(mask));
    for (const category of categories) {
      assert.equal(summary.counts[category], chosen.filter(c => c.category === category).length);
    }
  }
});

test('audit/selection: unknown IDs and duplicate purchases cannot make a basket confirmable', () => {
  assert.equal(selectionSummary(fixture, ['T1', 'T2', 'T3', 'unknown']).canConfirm, false);
  assert.equal(selectionSummary(fixture, ['T1', 'T2', 'T3', 'T1']).canConfirm, false);
});

test('audit/selection: a purchase costing exactly the remaining budget is allowed', () => {
  const selected = Object.freeze(['T4', 'T6']); // £1m exactly
  assert.deepEqual(canSelect(fixture, ['T4'], 'T6'), {ok: true, reason: null});
  assert.deepEqual(canSelect(fixture, selected, 'T1'), {ok: false, reason: 'OVER_BUDGET'});
  assert.deepEqual(canSelect(fixture, selected, 'T4'), {ok: false, reason: 'ALREADY_SELECTED'});
  assert.deepEqual(canSelect(fixture, selected, 'unknown'), {ok: false, reason: 'UNKNOWN_CONTROL'});
});

test('audit/selection: the already-in-place controls are not purchasable', () => {
  for (const control of data.already_in_place) {
    assert.deepEqual(canSelect(data, [], control.id), {ok: false, reason: 'UNKNOWN_CONTROL'});
  }
});

test('audit/scores: unconfirmed state has no revealed score or total', () => {
  const state = createInitialState();
  assert.equal(phaseScore(state, 0), 0);
  assert.equal(controlScoreSoFar(state), 0);
  assert.equal(behaviourTotal(state), 0);
  assert.equal(finalTotal(state), 0);
});

test('audit/scores: future phase scores stay hidden until each reveal, then stay visible', () => {
  const scores = [2, 5, 7, 11];
  for (let phase = 0; phase < 4; phase++) {
    for (const stage of ['story', 'reveal', 'checkpoint', 'outcome']) {
      const state = freeze({phase, stage, result: {phases: scores.map(score => ({score}))}, behaviourPoints: [2, 0, 1, 0]});
      const expected = scores.map((score, n) => stage === 'outcome' || n < phase || (n === phase && stage !== 'story') ? score : 0);
      assert.deepEqual(scores.map((_, n) => phaseScore(state, n)), expected, `${phase}/${stage}`);
      assert.equal(controlScoreSoFar(state), expected.reduce((a, b) => a + b, 0));
      assert.equal(behaviourTotal(state), 3);
      assert.equal(finalTotal(state), controlScoreSoFar(state) + 3);
    }
  }
});

test('audit/scores: invalid indexes and non-finite stored scores display zero', () => {
  const state = {stage: 'outcome', phase: 3, result: {phases: [{score: NaN}, {score: Infinity}]}, behaviourPoints: [0, 0, 0, 0]};
  for (const index of [-1, 0, 1, 2, 0.5, NaN, '0']) assert.equal(phaseScore(state, index), 0);
});

test('audit/scores: best possible phase scores match independent exhaustive fixture enumeration', () => {
  const expected = [0, 0, 0, 0];
  for (let mask = 0; mask < 2 ** fixture.controls.length; mask++) {
    const selected = fixture.controls.filter((_, n) => mask & (1 << n));
    if (selected.reduce((sum, c) => sum + c.cost, 0) > fixture.budget) continue;
    if (categories.some(category => !selected.some(c => c.category === category))) continue;
    for (let n = 0; n < 4; n++) {
      expected[n] = Math.max(expected[n], selected.reduce((sum, c) => sum + fixture.phases[n].scores[c.id], 0));
    }
  }
  assert.deepEqual([0, 1, 2, 3].map(n => bestPossiblePhaseScore(freeze(fixture), n)), expected);
});

test('audit/scores: the optimum helper rejects invalid phase indexes and impossible baskets', () => {
  for (const index of [-1, 4, 0.5, NaN, '0']) assert.throws(() => bestPossiblePhaseScore(fixture, index), RangeError);
  const impossible = structuredClone(fixture);
  impossible.budget = 600000;
  impossible.controls.forEach(control => { control.cost = 600000; });
  assert.throws(() => bestPossiblePhaseScore(impossible, 0), /No valid selection fits the budget/);
});

test('audit/phases: every phase has the right story, label and last-phase status', () => {
  for (let phase = 0; phase < 4; phase++) {
    const state = Object.freeze({phase});
    assert.equal(currentPhase(data, state), data.phases[phase]);
    assert.equal(isLastPhase(data, state), phase === 3);
    assert.equal(phaseLabel(state), `Phase ${phase + 1} of 4`);
  }
  assert.equal(currentPhase(data, {phase: -1}), null);
  assert.equal(currentPhase(data, {phase: 4}), null);
});
