// Game state and the actions that change it. The UI and theme only read state
// and call dispatch(); nothing else mutates it. See TEAM_PLAN.md for the shape.

import {scoreSelection} from '../../1-foundation/starter/controls.mjs';

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

// Each phase runs story -> reveal -> checkpoint. After the last checkpoint the game
// moves to the outcome. 'choose' and 'outcome' are left with 'confirm' and 'reset'.
function nextStage(data, state) {
  if (!state.confirmed) return state;
  switch (state.stage) {
    case 'story':
      return {...state, stage: 'reveal'};
    case 'reveal':
      return {...state, stage: 'checkpoint'};
    case 'checkpoint': {
      const lastPhase = data.phases.length - 1;
      if (state.phase >= lastPhase) return {...state, stage: 'outcome'};
      return {...state, stage: 'story', phase: state.phase + 1};
    }
    default:
      return state;
  }
}

// Pure: returns a new state, never changes the old one.
export function reduce(data, state, action) {
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
      return nextStage(data, state);
    case 'reset':
      return createInitialState();
    default:
      return state;
  }
}
