import {CHECKPOINT_SECONDS} from './config.mjs';
import {loadGameData} from './engine/loadData.mjs';
import {clearSeat, currentSeat, joinGame, listen, send} from './net/client.mjs';
import {ROLE_NAMES, h, pounds, redraw, spent, budgetPanel, basketPanel, logPanel, stagePanel, secondsLeft, clock} from './net/panels.mjs';

const ROLE_TEXT = {
  Prevent: 'the defences that stop an attack getting in',
  Detect: 'the tools that spot an attacker who is already inside',
  Respond: 'the people and plans that limit the damage',
};
const status = document.getElementById('status');
const form = document.getElementById('join');
const roomSection = document.getElementById('room');
const role = document.getElementById('role');
const roleDetail = document.getElementById('role-detail');
const roomCode = document.getElementById('room-code');
const players = document.getElementById('players');
const phase = document.getElementById('phase');
const live = document.getElementById('live');

const game = await loadGameData();
let stream;
let view = null;
let skew = 0;

function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}

async function play(action) {
  const reply = await send(action);
  if (reply.error) message(reply.error, true);
  else message('Connected to your team.');
}

// Choosing: this player's own controls, with Buy and Remove. Other roles are read-only.
function myControls(state, you) {
  const left = game.data.budget - spent(game.data, state);
  const mine = game.data.controls.filter(c => c.category === you.category);
  return h('section', {class: 'card'},
    h('h2', {}, `Your controls: ${ROLE_NAMES[you.category]} (${you.category})`),
    h('p', {class: 'quiet'}, 'Only your role can buy or remove these. The host confirms for the team.'),
    h('ul', {class: 'controls'}, ...mine.map(c => {
      const owned = state.selected.includes(c.id);
      const affordable = c.cost <= left;
      return h('li', {class: owned ? 'owned' : ''},
        h('span', {}, h('b', {}, `${c.id} ${c.name}`), h('small', {}, `${pounds(c.cost)} · ${c.description}`)),
        state.confirmed
          ? h('span', {class: 'quiet'}, owned ? '✓ Bought' : 'Not bought')
          : owned
            ? h('button', {id: `remove-${c.id}`, class: 'secondary', 'aria-label': `Remove ${c.name}`,
                onclick: () => play({type: 'deselect', id: c.id})}, '✓ Bought · Remove')
            : h('button', {id: `buy-${c.id}`, class: 'primary', disabled: !affordable, 'aria-label': `Buy ${c.name}`,
                onclick: () => play({type: 'select', id: c.id})}, affordable ? 'Buy' : "Can't afford"));
    })));
}

// Checkpoint: this player's questions. Each answer shows this player's own result and the
// explanation word for word; when time is up, unanswered questions show theirs too.
function myQuestions(state, you) {
  const {checkpoint} = state;
  const left = checkpoint.expired ? 0 : secondsLeft(checkpoint, CHECKPOINT_SECONDS, skew);
  const paused = checkpoint.timer.pausedAt !== null;
  return h('section', {class: 'card'},
    h('h2', {}, 'Behaviour checkpoint'),
    h('p', {class: 'timer'}, checkpoint.expired ? '⏱ Time is up' : `${clock(left)}${paused ? ' · paused by the host' : ''}`),
    ...checkpoint.questionIds.map(id => {
      const question = game.bank.questions.find(q => q.id === id);
      const mine = state.answers.find(a => a.phase === state.phase && a.questionId === id && a.player === you.id);
      const closed = Boolean(mine) || checkpoint.expired;
      return h('fieldset', {class: 'question'},
        h('legend', {}, `${question.category} · ${question.tier_label}`),
        h('p', {class: 'ask'}, question.question),
        h('div', {class: 'options'}, ...['A', 'B', 'C', 'D'].map(letter => {
          const mark = closed && letter === question.correct ? ' ✓ secure answer' : mine?.choice === letter ? ' ✕ your answer' : '';
          return h('button', {
            id: `answer-${id}-${letter}`, class: `option${closed && letter === question.correct ? ' right' : ''}${mine?.choice === letter && !mine.correct ? ' wrong' : ''}`,
            disabled: closed || paused, onclick: () => play({type: 'answer', questionId: id, choice: letter}),
          }, h('b', {}, letter), ` ${question.options[letter]}${mark}`);
        })),
        closed ? h('p', {class: mine?.correct ? 'result ok' : 'result'},
          h('b', {}, mine ? (mine.correct ? '✓ Secure answer. ' : '✕ Not the secure answer. ') : '⏱ Not answered: no points. '),
          question.explanation) : null);
    }));
}

function draw() {
  if (!view) return;
  const {state, you} = view;
  role.textContent = `${ROLE_NAMES[you.category]} · ${you.category}`;
  roleDetail.textContent = `${you.name}, you choose the team's ${you.category} controls: ${ROLE_TEXT[you.category]}.`;
  players.replaceChildren(...view.players.map(player =>
    h('li', {}, `${player.name} — ${ROLE_NAMES[player.category]} (${player.category})${player.id === you.id ? ' · you' : ''}`)));
  phase.textContent = `Game stage: ${state.stage}`;
  redraw(live,
    budgetPanel(game.data, state),
    stagePanel(game.data, state),
    state.stage === 'checkpoint' ? myQuestions(state, you) : null,
    state.stage === 'choose' || state.stage === 'story' ? myControls(state, you) : null,
    basketPanel(game.data, state, view.players),
    logPanel(view.log));
}

function showForm(text, error = false) {
  stream?.close();
  view = null;
  roomSection.hidden = true;
  form.hidden = false;
  message(text, error);
}

function showRoom(seat) {
  stream?.close();
  form.hidden = true;
  roomSection.hidden = false;
  roomCode.textContent = `Room ${seat.code}`;
  stream = listen(next => {
    message('Connected to your team.');
    skew = next.serverNow - Date.now();
    view = next;
    draw();
  }, error => message(error, true), () => showForm('That game has ended or your seat has gone. Join again with the code on the host screen.', true));
}

setInterval(() => { if (view?.state.stage === 'checkpoint') draw(); }, 1000);

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const seat = await joinGame(document.getElementById('code').value, document.getElementById('name').value);
    if (seat.error) throw new Error(seat.error);
    showRoom(seat);
  } catch (error) {
    message(error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.getElementById('leave').addEventListener('click', () => {
  clearSeat();
  showForm('Enter another room code to join a game.');
});

const seat = currentSeat();
if (!seat.host && seat.code && seat.token) showRoom(seat);
