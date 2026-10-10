// Tests for the battle display's numbers: how strong the defences were in a phase.
// The display must always agree with the scoring module.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scoreSelection} from '../1-foundation/starter/controls.mjs';
import {bestPossiblePhaseScore} from '../src/engine/scores.mjs';
import {defenceStrength, peopleRate, ATTACKS} from '../src/ui/defenceStrength.mjs';
import {POINTS_PER_SECURE_ANSWER, QUESTIONS_PER_CHECKPOINT} from '../src/config.mjs';

const data = JSON.parse(readFileSync(new URL('../1-foundation/data/challenge.json', import.meta.url)));
const game = ids => ({selected: ids, result: scoreSelection(data, ids)});
const CHEAPEST = ['P3', 'D3', 'R1'];
const STRONGEST = ['P1', 'P3', 'P4', 'P7', 'D3', 'D4', 'R1', 'R2', 'R5'];

test('the score shown is the scoring module\'s phase score', () => {
  const state = game(STRONGEST);
  for (let n = 0; n < 4; n++) assert.equal(defenceStrength(data, state, n).score, state.result.phases[n].score);
});

test('strength is measured against the best a £3m plan could get in that phase', () => {
  const result = defenceStrength(data, game(CHEAPEST), 0);
  assert.equal(result.best, bestPossiblePhaseScore(data, 0));
  assert.equal(result.percent, Math.round(100 * result.score / result.best));
});

test('the best plan for a phase shows a full-strength wall', () => {
  const result = defenceStrength(data, game(STRONGEST), 2);   // this plan is the best possible for phase 3
  assert.equal(result.percent, 100);
  assert.equal(result.level, 'strong');
  assert.equal(result.through, 0);
});

test('the cheapest plan is weak and lets most attacks through', () => {
  const result = defenceStrength(data, game(CHEAPEST), 0);
  assert.equal(result.level, 'weak');
  assert.ok(result.through > result.held);
});

test('a middling phase is holding', () => {
  const result = defenceStrength(data, game(['P6', 'P7', 'D1', 'R1', 'R2']), 1);  // 10 of 17
  assert.equal(result.level, 'holding');
});

test('held and through attacks always add up to the total', () => {
  for (const ids of [CHEAPEST, STRONGEST, ['P6', 'P7', 'D1', 'R1', 'R2']]) {
    for (let n = 0; n < 4; n++) {
      const result = defenceStrength(data, game(ids), n);
      assert.equal(result.held + result.through, ATTACKS);
    }
  }
});

test('each defence layer shows the points its chosen controls scored', () => {
  const state = game(CHEAPEST);
  const layers = defenceStrength(data, state, 0).layers;
  const total = layers.reduce((sum, layer) => sum + layer.points, 0);
  assert.equal(total, state.result.phases[0].score);
  assert.deepEqual(layers.map(layer => layer.category), ['Prevent', 'Detect', 'Respond']);
});

test('the suggested missing control is never one the team chose', () => {
  for (let n = 0; n < 4; n++) {
    const missed = defenceStrength(data, game(CHEAPEST), n).missed;
    assert.ok(missed && !CHEAPEST.includes(missed.id));
  }
});

test('working out strength never changes the game state', () => {
  const state = game(CHEAPEST);
  const before = JSON.stringify(state);
  defenceStrength(data, state, 0);
  assert.equal(JSON.stringify(state), before);
});

// ---------------------------------------------------------------- people: answers change the next phase

const ALL_SECURE = POINTS_PER_SECURE_ANSWER * QUESTIONS_PER_CHECKPOINT;
const withAnswers = (ids, earned) => ({...game(ids), behaviourPoints: [earned, earned, earned, earned]});

test('in phase 1 people are not tested yet and stop nothing', () => {
  const result = defenceStrength(data, withAnswers(CHEAPEST, ALL_SECURE), 0);
  assert.equal(result.people.tested, false);
  assert.equal(result.heldByPeople, 0);
});

test('secure answers at a checkpoint stop more attacks in the next phase', () => {
  const none = defenceStrength(data, withAnswers(CHEAPEST, 0), 1);
  const all = defenceStrength(data, withAnswers(CHEAPEST, ALL_SECURE), 1);
  assert.equal(none.heldByPeople, 0);
  assert.ok(all.heldByPeople > 0);
  assert.ok(all.held > none.held);
});

test('people use the previous checkpoint, not the current one', () => {
  const state = {...game(CHEAPEST), behaviourPoints: [ALL_SECURE, 0, 0, 0]};
  assert.ok(defenceStrength(data, state, 1).heldByPeople > 0);   // patched by checkpoint 1
  assert.equal(defenceStrength(data, state, 2).heldByPeople, 0); // checkpoint 2 had no secure answers
});

test('good answers lift a weak phase but cannot make a weak plan strong', () => {
  const none = defenceStrength(data, withAnswers(CHEAPEST, 0), 1);
  const all = defenceStrength(data, withAnswers(CHEAPEST, ALL_SECURE), 1);
  assert.equal(none.level, 'weak');
  assert.equal(all.level, 'holding');
});

test('people never change the control score or the controls\' share', () => {
  const none = defenceStrength(data, withAnswers(CHEAPEST, 0), 2);
  const all = defenceStrength(data, withAnswers(CHEAPEST, ALL_SECURE), 2);
  assert.equal(all.score, none.score);
  assert.equal(all.percent, none.percent);
  assert.equal(all.heldByControls, none.heldByControls);
});

test('attacks held by controls and people, plus those through, always add up to the total', () => {
  for (const earned of [0, ALL_SECURE / 2, ALL_SECURE]) {
    for (let n = 0; n < 4; n++) {
      const result = defenceStrength(data, withAnswers(CHEAPEST, earned), n);
      assert.equal(result.heldByControls + result.heldByPeople + result.through, ATTACKS);
    }
  }
});

test('the people rate is the share of the previous checkpoint answered securely', () => {
  assert.equal(peopleRate({behaviourPoints: [ALL_SECURE / 2, 0, 0, 0]}, 1), 0.5);
  assert.equal(peopleRate({behaviourPoints: [0, 0, 0, 0]}, 0), null);
});
