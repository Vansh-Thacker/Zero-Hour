// Tests for the behaviour checkpoints: choosing questions, marking answers, the 2-minute
// timer and team points. One behaviour per test.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  pickQuestions, markAnswer, teamBehaviourPoints,
  startTimer, timeLeft, pauseTimer, resumeTimer, isPaused, isExpired,
} from '../src/checkpoint/checkpoint.mjs';
import {CHECKPOINT_SECONDS, POINTS_PER_SECURE_ANSWER, QUESTIONS_PER_CHECKPOINT} from '../src/config.mjs';

const load = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const bank = load('../1-foundation/data/questions.json');
const data = load('../1-foundation/data/challenge.json');
const original = load('../1-foundation/data/questions.json');
const PHASES = data.phases.map(p => p.id);
const SECOND = 1000;
const LIMIT = CHECKPOINT_SECONDS * SECOND;
const ids = questions => questions.map(q => q.id);
const q = id => bank.questions.find(x => x.id === id);

// ---------------------------------------------------------------- choosing questions

test('every phase gets the configured number of questions', () => {
  for (const phaseId of PHASES) {
    assert.equal(pickQuestions(bank, phaseId, QUESTIONS_PER_CHECKPOINT).length, QUESTIONS_PER_CHECKPOINT, phaseId);
  }
});

test('a checkpoint never repeats a question', () => {
  for (const phaseId of PHASES) {
    const picked = ids(pickQuestions(bank, phaseId, QUESTIONS_PER_CHECKPOINT));
    assert.equal(new Set(picked).size, picked.length, phaseId);
  }
});

test('the same phase always gets the same questions, so every player sees the same', () => {
  for (const phaseId of PHASES) {
    assert.deepEqual(ids(pickQuestions(bank, phaseId, 4)), ids(pickQuestions(bank, phaseId, 4)));
  }
});

test('story questions for the phase come first', () => {
  const picked = pickQuestions(bank, 'phase_2', 4);
  assert.ok(picked.every(question => question.phase_id === 'phase_2'));
});

test('phase 1 uses the phishing questions from easiest to hardest', () => {
  assert.deepEqual(ids(pickQuestions(bank, 'phase_1', 4)), ['Q01', 'Q02', 'Q03', 'Q04']);
});

test('one question per difficulty tier comes before a second question on the same tier', () => {
  const picked = pickQuestions(bank, 'phase_1', 4);
  assert.ok(!ids(picked).includes('Q29'), 'Q29 is a second tier 1 question, so it waits');
  assert.deepEqual(picked.map(question => question.tier), [1, 2, 3, 4]);
});

test('questions in a checkpoint run from easiest to hardest', () => {
  for (const phaseId of PHASES) {
    const tiers = pickQuestions(bank, phaseId, 4).map(question => question.tier);
    assert.deepEqual(tiers, [...tiers].sort((a, b) => a - b), phaseId);
  }
});

test('a phase with too few story questions is filled with a question on the same topics', () => {
  const picked = pickQuestions(bank, 'phase_4', 4);
  const storyTopics = new Set(bank.questions.filter(x => x.phase_id === 'phase_4').map(x => x.category));
  const extra = picked.filter(question => question.phase_id !== 'phase_4');
  assert.equal(extra.length, 1);
  assert.equal(extra[0].phase_id, null);
  assert.ok(storyTopics.has(extra[0].category));
});

test('15 of the 16 story questions are used across the four checkpoints', () => {
  const used = new Set(PHASES.flatMap(phaseId => ids(pickQuestions(bank, phaseId, 4))));
  const story = bank.questions.filter(x => x.phase_id).map(x => x.id);
  assert.equal(story.length, 16);
  assert.equal(story.filter(id => used.has(id)).length, 15);
});

test('choosing questions never changes the question bank', () => {
  for (const phaseId of PHASES) pickQuestions(bank, phaseId, 4);
  assert.deepEqual(bank, original);
});

// ---------------------------------------------------------------- marking

test('a secure answer earns the configured points', () => {
  const result = markAnswer(q('Q01'), q('Q01').correct);
  assert.equal(result.correct, true);
  assert.equal(result.points, POINTS_PER_SECURE_ANSWER);
});

test('a wrong answer earns no points', () => {
  const wrong = ['A', 'B', 'C', 'D'].find(letter => letter !== q('Q01').correct);
  const result = markAnswer(q('Q01'), wrong);
  assert.equal(result.correct, false);
  assert.equal(result.points, 0);
});

test('the explanation comes back word for word, whatever the answer', () => {
  const expected = original.questions.find(x => x.id === 'Q04').explanation;
  for (const letter of ['A', 'B', 'C', 'D']) {
    assert.equal(markAnswer(q('Q04'), letter).explanation, expected);
  }
});

// ---------------------------------------------------------------- team points

test('one player: a secure answer earns full points', () => {
  assert.equal(teamBehaviourPoints([{questionId: 'Q01', correct: true}]), POINTS_PER_SECURE_ANSWER);
});

test('two players, one secure and one not: half points for that question', () => {
  const answers = [{questionId: 'Q01', correct: true}, {questionId: 'Q01', correct: false}];
  assert.equal(teamBehaviourPoints(answers), POINTS_PER_SECURE_ANSWER / 2);
});

test('team size does not change the score when everyone answers the same way', () => {
  const one = [{questionId: 'Q01', correct: true}];
  const three = [1, 2, 3].map(() => ({questionId: 'Q01', correct: true}));
  assert.equal(teamBehaviourPoints(three), teamBehaviourPoints(one));
});

test('each question is averaged on its own, then added up', () => {
  const answers = [
    {questionId: 'Q01', correct: true}, {questionId: 'Q01', correct: true},
    {questionId: 'Q02', correct: true}, {questionId: 'Q02', correct: false},
  ];
  assert.equal(teamBehaviourPoints(answers), POINTS_PER_SECURE_ANSWER * 1.5);
});

test('no answers earn no points', () => {
  assert.equal(teamBehaviourPoints([]), 0);
});

// ---------------------------------------------------------------- the 2-minute timer

test('a new checkpoint has the full two minutes', () => {
  assert.equal(timeLeft(startTimer(0), 0), LIMIT);
});

test('the timer counts down', () => {
  assert.equal(timeLeft(startTimer(0), 30 * SECOND), LIMIT - 30 * SECOND);
});

test('the timer never goes below zero', () => {
  assert.equal(timeLeft(startTimer(0), 10 * LIMIT), 0);
});

test('time is up at exactly two minutes, not before', () => {
  const timer = startTimer(0);
  assert.equal(isExpired(timer, LIMIT - 1), false);
  assert.equal(isExpired(timer, LIMIT), true);
});

test('pausing stops the clock', () => {
  const paused = pauseTimer(startTimer(0), 20 * SECOND);
  assert.equal(isPaused(paused), true);
  assert.equal(timeLeft(paused, 500 * SECOND), LIMIT - 20 * SECOND);
});

test('resuming starts the clock again from where it stopped', () => {
  const resumed = resumeTimer(pauseTimer(startTimer(0), 20 * SECOND), 80 * SECOND);
  assert.equal(isPaused(resumed), false);
  assert.equal(timeLeft(resumed, 90 * SECOND), LIMIT - 30 * SECOND);
});

test('pausing twice does nothing extra', () => {
  const once = pauseTimer(startTimer(0), 20 * SECOND);
  assert.equal(pauseTimer(once, 40 * SECOND), once);
});

test('resuming a running timer does nothing', () => {
  const timer = startTimer(0);
  assert.equal(resumeTimer(timer, 10 * SECOND), timer);
});

test('timer functions never change the timer they are given', () => {
  const timer = Object.freeze(startTimer(0));
  const paused = Object.freeze(pauseTimer(timer, 5 * SECOND));
  assert.doesNotThrow(() => resumeTimer(paused, 9 * SECOND));
  assert.equal(timer.pausedAt, null);
});

test('four questions at 30 seconds each fit the two-minute limit', () => {
  assert.ok(QUESTIONS_PER_CHECKPOINT * 30 <= CHECKPOINT_SECONDS);
});
