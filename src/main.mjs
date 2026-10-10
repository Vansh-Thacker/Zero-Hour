// The page starts on the home screen (single player or multiplayer), then the name screen.
// Single player: load the data, hold the state, and redraw after every action.
// Multiplayer: host a room (host.html) or join one (play.html); both talk to the multiplayer server.
// The multiplayer server drives the same reduce() function; see TEAM_PLAN.md.

import {validateData} from '../1-foundation/starter/controls.mjs';
import {GAME_NAME, DATA_PATHS} from './config.mjs';
import {createInitialState, reduce, timeLeft} from './engine/state.mjs';
import {loadExtras, render, tick} from './ui/app.mjs';
import {enableTilt} from './ui/effects.mjs';
import {homeScreen, multiScreen, nameScreen, nameProblem} from './ui/startScreens.mjs';

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

// --- Start screens: home, (host or join,) then name. Nothing here touches the game state. ---

const NAME_KEY = 'zero-hour-player-name';

function savedName() {
  try { return sessionStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}

function saveName(name) {
  try { sessionStorage.setItem(NAME_KEY, name); } catch { /* Private browsing: the name just isn't remembered. */ }
}

function showHome() {
  root.replaceChildren(homeScreen(mode => mode === 'multi' ? showMulti() : showName({mode, name: savedName()})));
  window.scrollTo({top: 0, behavior: 'instant'});
}

// The host doesn't need a name: host.html creates the room. Players enter a name, then join.
function showMulti() {
  root.replaceChildren(multiScreen({
    host: () => location.assign('/host.html'),
    join: () => showName({mode: 'multi', name: savedName()}),
    back: showHome,
  }));
  window.scrollTo({top: 0, behavior: 'instant'});
}

function showName(view) {
  root.replaceChildren(nameScreen(view, {
    back: view.mode === 'multi' ? showMulti : showHome,
    go: name => {
      const problem = nameProblem(name);
      if (problem) return showName({...view, name, error: problem});
      saveName(name);
      if (view.mode === 'multi') location.assign('/play.html');
      else startGame();
    },
  }));
  root.querySelector('#player-name')?.focus();
}

// --- Single player ---

async function startGame() {
  root.replaceChildren(Object.assign(document.createElement('p'), {style: 'padding: 24px', textContent: 'Loading the night…'}));
  try {
    const [data, bank] = await Promise.all([loadJson(DATA_PATHS.challenge), loadJson(DATA_PATHS.questions)]);
    validateData(data);
    game = {data, bank};
    extras = await loadExtras();
    state = createInitialState();
    render(root, state, game, dispatch, extras);
  } catch (e) {
    root.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'alert', role: 'alert', textContent: `The game could not start: ${e.message}`,
    }));
  }
}

document.title = GAME_NAME;
enableTilt();
showHome();
