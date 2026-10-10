// Tests for the question data, data/questions.json.
// They check the file has the shape the brief describes, so a typing mistake in the data is caught early.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const load = async name => JSON.parse(await readFile(new URL('../data/' + name, import.meta.url), 'utf8'));
const {questions} = await load('questions.json');
const challenge = await load('challenge.json');

const controlIds = challenge.controls.map(control => control.id);
const phaseIds = challenge.phases.map(phase => phase.id);

test('there are 40 questions, each with its own ID', () => {
  assert.equal(questions.length, 40);
  assert.equal(new Set(questions.map(question => question.id)).size, 40);
});

test('there are 10 topics, each with one question at every tier from 1 to 4', () => {
  const tiersByTopic = {};
  for (const question of questions) {
    tiersByTopic[question.category] ??= [];
    tiersByTopic[question.category].push(question.tier);
  }
  assert.equal(Object.keys(tiersByTopic).length, 10);
  for (const [topic, tiers] of Object.entries(tiersByTopic)) {
    assert.deepEqual(tiers.sort(), [1, 2, 3, 4], topic);
  }
});

test('every question has four options, one correct answer and an explanation', () => {
  for (const question of questions) {
    assert.deepEqual(Object.keys(question.options), ['A', 'B', 'C', 'D'], question.id);
    assert.ok(['A', 'B', 'C', 'D'].includes(question.correct), question.id);
    assert.ok(question.question.length > 0, question.id);
    assert.ok(question.explanation.length > 0, question.id);
  }
});

test('story phases and related controls all exist in the challenge data', () => {
  for (const question of questions) {
    assert.ok(question.phase_id === null || phaseIds.includes(question.phase_id), question.id);
    assert.ok(question.related_controls.includes('P5'), question.id + ' should list P5 Training and awareness');
    for (const controlId of question.related_controls) {
      assert.ok(controlIds.includes(controlId), question.id + ' lists ' + controlId);
    }
  }
});

test('every phase has at least three story questions', () => {
  // The brief suggests questions that fit the phase, so each phase needs some.
  for (const phaseId of phaseIds) {
    const storyQuestions = questions.filter(question => question.phase_id === phaseId);
    assert.ok(storyQuestions.length >= 3, phaseId + ' has fewer than three story questions');
  }
});

test('within each topic, the question IDs run from tier 1 to tier 4', () => {
  // The brief says so, for example Q01 is the easiest phishing question and Q04 the hardest.
  const topics = [...new Set(questions.map(question => question.category))];
  for (const topic of topics) {
    const inTopic = questions.filter(question => question.category === topic).sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(inTopic.map(question => question.tier), [1, 2, 3, 4], topic);
  }
});
