// Integrated unit tests using the actual challenge and question bank, with frozen
// inputs so accidental mutations fail immediately. No wall-clock delays or browser needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createInitialState, reduce} from '../src/engine/state.mjs';
import {pickQuestions, markAnswer, teamBehaviourPoints, startTimer, pauseTimer, resumeTimer, timeLeft, isExpired} from '../src/checkpoint/checkpoint.mjs';
import {buildDebrief} from '../src/debrief/debrief.mjs';
import {POINTS_PER_SECURE_ANSWER, CHECKPOINT_SECONDS, QUESTIONS_PER_CHECKPOINT} from '../src/config.mjs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const game = freeze({data: read('../1-foundation/data/challenge.json'), bank: read('../1-foundation/data/questions.json')});
const limit = CHECKPOINT_SECONDS * 1000;
const question = id => game.bank.questions.find(q => q.id === id);
const apply = (state, action) => reduce(game, freeze(state), Object.freeze(action));
const ids = picked => picked.map(q => q.id);
function checkpoint() {
  let state = createInitialState();
  for (const id of ['P3', 'D3', 'R1']) state = apply(state, {type: 'select', id});
  for (const type of ['confirm', 'next', 'next']) state = apply(state, {type, now: 1000});
  return state;
}

test('audit/checkpoint: reversing the question bank leaves each phase selection unchanged', () => {
  const reordered = {questions: [...game.bank.questions].reverse()};
  for (const phase of game.data.phases) {
    assert.deepEqual(ids(pickQuestions(game.bank, phase.id, 4)), ids(pickQuestions(reordered, phase.id, 4)));
    assert.deepEqual(pickQuestions(game.bank, phase.id, 0), []);
  }
});

test('audit/checkpoint: all forty questions preserve the original options and explanation while marking all four choices', () => {
  for (const q of game.bank.questions) {
    for (const choice of ['A', 'B', 'C', 'D']) {
      assert.deepEqual(markAnswer(q, choice), {correct: choice === q.correct, points: choice === q.correct ? POINTS_PER_SECURE_ANSWER : 0, explanation: q.explanation});
    }
    for (const choice of [null, undefined, '', 'X']) {
      assert.deepEqual(markAnswer(q, choice), {correct: false, points: 0, explanation: q.explanation});
    }
  }
});

test('audit/checkpoint: every selected question is unchanged source content', () => {
  for (const phase of game.data.phases) {
    const selected = pickQuestions(game.bank, phase.id, QUESTIONS_PER_CHECKPOINT);
    assert.equal(selected.length, QUESTIONS_PER_CHECKPOINT);
    for (const q of selected) assert.deepEqual(q, question(q.id));
  }
});

test('audit/timer: repeated pause cycles exclude exactly the accumulated pause time', () => {
  const initial = freeze(startTimer(1000));
  const firstPause = freeze(pauseTimer(initial, 11000));
  const firstResume = freeze(resumeTimer(firstPause, 41000));
  const secondPause = freeze(pauseTimer(firstResume, 46000));
  const final = resumeTimer(secondPause, 146000);
  assert.deepEqual(initial, {startedAt: 1000, pausedAt: null, pausedMs: 0});
  assert.equal(final.pausedMs, 130000);
  assert.equal(timeLeft(final, 146000), limit - 15000);
  assert.equal(isExpired(final, 1000 + 130000 + limit - 1), false);
  assert.equal(isExpired(final, 1000 + 130000 + limit), true);
});

test('audit/timer: pausing at timestamp zero is a genuine pause', () => {
  const timer = freeze(pauseTimer(startTimer(0), 0));
  assert.equal(timeLeft(timer, 1000000), limit);
  const resumed = resumeTimer(timer, 1000000);
  assert.equal(timeLeft(resumed, 1000010), limit - 10);
});

test('audit/timer: pausing an already elapsed timer never restores time', () => {
  const paused = pauseTimer(startTimer(0), limit + 100);
  const resumed = resumeTimer(paused, limit + 10000);
  assert.equal(timeLeft(paused, limit + 5000), 0);
  assert.equal(timeLeft(resumed, limit + 10000), 0);
});

test('audit/team: fractional averages are preserved and answers are never changed', () => {
  const answers = freeze([
    {questionId: 'Q01', correct: true}, {questionId: 'Q01', correct: false}, {questionId: 'Q01', correct: false},
    {questionId: 'Q02', correct: true}, {questionId: 'Q02', correct: true},
  ]);
  assert.equal(teamBehaviourPoints(answers), POINTS_PER_SECURE_ANSWER * (1 / 3 + 1));
  assert.equal(teamBehaviourPoints([...answers].reverse()), teamBehaviourPoints(answers));
});

test('audit/engine: all sixteen secure answers survive all four phases and agree with the final debrief', () => {
  let state = checkpoint();
  const expectedAnswers = [];
  for (let phase = 0; phase < 4; phase++) {
    const startedAt = 1000 + phase * (limit + 10000);
    assert.equal(state.stage, 'checkpoint');
    assert.equal(state.phase, phase);
    assert.equal(state.checkpoint.questionIds.length, QUESTIONS_PER_CHECKPOINT);
    assert.equal(timeLeft(state.checkpoint.timer, startedAt), limit);
    for (const questionId of state.checkpoint.questionIds) {
      state = apply(state, {type: 'answer', questionId, choice: question(questionId).correct, now: startedAt + 1000});
      expectedAnswers.push(questionId);
    }
    assert.equal(state.behaviourPoints[phase], QUESTIONS_PER_CHECKPOINT * POINTS_PER_SECURE_ANSWER);
    state = apply(state, {type: 'next', now: startedAt + 2000});
    if (phase < 3) {
      state = apply(state, {type: 'next', now: startedAt + limit + 10000});
      state = apply(state, {type: 'next', now: startedAt + limit + 10000});
    }
  }
  assert.equal(state.stage, 'outcome');
  assert.equal(state.checkpoint, null);
  assert.deepEqual(state.answers.map(answer => answer.questionId), expectedAnswers);
  assert.deepEqual(state.behaviourPoints, [8, 8, 8, 8]);
  const debrief = buildDebrief(game, freeze(state));
  assert.equal(debrief.controlScore, 14);
  assert.equal(debrief.behaviourPoints, 32);
  assert.equal(debrief.total, 46);
  for (const phase of debrief.phases) {
    assert.equal(phase.answers.length, QUESTIONS_PER_CHECKPOINT);
    for (const answer of phase.answers) {
      assert.equal(answer.status, 'secure');
      assert.equal(answer.explanation, question(answer.questionId).explanation);
    }
  }
  const reset = apply(state, {type: 'reset'});
  assert.deepEqual(reset, createInitialState());
  assert.notEqual(reset.answers, state.answers);
});

test('audit/engine: wrong answers stay zero and cannot be replaced by later correct answers', () => {
  let state = checkpoint();
  const [questionId] = state.checkpoint.questionIds;
  const wrong = ['A', 'B', 'C', 'D'].find(choice => choice !== question(questionId).correct);
  state = apply(state, {type: 'answer', questionId, choice: wrong, now: 2000});
  const originalAnswer = state.answers[0];
  state = apply(state, {type: 'answer', questionId, choice: question(questionId).correct, now: 3000});
  assert.match(state.error, /already been answered/);
  assert.equal(state.answers.length, 1);
  assert.deepEqual(state.answers[0], originalAnswer);
  assert.equal(state.behaviourPoints[0], 0);
  const debrief = buildDebrief(game, state);
  assert.equal(debrief.phases[0].answers[0].status, 'not secure');
});

test('audit/engine: answers exactly at expiry are rejected while earlier points remain', () => {
  let state = checkpoint();
  const [first, second] = state.checkpoint.questionIds;
  state = apply(state, {type: 'answer', questionId: first, choice: question(first).correct, now: 1000 + limit - 1});
  assert.equal(state.behaviourPoints[0], POINTS_PER_SECURE_ANSWER);
  state = apply(state, {type: 'answer', questionId: second, choice: question(second).correct, now: 1000 + limit});
  assert.equal(state.checkpoint.expired, true);
  assert.equal(state.answers.length, 1);
  assert.equal(state.behaviourPoints[0], POINTS_PER_SECURE_ANSWER);
  const after = apply(state, {type: 'resume', now: 1000 + limit + 1});
  assert.equal(after, state);
});

test('audit/engine: timeout with no answers keeps behaviour zero and permits the next phase', () => {
  let state = checkpoint();
  state = apply(state, {type: 'timeout', now: 1000 + limit});
  assert.equal(state.checkpoint.expired, true);
  assert.deepEqual(state.behaviourPoints, [0, 0, 0, 0]);
  state = apply(state, {type: 'next', now: 1000 + limit});
  assert.equal(state.stage, 'story');
  assert.equal(state.phase, 1);
});

test('audit/engine: invalid choice leaves the question available and a subsequent valid answer clears its error', () => {
  let state = checkpoint();
  const [questionId] = state.checkpoint.questionIds;
  state = apply(state, {type: 'answer', questionId, choice: 'Z', now: 2000});
  assert.equal(state.answers.length, 0);
  assert.match(state.error, /four answers/);
  state = apply(state, {type: 'answer', questionId, choice: question(questionId).correct, now: 3000});
  assert.equal(state.error, null);
  assert.equal(state.answers.length, 1);
});

test('audit/engine: two simultaneous games have independent selections, arrays and timers', () => {
  const first = checkpoint();
  const second = checkpoint();
  assert.notEqual(first.answers, second.answers);
  assert.notEqual(first.behaviourPoints, second.behaviourPoints);
  assert.notEqual(first.selected, second.selected);
  assert.notEqual(first.checkpoint.timer, second.checkpoint.timer);
  const [questionId] = first.checkpoint.questionIds;
  const answered = apply(first, {type: 'answer', questionId, choice: question(questionId).correct, now: 2000});
  assert.equal(answered.answers.length, 1);
  assert.equal(second.answers.length, 0);
  assert.equal(second.behaviourPoints[0], 0);
});

test('audit/engine: changing confirmed choices or repeating confirmation leaves the scored plan intact', () => {
  const initial = checkpoint();
  const selected = [...initial.selected];
  const result = structuredClone(initial.result);
  let state = apply(initial, {type: 'select', id: 'P4'});
  state = apply(state, {type: 'deselect', id: 'P3'});
  state = apply(state, {type: 'confirm'});
  assert.deepEqual(state.selected, selected);
  assert.deepEqual(state.result, result);
});

test('audit/debrief: game data aliases produce the same result and malformed data is rejected', () => {
  const state = checkpoint();
  const expected = buildDebrief(game, state);
  assert.deepEqual(buildDebrief({challenge: game.data, questions: game.bank.questions}, state), expected);
  assert.deepEqual(buildDebrief({scenario: game.data, bank: game.bank}, state), expected);
  assert.throws(() => buildDebrief(null, state), /loaded challenge/);
});
