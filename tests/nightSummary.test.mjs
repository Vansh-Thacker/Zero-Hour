// Tests for the night report on the outcome screen: the overall rating, what was lacking,
// and what would have done better. It must agree with the battle display and the scores.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scoreSelection} from '../1-foundation/starter/controls.mjs';
import {defenceStrength} from '../src/ui/defenceStrength.mjs';
import {nightSummary} from '../src/ui/nightSummary.mjs';
import {POINTS_PER_SECURE_ANSWER, QUESTIONS_PER_CHECKPOINT} from '../src/config.mjs';

const load = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const data = load('../1-foundation/data/challenge.json');
const bank = load('../1-foundation/data/questions.json');
const ALL_SECURE = POINTS_PER_SECURE_ANSWER * QUESTIONS_PER_CHECKPOINT;
const game = (ids, earned = 0, answers = []) => ({
  selected: ids, result: scoreSelection(data, ids), behaviourPoints: [earned, earned, earned, earned], answers,
});
const CHEAPEST = ['P3', 'D3', 'R1'];
const STRONGEST = ['P1', 'P3', 'P4', 'P7', 'D3', 'D4', 'R1', 'R2', 'R5'];

test('each phase in the report matches the battle display for that phase', () => {
  const state = game(STRONGEST, ALL_SECURE);
  const summary = nightSummary(data, bank, state);
  summary.phases.forEach((p, n) => assert.equal(p.wallPercent, defenceStrength(data, state, n).wallPercent));
});

test('the overall rating is the average wall strength across the night', () => {
  const summary = nightSummary(data, bank, game(STRONGEST));
  const average = Math.round(summary.phases.reduce((s, p) => s + p.wallPercent, 0) / 4);
  assert.equal(summary.average, average);
});

test('a weak plan is rated weak and its vault is breached', () => {
  const summary = nightSummary(data, bank, game(CHEAPEST));
  assert.equal(summary.rating, 'weak');
  assert.equal(summary.vault, 'breached');
});

test('the strongest plan is rated strong and its vault is secure', () => {
  const summary = nightSummary(data, bank, game(STRONGEST, ALL_SECURE));
  assert.equal(summary.rating, 'strong');
  assert.equal(summary.vault, 'secure');
});

test('the weakest phase is never stronger than the strongest phase', () => {
  const summary = nightSummary(data, bank, game(['P6', 'P7', 'D1', 'R1', 'R2']));
  assert.ok(summary.weakest.wallPercent <= summary.strongest.wallPercent);
});

test('each layer\'s points across the night add up to the control score', () => {
  const state = game(STRONGEST);
  const summary = nightSummary(data, bank, state);
  assert.equal(summary.layers.reduce((s, l) => s + l.points, 0), state.result.total);
});

test('the suggested control is never one the team already chose', () => {
  for (const ids of [CHEAPEST, ['P6', 'P7', 'D1', 'R1', 'R2']]) {
    const {suggestion} = nightSummary(data, bank, game(ids));
    assert.ok(suggestion && !ids.includes(suggestion.control.id));
  }
});

test('an "add" suggestion always fits the money left unspent', () => {
  const state = game(CHEAPEST);
  const {suggestion} = nightSummary(data, bank, state);
  assert.equal(suggestion.kind, 'add');
  assert.ok(suggestion.control.cost <= state.result.unspent);
});

test('the people share is the team\'s secure answers across all four checkpoints', () => {
  assert.equal(nightSummary(data, bank, game(CHEAPEST, ALL_SECURE)).peoplePercent, 100);
  assert.equal(nightSummary(data, bank, game(CHEAPEST, ALL_SECURE / 2)).peoplePercent, 50);
});

test('the topic to revisit is the one with the most answers that were not secure', () => {
  const answers = [
    {phase: 0, questionId: 'Q01', correct: false}, {phase: 0, questionId: 'Q02', correct: false},
    {phase: 1, questionId: 'Q09', correct: false}, {phase: 1, questionId: 'Q10', correct: true},
  ];
  const {weakestTopic} = nightSummary(data, bank, game(CHEAPEST, 0, answers));
  assert.deepEqual(weakestTopic, {topic: 'Phishing', missed: 2});
});

test('with every answer secure there is no topic to revisit', () => {
  const answers = [{phase: 0, questionId: 'Q01', correct: true}];
  assert.equal(nightSummary(data, bank, game(CHEAPEST, ALL_SECURE, answers)).weakestTopic, null);
});

test('the report never changes the game state', () => {
  const state = game(CHEAPEST, ALL_SECURE);
  const before = JSON.stringify(state);
  nightSummary(data, bank, state);
  assert.equal(JSON.stringify(state), before);
});
