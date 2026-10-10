// Game state and the actions that change it. The UI and theme only read state
// and call dispatch(); nothing else mutates it. See TEAM_PLAN.md for the shape.
//
// reduce(game, state, action):
//   game   = {data, bank}: challenge.json and questions.json
//   action = {type, ...}. Actions that depend on time carry `now` (milliseconds),
//            so the engine stays pure and one clock (the server's) can drive every screen.

import {scoreSelection} from '../../1-foundation/starter/controls.mjs';
import {CHECKPOINT_SECONDS, POINTS_PER_SECURE_ANSWER, QUESTIONS_PER_CHECKPOINT} from '../config.mjs';

export function createInitialState() {
  return {
    stage: 'choose',
    phase: 0,
    selected: [],
    confirmed: false,
    result: null,
    checkpoint: null,
    behaviourPoints: [0, 0, 0, 0],
    answers: [],
    error: null,
  };
}

const pounds = n => '£' + n.toLocaleString('en-GB');

// Returns a readable reason if the control cannot be added, or null if it can.
// TODO: replace with canSelect() from selection.mjs once Rayyan's helper lands.
function selectProblem(data, state, id) {
  if (state.confirmed) return 'The choice is confirmed and can no longer change.';
  const control = data.controls.find(c => c.id === id);
  if (!control) return `"${id}" is not a control.`;
  if (state.selected.includes(id)) return `${control.name} is already chosen. Each control can only be chosen once.`;
  const spent = state.selected.reduce((sum, chosen) => sum + data.controls.find(c => c.id === chosen).cost, 0);
  const left = data.budget - spent;
  if (control.cost > left) return `Not enough budget for ${control.name}: it costs ${pounds(control.cost)} and ${pounds(left)} is left.`;
  return null;
}

// --- Stand-ins for Ghassan's checkpoint module, with the names agreed in TEAM_PLAN.md. ---
// TODO: import these from ../checkpoint/checkpoint.mjs once they land.
const LIMIT_MS = CHECKPOINT_SECONDS * 1000;

function pickQuestions(bank, phaseId, count) {
  return bank.questions.filter(q => q.phase_id === phaseId).slice(0, count);
}

function markAnswer(question, choice) {
  const correct = choice === question.correct;
  return {correct, points: correct ? POINTS_PER_SECURE_ANSWER : 0, explanation: question.explanation};
}

function startTimer(now) {
  return {startedAt: now, pausedAt: null, pausedMs: 0};
}

export function timeLeft(timer, now) {
  const pausedFor = timer.pausedMs + (timer.pausedAt === null ? 0 : now - timer.pausedAt);
  return Math.max(0, LIMIT_MS - (now - timer.startedAt - pausedFor));
}

// Team average per question, so the number of players does not change the score.
function teamBehaviourPoints(answers) {
  const byQuestion = new Map();
  for (const a of answers) byQuestion.set(a.questionId, [...(byQuestion.get(a.questionId) ?? []), a]);
  let points = 0;
  for (const given of byQuestion.values()) {
    points += POINTS_PER_SECURE_ANSWER * given.filter(a => a.correct).length / given.length;
  }
  return points;
}
// --- End of stand-ins. ---

function startCheckpoint(game, state, now) {
  const phaseId = game.data.phases[state.phase].id;
  const questions = pickQuestions(game.bank, phaseId, QUESTIONS_PER_CHECKPOINT);
  return {questionIds: questions.map(q => q.id), timer: startTimer(now), expired: false};
}

// Each phase runs story -> reveal -> checkpoint. After the last checkpoint the game
// moves to the outcome. 'choose' and 'outcome' are left with 'confirm' and 'reset'.
// Moving on from a checkpoint is always allowed: unanswered questions score nothing.
function nextStage(game, state, action) {
  if (!state.confirmed) return state;
  switch (state.stage) {
    case 'story':
      return {...state, stage: 'reveal'};
    case 'reveal':
      if (typeof action.now !== 'number') return {...state, error: 'A checkpoint needs the current time to start.'};
      return {...state, stage: 'checkpoint', checkpoint: startCheckpoint(game, state, action.now), error: null};
    case 'checkpoint': {
      const lastPhase = game.data.phases.length - 1;
      if (state.phase >= lastPhase) return {...state, stage: 'outcome', checkpoint: null};
      return {...state, stage: 'story', phase: state.phase + 1, checkpoint: null};
    }
    default:
      return state;
  }
}

function answer(game, state, action) {
  const {checkpoint} = state;
  if (state.stage !== 'checkpoint' || typeof action.now !== 'number') return state;
  if (!checkpoint.questionIds.includes(action.questionId)) return {...state, error: 'That question is not part of this checkpoint.'};
  if (!['A', 'B', 'C', 'D'].includes(action.choice)) return {...state, error: 'Choose one of the four answers.'};
  if (checkpoint.expired || timeLeft(checkpoint.timer, action.now) === 0) {
    return {...state, checkpoint: {...checkpoint, expired: true}, error: 'Time is up for this checkpoint.'};
  }
  const player = action.player ?? null;
  if (state.answers.some(a => a.phase === state.phase && a.questionId === action.questionId && a.player === player)) {
    return {...state, error: 'This question has already been answered.'};
  }

  const question = game.bank.questions.find(q => q.id === action.questionId);
  const {correct} = markAnswer(question, action.choice);
  const answers = [...state.answers, {phase: state.phase, questionId: question.id, player, choice: action.choice, correct}];
  const behaviourPoints = [...state.behaviourPoints];
  behaviourPoints[state.phase] = teamBehaviourPoints(answers.filter(a => a.phase === state.phase));
  return {...state, answers, behaviourPoints, error: null};
}

// Pause, resume and timeout only apply during a checkpoint that still has time left.
function timerAction(state, action) {
  const {checkpoint} = state;
  if (state.stage !== 'checkpoint' || checkpoint.expired || typeof action.now !== 'number') return state;
  const {timer} = checkpoint;
  switch (action.type) {
    case 'pause':
      if (timer.pausedAt !== null) return state;
      return {...state, checkpoint: {...checkpoint, timer: {...timer, pausedAt: action.now}}};
    case 'resume':
      if (timer.pausedAt === null) return state;
      return {...state, checkpoint: {...checkpoint, timer: {...timer, pausedAt: null, pausedMs: timer.pausedMs + action.now - timer.pausedAt}}};
    case 'timeout':
      // Only believed if the time really has run out, so no screen can end a checkpoint early.
      if (timeLeft(timer, action.now) > 0) return state;
      return {...state, checkpoint: {...checkpoint, expired: true}};
  }
}

// Pure: returns a new state, never changes the old one.
export function reduce(game, state, action) {
  const {data} = game;
  switch (action.type) {
    case 'select': {
      const problem = selectProblem(data, state, action.id);
      if (problem) return {...state, error: problem};
      return {...state, selected: [...state.selected, action.id], error: null};
    }
    case 'deselect': {
      if (state.confirmed) return state;
      return {...state, selected: state.selected.filter(id => id !== action.id), error: null};
    }
    case 'confirm': {
      if (state.confirmed) return state;
      try {
        const result = scoreSelection(data, state.selected);
        return {...state, confirmed: true, result, stage: 'story', error: null};
      } catch (e) {
        return {...state, error: e.message};
      }
    }
    case 'next':
      return nextStage(game, state, action);
    case 'answer':
      return answer(game, state, action);
    case 'pause':
    case 'resume':
    case 'timeout':
      return timerAction(state, action);
    case 'reset':
      return createInitialState();
    default:
      return state;
  }
}
