// The player's phone: join a room with the code from the host screen, then play the game
// on the same screens as single player. Each player chooses their own category's controls
// and answers the checkpoint questions for themselves.

import {loadGameData} from './engine/loadData.mjs';
import {clearSeat, currentSeat, joinGame} from './net/client.mjs';
import {showLiveRoom} from './net/liveRoom.mjs';
import {loadExtras} from './ui/app.mjs';
import {enableTilt} from './ui/effects.mjs';
import {joinScreen, nameProblem} from './ui/startScreens.mjs';

const root = document.getElementById('app');
const [game, extras] = await Promise.all([loadGameData(), loadExtras()]);
let live = null;

// The username from the home page, so players aren't asked twice.
function savedName() {
  try { return sessionStorage.getItem('zero-hour-player-name') ?? ''; } catch { return ''; }
}

function showJoin(view = {}) {
  live?.close();
  live = null;
  const code = view.code ?? new URLSearchParams(location.search).get('code') ?? '';
  root.replaceChildren(joinScreen({name: savedName(), ...view, code}, async (code, name) => {
    const problem = !code ? 'Enter the room code from the host screen.' : nameProblem(name);
    if (problem) return showJoin({code, name, error: problem});
    showJoin({code, name, busy: true});
    const seat = await joinGame(code, name).catch(() => ({error: 'Could not reach the game. Check you are on the same Wi-Fi.'}));
    if (seat.error) return showJoin({code, name, error: seat.error});
    try { sessionStorage.setItem('zero-hour-player-name', name); } catch { /* not remembered */ }
    showRoom();
  }));
  root.querySelector(view.code || code ? '#player-name' : '#room-code')?.focus();
}

function showRoom() {
  live = showLiveRoom(root, game, extras, {
    extra: {onLeave: () => { clearSeat(); showJoin(); }},
    onLost: () => showJoin({error: 'That game has ended or your seat has gone. Join again with the code on the host screen.'}),
  });
}

enableTilt();
const seat = currentSeat();
if (!seat.host && seat.code && seat.token) showRoom();
else showJoin();
