import {createGame, currentSeat, listen} from './net/client.mjs';

const status = document.getElementById('status');
const createButton = document.getElementById('create');
const roomSection = document.getElementById('room');
const codeElement = document.getElementById('code');
const addresses = document.getElementById('addresses');
const players = document.getElementById('players');
const count = document.getElementById('count');
const phase = document.getElementById('phase');

function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
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

  listen(view => {
    message('Room live. Players can join now.');
    count.textContent = String(view.players.length);
    players.replaceChildren();
    for (const player of view.players) {
      const item = document.createElement('li');
      item.textContent = `${player.name} — ${player.category}`;
      players.append(item);
    }
    phase.textContent = `Game stage: ${view.state.stage}`;
  }, error => message(error, true));
}

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
