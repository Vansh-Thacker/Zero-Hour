// Tests for the debrief (src/debrief/debrief.mjs). One rule per test.
// They use the real challenge and questions with the real scoring module, so the debrief
// is checked against exactly what the engine works out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreSelection } from '../1-foundation/starter/controls.mjs';
import { buildDebrief } from '../src/debrief/debrief.mjs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const challenge = read('../1-foundation/data/challenge.json');
const questions = read('../1-foundation/data/questions.json');
const game = { challenge, questions };
const questionById = new Map(questions.questions.map(q => [q.id, q]));

// A finished game, built the way the engine builds it.
function finishedState(selected, { behaviourPoints = [0, 0, 0, 0], answers = [] } = {}) {
  return { stage: 'outcome', selected, confirmed: true, result: scoreSelection(challenge, selected), behaviourPoints, answers };
}

const cheap = ['P3', 'D3', 'R1'];
const strong = ['P1', 'P3', 'P4', 'P7', 'D3', 'D4', 'R1', 'R2', 'R5'];

// ------------------------------------------------------------ scores match the engine

test('the control score is the engine total', () => {
  const state = finishedState(cheap);
  assert.equal(buildDebrief(game, state).controlScore, state.result.total);
});

test('each phase shows the same control points as the engine', () => {
  for (const selected of [cheap, strong]) {
    const state = finishedState(selected);
    assert.deepEqual(buildDebrief(game, state).phases.map(p => p.controlPoints), state.result.phases.map(p => p.score));
  }
});

test('the points shown for each chosen control match the engine', () => {
  const state = finishedState(strong);
  const d = buildDebrief(game, state);
  d.phases.forEach((phase, i) => {
    for (const c of [...phase.helped, ...phase.scoredNothing]) {
      assert.equal(c.points, state.result.phases[i].contributions.find(x => x.id === c.id).points, `${phase.phaseId} ${c.id}`);
    }
  });
});

test('behaviour points are kept separate and then added to make the total', () => {
  const d = buildDebrief(game, finishedState(cheap, { behaviourPoints: [2, 0, 4, 2] }));
  assert.equal(d.behaviourPoints, 8);
  assert.equal(d.total, d.controlScore + 8);
});

test('a game with no behaviour points has a total equal to the control score', () => {
  const d = buildDebrief(game, finishedState(cheap));
  assert.equal(d.total, d.controlScore);
});

// ------------------------------------------------------------ helped and missed

test('"helped" lists only chosen controls that scored, best first', () => {
  const d = buildDebrief(game, finishedState(strong));
  for (const phase of d.phases) {
    assert.ok(phase.helped.every(c => strong.includes(c.id) && c.points > 0), phase.phaseId);
    const points = phase.helped.map(c => c.points);
    assert.deepEqual(points, [...points].sort((a, b) => b - a), phase.phaseId);
  }
});

test('"missed" is never a control the player chose', () => {
  for (const selected of [cheap, strong, ['P5', 'D1', 'R2']]) {
    for (const phase of buildDebrief(game, finishedState(selected)).phases) {
      if (phase.missed) assert.ok(!selected.includes(phase.missed.id), `${phase.phaseId} suggested ${phase.missed.id}`);
    }
  }
});

test('"missed" is the highest-scoring control not chosen in that phase', () => {
  const d = buildDebrief(game, finishedState(cheap));
  challenge.phases.forEach((phase, i) => {
    const bestUnchosen = Math.max(...Object.entries(phase.scores).filter(([id]) => !cheap.includes(id)).map(([, p]) => p));
    assert.equal(d.phases[i].missed.points, bestUnchosen, phase.id);
  });
});

test('ties for "missed" go to the lowest control ID, so the debrief is always the same', () => {
  // In phase 1, P5, D1 and R2 all score 3 and none is in the cheap set.
  assert.equal(buildDebrief(game, finishedState(cheap)).phases[0].missed.id, 'D1');
});

test('a phase where none of the chosen controls scored still has a debrief', () => {
  // P6 Email security, D3 Threat hunting and R6 Retainer all score 0 in phase 3.
  const phase3 = buildDebrief(game, finishedState(['P6', 'D3', 'R6'])).phases[2];
  assert.equal(phase3.controlPoints, 0);
  assert.deepEqual(phase3.helped, []);
  assert.match(phase3.summary, /None of your controls helped/);
});

test('each phase says what happened, using the story from the scenario', () => {
  const d = buildDebrief(game, finishedState(cheap));
  d.phases.forEach((phase, i) => assert.equal(phase.story, challenge.phases[i].story));
});

test('the three controls already in place are listed with the reason they score nothing', () => {
  const d = buildDebrief(game, finishedState(cheap));
  assert.equal(d.alreadyInPlace.length, 3);
  assert.ok(d.alreadyInPlace.every(c => c.name && c.why));
});

// ------------------------------------------------------------ questions

const answered = [
  { phase: 0, questionId: 'Q01', choice: 'B', correct: true },
  { phase: 0, questionId: 'Q02', choice: 'A', correct: false },
  { phase: 0, questionId: 'Q29', choice: null, correct: false },
];

test('each question is shown with its explanation word for word from questions.json', () => {
  const d = buildDebrief(game, finishedState(cheap, { answers: answered }));
  for (const a of d.phases[0].answers) {
    assert.equal(a.explanation, questionById.get(a.questionId).explanation, a.questionId);
    assert.equal(a.question, questionById.get(a.questionId).question, a.questionId);
  }
});

test('a correct answer is shown as secure and a wrong one as not secure', () => {
  const [first, second] = buildDebrief(game, finishedState(cheap, { answers: answered })).phases[0].answers;
  assert.equal(first.status, 'secure');
  assert.equal(second.status, 'not secure');
});

test('an unanswered question is shown as unanswered, not as wrong', () => {
  const third = buildDebrief(game, finishedState(cheap, { answers: answered })).phases[0].answers[2];
  assert.equal(third.status, 'unanswered');
  assert.equal(third.choice, null);
  assert.ok(third.explanation.length > 0);
});

test('the right answer is given for every question, so players can learn from mistakes', () => {
  const second = buildDebrief(game, finishedState(cheap, { answers: answered })).phases[0].answers[1];
  assert.equal(second.correctAnswer, 'C');
  assert.equal(second.correctText, questionById.get('Q02').options.C);
});

test('answers appear only under the phase they were given in', () => {
  const d = buildDebrief(game, finishedState(cheap, { answers: answered }));
  assert.equal(d.phases[0].answers.length, 3);
  assert.ok(d.phases.slice(1).every(p => p.answers.length === 0));
});

// ------------------------------------------------------------ safety

test('the debrief never changes the game data or the state it is given', () => {
  const state = finishedState(strong, { answers: answered });
  const before = JSON.stringify([challenge, questions, state]);
  buildDebrief(game, state);
  assert.equal(JSON.stringify([challenge, questions, state]), before);
});

test('the same game always gives the same debrief', () => {
  const state = finishedState(strong, { answers: answered });
  assert.deepEqual(buildDebrief(game, state), buildDebrief(game, state));
});

test('missing game data gives a readable error', () => {
  assert.throws(() => buildDebrief({}, finishedState(cheap)), /needs game.challenge/);
});
