// Tests for the stars, badges and short prices on the outcome and choose screens.
// They are pictures only, so they must agree with the night report and never change the state.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scoreSelection} from '../1-foundation/starter/controls.mjs';
import {POINTS_PER_SECURE_ANSWER, QUESTIONS_PER_CHECKPOINT} from '../src/config.mjs';
import {badges, nightStars, shortMoney, SQUADS} from '../src/ui/fun.mjs';
import {nightSummary} from '../src/ui/nightSummary.mjs';

const load = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const data = load('../1-foundation/data/challenge.json');
const bank = load('../1-foundation/data/questions.json');
const ALL_SECURE = POINTS_PER_SECURE_ANSWER * QUESTIONS_PER_CHECKPOINT;
const game = (ids, earned = 0) => ({
  selected: ids, result: scoreSelection(data, ids), behaviourPoints: [earned, earned, earned, earned], answers: [],
});
const CHEAPEST = ['P3', 'D3', 'R1'];
const STRONGEST = ['P1', 'P3', 'P4', 'P7', 'D3', 'D4', 'R1', 'R2', 'R5'];
const earned = list => list.filter(b => b.earned).map(b => b.id);

test('short prices read the way people say them', () => {
  assert.equal(shortMoney(350000), '£350k');
  assert.equal(shortMoney(1000000), '£1m');
  assert.equal(shortMoney(1500000), '£1.5m');
  assert.equal(shortMoney(3000000), '£3m');
});

test('every category has a squad, so no category is left without a name', () => {
  for (const control of data.controls) assert.ok(SQUADS[control.category], control.category);
});

test('the stars follow the night report: 3 for strong, 1 for weak', () => {
  assert.equal(nightStars(data, bank, game(STRONGEST, ALL_SECURE)).stars, 3);
  assert.equal(nightStars(data, bank, game(CHEAPEST)).stars, 1);
  const state = game(STRONGEST);
  assert.equal(nightStars(data, bank, state).rating, nightSummary(data, bank, state).rating);
});

test('a strong night with every answer secure earns the vault, sharp minds and perfect checkpoint badges', () => {
  const got = earned(badges(data, bank, game(STRONGEST, ALL_SECURE)));
  for (const id of ['vault', 'sharp', 'perfect']) assert.ok(got.includes(id), id);
});

test('a weak night with no secure answers earns none of the people badges', () => {
  const got = earned(badges(data, bank, game(CHEAPEST, 0)));
  for (const id of ['vault', 'sharp', 'perfect', 'budget']) assert.ok(!got.includes(id), id);
});

test('budget boss needs at least 90% of the budget spent', () => {
  const spentMost = game(['P2', 'P7', 'D4', 'R2']);   // £2,900,000 of £3,000,000
  assert.ok(spentMost.result.unspent <= data.budget * 0.1);
  assert.ok(earned(badges(data, bank, spentMost)).includes('budget'));
  assert.ok(!earned(badges(data, bank, game(CHEAPEST))).includes('budget'), 'the cheapest plan leaves most of it unspent');
});

test('every badge says how to earn it, and badges never change the game state', () => {
  const state = game(STRONGEST, ALL_SECURE);
  const before = JSON.stringify(state);
  for (const badge of badges(data, bank, state)) assert.ok(badge.how.length > 0 && badge.icon && badge.name);
  assert.equal(JSON.stringify(state), before);
});
