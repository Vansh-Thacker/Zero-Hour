import {clearSeat, currentSeat, joinGame, listen} from './net/client.mjs';

const roleNames = {Prevent: 'Gatekeeper', Detect: 'Watcher', Respond: 'Responder'};
const status = document.getElementById('status');
const form = document.getElementById('join');
const roomSection = document.getElementById('room');
const role = document.getElementById('role');
const roleDetail = document.getElementById('role-detail');
const roomCode = document.getElementById('room-code');
const players = document.getElementById('players');
const phase = document.getElementById('phase');
let stream;

function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}

function showRoom(seat) {
  stream?.close();
  form.hidden = true;
  roomSection.hidden = false;
  roomCode.textContent = `Room ${seat.code}`;
  role.textContent = roleNames[seat.category] ?? seat.category;
  roleDetail.textContent = `You look after ${seat.category} controls.`;
  stream = listen(view => {
    message('Connected to your team.');
    players.replaceChildren();
    for (const player of view.players) {
      const item = document.createElement('li');
      item.textContent = `${player.name} — ${roleNames[player.category] ?? player.category}`;
      players.append(item);
    }
    phase.textContent = `Game stage: ${view.state.stage}`;
  }, error => message(error, true));
}

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
  stream?.close();
  clearSeat();
  roomSection.hidden = true;
  form.hidden = false;
  message('Enter another room code to join a game.');
});

const seat = currentSeat();
if (!seat.host && seat.code && seat.token) showRoom(seat);
