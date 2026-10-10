// Game state and the actions that change it. The UI and theme only read state
// and call dispatch(); nothing else mutates it. See TEAM_PLAN.md for the shape.
//
// reduce(game, state, action):
//   game   = {data, bank}: challenge.json and questions.json
//   action = {type, ...}. Actions that depend on time carry `now` (milliseconds),
//            so the engine stays pure and one clock (the server's) can drive every screen.

import {scoreSelection} from '../../1-foundation/starter/controls.mjs';
import {QUESTIONS_PER_CHECKPOINT} from '../config.mjs';
import {
  pickQuestions, markAnswer, teamBehaviourPoints,
  startTimer, timeLeft, pauseTimer, resumeTimer, isPaused, isExpired,
} from '../checkpoint/checkpoint.mjs';

// The screens read the countdown through the engine, so they only import one module.
export {timeLeft};

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
  if (checkpoint.expired || isExpired(checkpoint.timer, action.now)) {
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
      if (isPaused(timer)) return state;
      return {...state, checkpoint: {...checkpoint, timer: pauseTimer(timer, action.now)}};
    case 'resume':
      if (!isPaused(timer)) return state;
      return {...state, checkpoint: {...checkpoint, timer: resumeTimer(timer, action.now)}};
    case 'timeout':
      // Only believed if the time really has run out, so no screen can end a checkpoint early.
      if (!isExpired(timer, action.now)) return state;
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
