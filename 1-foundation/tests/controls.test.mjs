// Tests for the scoring module, 1-foundation/starter/controls.mjs.
// Run them with: npm test
//
// Most tests use data/fixture.json, a small made-up scenario with six controls and a £1,000,000 budget:
//   T1 Prevent £200,000   T2 Detect £150,000   T3 Respond £100,000
//   T4 Prevent £400,000   T5 Detect £500,000   T6 Respond £600,000

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {scoreSelection, validateData} from '../starter/controls.mjs';

const load = async name => JSON.parse(await readFile(new URL('../data/' + name, import.meta.url), 'utf8'));
const fixture = await load('fixture.json');
const challenge = await load('challenge.json');

// The cheapest valid selection in the fixture: one control from each category.
const oneOfEach = ['T1', 'T2', 'T3'];
const phaseScores = result => result.phases.map(phase => phase.score);

// ---------- Scoring ----------

test('scores every phase for the chosen controls', () => {
  const result = scoreSelection(fixture, oneOfEach);
  assert.deepEqual(phaseScores(result), [3, 6, 5, 4]);
  assert.equal(result.total, 18);
  assert.equal(result.spent, 450000);
  assert.equal(result.unspent, 550000);
});

test('every chosen control scores in every phase', () => {
  const result = scoreSelection(fixture, [...oneOfEach, 'T4']);
  assert.deepEqual(phaseScores(result), [6, 6, 6, 6]);
  for (const phase of result.phases) assert.equal(phase.contributions.length, 4);
});

test('the order of the selection does not change the scores', () => {
  assert.equal(scoreSelection(fixture, ['T3', 'T1', 'T2']).total, scoreSelection(fixture, oneOfEach).total);
});

// ---------- Rules that reject a selection ----------

test('rejects a control chosen twice', () => {
  assert.throws(() => scoreSelection(fixture, ['T1', 'T2', 'T3', 'T1']), /chosen twice/);
});

test('rejects a selection that is over budget', () => {
  // T1 + T2 + T5 + T6 costs £1,450,000 against £1,000,000.
  assert.throws(() => scoreSelection(fixture, ['T1', 'T2', 'T5', 'T6']), /Over budget/);
});

test('allows a selection that spends less than the budget', () => {
  const result = scoreSelection(fixture, oneOfEach);
  assert.equal(result.unspent, 550000);
});

test('allows a selection that spends the budget exactly', () => {
  const data = structuredClone(fixture);
  data.controls.find(control => control.id === 'T4').cost = 550000;
  const result = scoreSelection(data, [...oneOfEach, 'T4']);
  assert.equal(result.spent, 1000000);
  assert.equal(result.unspent, 0);
});

test('rejects a selection without all three categories', () => {
  assert.throws(() => scoreSelection(fixture, ['T1', 'T2']), /at least one Prevent, one Detect and one Respond/);
  assert.throws(() => scoreSelection(fixture, []), /Missing: Prevent, Detect, Respond/);
});

test('rejects a selection in the wrong shape', () => {
  assert.throws(() => scoreSelection(fixture, ['T1', 'T2', 'NOPE']), /is not a control/);
  assert.throws(() => scoreSelection(fixture, 'T1'), /must be a list of control IDs/);
});

test('error messages name the control and the amounts', () => {
  assert.throws(() => scoreSelection(fixture, ['T1', 'T2', 'T3', 'T1']), /T1 Test Prevent 1 is chosen twice/);
  assert.throws(() => scoreSelection(fixture, ['T1', 'T2', 'T5', 'T6']), /£1,450,000 chosen, £1,000,000 available/);
  assert.throws(() => scoreSelection(fixture, ['T1', 'T2']), /Missing: Respond/);
});

// ---------- The module leaves its inputs alone ----------

test('does not change the data or the selection it is given', () => {
  const selection = [...oneOfEach];
  const dataBefore = JSON.stringify(fixture);
  const selectionBefore = JSON.stringify(selection);

  const result = scoreSelection(fixture, selection);
  result.chosen.push('changed by the caller');   // changing the result must not reach the inputs

  assert.equal(JSON.stringify(fixture), dataBefore);
  assert.equal(JSON.stringify(selection), selectionBefore);
});

// ---------- Checking a scenario file ----------

test('validateData rejects a broken scenario and says what is wrong', () => {
  const brokenScenarios = [
    {change: data => { data.budget = 0; },                       message: /budget must be/},
    {change: data => { data.controls[0].cost = -1; },            message: /Control "T1" needs a cost/},
    {change: data => { data.controls[0].cost = '200000'; },      message: /Control "T1" needs a cost/},
    {change: data => { data.controls[0].cost = 1000001; },       message: /more than the whole budget/},
    {change: data => { data.controls[0].id = 'T2'; },            message: /Two controls share the id "T2"/},
    {change: data => { data.controls[0].category = 'Other'; },   message: /must be Prevent, Detect or Respond/},
    {change: data => { delete data.phases[0].scores.T1; },       message: /needs a score for control "T1"/},
    {change: data => { data.phases[0].scores.T1 = -1; },         message: /needs a score for control "T1"/},
    {change: data => { data.phases[0].scores.EXTRA = 1; },       message: /"EXTRA", which is not a control/},
    {change: data => { data.phases.pop(); },                     message: /exactly 4 phases/},
    {change: data => { delete data.phases[1].story; },           message: /Phase "phase-2" needs a story/},
    {change: data => { data.phases[2].title = ' '; },            message: /Phase "phase-3" needs a title/},
    {change: data => { delete data.phases[3].local_time; },      message: /Phase "phase-4" needs a local_time/},
    {change: data => { data.budget = 2 ** 60; },                 message: /budget must be/},
  ];
  for (const {change, message} of brokenScenarios) {
    const data = structuredClone(fixture);
    change(data);
    assert.throws(() => validateData(data), message);
  }
});

// ---------- Every possible selection ----------

test('every possible selection in the fixture matches a separate calculation', () => {
  // Each of the six controls is either chosen or not: 2 x 2 x 2 x 2 x 2 x 2 = 64 selections.
  // For each one, work out the answer a second, simpler way and check the scoring module agrees:
  // same total, or both say the selection breaks a rule.
  const controls = fixture.controls;
  for (let pattern = 0; pattern < 2 ** controls.length; pattern++) {
    const chosen = controls.filter((_, i) => pattern & (1 << i));
    const cost = chosen.reduce((sum, control) => sum + control.cost, 0);
    const valid = cost <= fixture.budget && new Set(chosen.map(control => control.category)).size === 3;
    const ids = chosen.map(control => control.id);
    if (valid) {
      const expected = fixture.phases.reduce((sum, phase) => sum + ids.reduce((s, id) => s + phase.scores[id], 0), 0);
      assert.equal(scoreSelection(fixture, ids).total, expected);
    } else {
      assert.throws(() => scoreSelection(fixture, ids));
    }
  }
});

// ---------- The real challenge data ----------

test('challenge data: the scenario file is valid, with a £3m budget, 18 controls and 4 phases', () => {
  assert.equal(validateData(challenge), true);
  assert.equal(challenge.budget, 3000000);
  assert.equal(challenge.controls.length, 18);
  assert.equal(challenge.phases.length, 4);
});

test('challenge data: the README example scores 14, 10, 8, 6, a total of 38', () => {
  const result = scoreSelection(challenge, ['P5', 'P6', 'P7', 'D1', 'R1', 'R2', 'R4']);
  assert.deepEqual(phaseScores(result), [14, 10, 8, 6]);
  assert.equal(result.total, 38);
  assert.equal(result.spent, 2550000);
});

test('challenge data: both £1m controls fit in the budget', () => {
  const result = scoreSelection(challenge, ['P2', 'D4', 'R1', 'R2', 'P3']);
  assert.equal(result.spent, 2750000);
  assert.equal(result.total, 36);
});

test('challenge data: the highest-scoring selection scores 54', () => {
  const result = scoreSelection(challenge, ['P1', 'P3', 'P4', 'P7', 'D3', 'D4', 'R1', 'R2', 'R5']);
  assert.deepEqual(phaseScores(result), [9, 15, 18, 12]);
  assert.equal(result.total, 54);
  assert.equal(result.unspent, 0);
});
