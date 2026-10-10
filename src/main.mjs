// Single-screen mode: load the data, hold the state, and redraw after every action.
// The multiplayer server drives the same reduce() function; see TEAM_PLAN.md.

import {validateData} from '../1-foundation/starter/controls.mjs';
import {GAME_NAME, BUSINESS_NAME, DATA_PATHS} from './config.mjs';
import {createInitialState, reduce, timeLeft} from './engine/state.mjs';

const root = document.getElementById('app');

// TODO: replace with loadGameData() from engine/loadData.mjs once Rayyan's helper lands.
async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
  return response.json();
}

let game, state;

// Every action is stamped with the time, so the checkpoint timer works.
function dispatch(action) {
  state = reduce(game, state, {now: Date.now(), ...action});
  render();
}

// Once a second: redraw the countdown, and end the checkpoint when time runs out.
setInterval(() => {
  if (state?.stage !== 'checkpoint' || state.checkpoint.expired) return;
  if (timeLeft(state.checkpoint.timer, Date.now()) === 0) dispatch({type: 'timeout'});
  else render();
}, 1000);

// TODO: replace with the real screens from src/ui/ once they land.
function render() {
  root.replaceChildren(devView(state, game, dispatch));
}

function el(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  Object.assign(node, attrs);
  return node;
}

function devView(state, {data, bank}, dispatch) {
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
    const {checkpoint} = state;
    const paused = checkpoint.timer.pausedAt !== null;
    const seconds = Math.ceil(timeLeft(checkpoint.timer, Date.now()) / 1000);
    view.append(el('p', checkpoint.expired ? '⏱ Time is up' : `⏱ ${seconds}s left${paused ? ' (paused)' : ''}`));
    if (!checkpoint.expired) view.append(button(paused ? 'Resume timer' : 'Pause timer', {type: paused ? 'resume' : 'pause'}));
    for (const id of checkpoint.questionIds) {
      const question = bank.questions.find(q => q.id === id);
      const given = state.answers.find(a => a.phase === state.phase && a.questionId === id);
      view.append(el('h3', `${question.id}: ${question.question}`));
      if (given || checkpoint.expired) {
        const verdict = !given ? '— Not answered: 0 points' : given.correct ? '✓ Secure answer' : '✗ Not the secure answer';
        view.append(el('p', verdict), el('p', question.explanation));
      } else {
        for (const [letter, text] of Object.entries(question.options)) {
          view.append(button(`${letter}: ${text}`, {type: 'answer', questionId: id, choice: letter}));
        }
      }
    }
    view.append(el('p', `Behaviour points this phase: ${state.behaviourPoints[state.phase]}`));
  } else if (state.stage === 'outcome') {
    const behaviour = state.behaviourPoints.reduce((sum, p) => sum + p, 0);
    view.append(el('p', `Control score: ${state.result.total}`), el('p', `Behaviour points: ${behaviour}`),
      el('p', `Total: ${state.result.total + behaviour}`));
  }

  if (['story', 'reveal', 'checkpoint'].includes(state.stage)) view.append(button('Next', {type: 'next'}));
  view.append(el('p'), button('Reset', {type: 'reset'}));
  return view;
}

try {
  const [data, bank] = await Promise.all([loadJson(DATA_PATHS.challenge), loadJson(DATA_PATHS.questions)]);
  validateData(data);
  game = {data, bank};
  state = createInitialState();
  document.title = GAME_NAME;
  render();
} catch (e) {
  root.replaceChildren(el('p', `The game could not start: ${e.message}`, {role: 'alert'}));
}
