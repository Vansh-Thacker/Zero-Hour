import {CHECKPOINT_SECONDS} from './config.mjs';
import {loadGameData} from './engine/loadData.mjs';
import {createGame, currentSeat, listen, send} from './net/client.mjs';
import {ROLE_NAMES, h, redraw, budgetPanel, basketPanel, logPanel, stagePanel, secondsLeft, clock} from './net/panels.mjs';

const status = document.getElementById('status');
const createButton = document.getElementById('create');
const roomSection = document.getElementById('room');
const codeElement = document.getElementById('code');
const addresses = document.getElementById('addresses');
const players = document.getElementById('players');
const count = document.getElementById('count');
const phase = document.getElementById('phase');
const live = document.getElementById('live');

const game = await loadGameData();
let view = null;
let skew = 0;
let resetArmed = false;

function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}

async function hostAction(action) {
  const reply = await send(action);
  if (reply.error) message(reply.error, true);
  else message('Room live.');
}

// The host's buttons change with the stage of the game.
function hostButtons(state) {
  const {stage, checkpoint} = state;
  if (stage === 'choose') {
    return h('p', {class: 'actions'},
      h('button', {id: 'confirm', class: 'primary', onclick: () => hostAction({type: 'confirm'})}, "Confirm the team's choice"),
      h('span', {class: 'quiet'}, ' After this, nobody can change the controls.'));
  }
  const reset = h('button', {id: 'reset', class: 'secondary', onclick: () => {
    if (!resetArmed) { resetArmed = true; draw(); return; }
    resetArmed = false;
    hostAction({type: 'reset'});
  }}, resetArmed ? 'Click again to start a new game' : 'Reset game');

  const labels = {story: 'Reveal the scores', reveal: 'Start the checkpoint', checkpoint: 'Move on'};
  const buttons = [];
  if (labels[stage]) buttons.push(h('button', {id: 'next', class: 'primary', onclick: () => hostAction({type: 'next'})}, labels[stage]));
  if (stage === 'checkpoint' && !checkpoint.expired) {
    const paused = checkpoint.timer.pausedAt !== null;
    buttons.push(h('button', {id: 'pause', class: 'secondary', onclick: () => hostAction({type: paused ? 'resume' : 'pause'})},
      paused ? 'Resume the timer' : 'Pause the timer'));
  }
  return h('p', {class: 'actions'}, ...buttons, reset);
}

// During a checkpoint: the shared clock and how many players have answered each question.
function checkpointPanel(state, playerCount) {
  if (state.stage !== 'checkpoint') return null;
  const {checkpoint} = state;
  const left = checkpoint.expired ? 0 : secondsLeft(checkpoint, CHECKPOINT_SECONDS, skew);
  const paused = checkpoint.timer.pausedAt !== null;
  return h('section', {class: 'card'},
    h('h2', {}, 'Behaviour checkpoint'),
    h('p', {class: 'timer'}, checkpoint.expired ? '⏱ Time is up' : `${clock(left)}${paused ? ' · paused' : ''}`),
    h('ul', {}, ...checkpoint.questionIds.map(id => {
      const answered = state.answers.filter(a => a.phase === state.phase && a.questionId === id).length;
      const question = game.bank.questions.find(q => q.id === id);
      return h('li', {}, `${id} (${question.category}): ${answered} of ${playerCount} answered`);
    })),
    h('p', {class: 'quiet'}, `Behaviour points this phase: ${Math.round(state.behaviourPoints[state.phase] * 10) / 10} (team average).`));
}

function draw() {
  if (!view) return;
  const {state} = view;
  count.textContent = String(view.players.length);
  players.replaceChildren(...view.players.map(player =>
    h('li', {}, `${player.name} — ${ROLE_NAMES[player.category]} (${player.category})`)));
  phase.textContent = `Game stage: ${state.stage}`;
  redraw(live,
    budgetPanel(game.data, state),
    stagePanel(game.data, state),
    checkpointPanel(state, view.players.length),
    hostButtons(state),
    basketPanel(game.data, state, view.players),
    logPanel(view.log));
}

function showRoom(seat) {
  createButton.hidden = true;
  roomSection.hidden = false;
  codeElement.textContent = seat.code;

  fetch('/api/join-addresses').then(response => response.json()).then(({addresses: urls}) => {
    addresses.replaceChildren();
    for (const url of urls.length ? urls : [new URL('/play.html', location.origin).href]) {
      const link = document.createElement('a');
      link.href = url;
      link.textContent = url;
      const item = document.createElement('li');
      item.append(link);
      addresses.append(item);
    }
  }).catch(() => message('The join address could not be shown. Players can still use this laptop.', true));

  listen(next => {
    message('Room live. Players can join now.');
    skew = next.serverNow - Date.now();
    view = next;
    draw();
  }, error => message(error, true), () => {
    view = null;
    roomSection.hidden = true;
    createButton.hidden = false;
    createButton.disabled = false;
    message('That game has ended (the server may have restarted). Create a new one.', true);
  });
}

// Keep the countdown moving between updates from the server.
setInterval(() => { if (view?.state.stage === 'checkpoint') draw(); }, 1000);

createButton.addEventListener('click', async () => {
  createButton.disabled = true;
  try {
    const seat = await createGame();
    if (seat.error) throw new Error(seat.error);
    showRoom(seat);
  } catch (error) {
    message(error.message, true);
    createButton.disabled = false;
  }
});

const seat = currentSeat();
if (seat.host && seat.code && seat.token) showRoom(seat);
