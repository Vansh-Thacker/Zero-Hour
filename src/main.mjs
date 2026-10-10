// Single-screen mode: load the data, hold the state, and redraw after every action.
// The multiplayer server drives the same reduce() function; see TEAM_PLAN.md.

import {validateData} from '../1-foundation/starter/controls.mjs';
import {GAME_NAME, BUSINESS_NAME, DATA_PATHS} from './config.mjs';
import {createInitialState, reduce} from './engine/state.mjs';

const root = document.getElementById('app');

// TODO: replace with loadGameData() from engine/loadData.mjs once Rayyan's helper lands.
async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
  return response.json();
}

let data, bank, state;

function dispatch(action) {
  state = reduce(data, state, action);
  render();
}

// TODO: replace with the real screens from src/ui/ once they land.
function render() {
  root.replaceChildren(devView(state, data, dispatch));
}

function el(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  Object.assign(node, attrs);
  return node;
}

function devView(state, data, dispatch) {
  const view = el('section');
  const button = (label, action) => el('button', label, {type: 'button', onclick: () => dispatch(action)});
  const phase = data.phases[state.phase];

  view.append(el('h1', GAME_NAME), el('p', BUSINESS_NAME), el('p', `Stage: ${state.stage} · Phase ${state.phase + 1} of ${data.phases.length}`));
  if (state.error) view.append(el('p', `⚠ ${state.error}`, {role: 'alert'}));

  if (state.stage === 'choose') {
    for (const control of data.controls) {
      const chosen = state.selected.includes(control.id);
      view.append(button(`${chosen ? '✓ ' : ''}${control.id} ${control.name} (${control.category}, £${control.cost.toLocaleString('en-GB')})`,
        {type: chosen ? 'deselect' : 'select', id: control.id}));
    }
    view.append(el('p'), button('Confirm choice', {type: 'confirm'}));
  } else if (state.stage === 'story') {
    view.append(el('h2', `${phase.local_time}: ${phase.title}`), el('p', phase.story));
  } else if (state.stage === 'reveal') {
    const scored = state.result.phases[state.phase];
    for (const {id, points} of scored.contributions) view.append(el('p', `${id}: ${points} points`));
    view.append(el('p', `Phase score: ${scored.score}`));
  } else if (state.stage === 'checkpoint') {
    view.append(el('p', 'Behaviour checkpoint goes here (waiting for the checkpoint module).'));
  } else if (state.stage === 'outcome') {
    view.append(el('p', `Control score: ${state.result.total}`));
  }

  if (['story', 'reveal', 'checkpoint'].includes(state.stage)) view.append(button('Next', {type: 'next'}));
  view.append(el('p'), button('Reset', {type: 'reset'}));
  return view;
}

try {
  [data, bank] = await Promise.all([loadJson(DATA_PATHS.challenge), loadJson(DATA_PATHS.questions)]);
  validateData(data);
  state = createInitialState();
  document.title = GAME_NAME;
  render();
} catch (e) {
  root.replaceChildren(el('p', `The game could not start: ${e.message}`, {role: 'alert'}));
}
