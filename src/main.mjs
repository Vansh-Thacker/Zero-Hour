// Single-screen mode: load the data, hold the state, and redraw after every action.
// The multiplayer server drives the same reduce() function; see TEAM_PLAN.md.

import {validateData} from '../1-foundation/starter/controls.mjs';
import {GAME_NAME, DATA_PATHS} from './config.mjs';
import {createInitialState, reduce, timeLeft} from './engine/state.mjs';
import {loadExtras, render, tick} from './ui/app.mjs';
import {enableTilt} from './ui/effects.mjs';

const root = document.getElementById('app');

// TODO: replace with loadGameData() from engine/loadData.mjs once Rayyan's helper lands.
async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
  return response.json();
}

let game, state, extras;

// Every action is stamped with the time, so the checkpoint timer works.
function dispatch(action) {
  state = reduce(game, state, {now: Date.now(), ...action});
  render(root, state, game, dispatch, extras);
}

// Once a second: update the countdown, and end the checkpoint when time runs out.
setInterval(() => {
  if (state?.stage !== 'checkpoint' || state.checkpoint.expired) return;
  if (timeLeft(state.checkpoint.timer, Date.now()) === 0) dispatch({type: 'timeout'});
  else tick(root, state);
}, 1000);

try {
  const [data, bank] = await Promise.all([loadJson(DATA_PATHS.challenge), loadJson(DATA_PATHS.questions)]);
  validateData(data);
  game = {data, bank};
  extras = await loadExtras();
  state = createInitialState();
  document.title = GAME_NAME;
  enableTilt();
  render(root, state, game, dispatch, extras);
} catch (e) {
  root.replaceChildren(Object.assign(document.createElement('p'), {
    className: 'alert', role: 'alert', textContent: `The game could not start: ${e.message}`,
  }));
}
