// The host screen: open a room, show the code, and run the night on the same screens as
// single player. Players choose the controls and answer on their phones; the host locks
// the plan, moves the night on and runs the checkpoint clock.

import {loadGameData} from './engine/loadData.mjs';
import {clearSeat, createGame, currentSeat} from './net/client.mjs';
import {showLiveRoom} from './net/liveRoom.mjs';
import {loadExtras} from './ui/app.mjs';
import {enableTilt} from './ui/effects.mjs';
import {hostStartScreen} from './ui/startScreens.mjs';

const root = document.getElementById('app');
const [game, extras] = await Promise.all([loadGameData(), loadExtras()]);

function showStart(view = {}) {
  root.replaceChildren(hostStartScreen(view, async () => {
    showStart({busy: true});
    const seat = await createGame().catch(() => ({error: 'Could not reach the game server. Is it running?'}));
    if (seat.error) return showStart({error: seat.error});
    showRoom(seat.code);
  }));
}

// The addresses phones can open, with the room code filled in for them.
async function joinAddresses(code) {
  try {
    const {addresses} = await fetch('/api/join-addresses').then(r => r.json());
    const urls = addresses.length ? addresses : [new URL('/play.html', location.origin).href];
    return urls.map(url => `${url}?code=${encodeURIComponent(code)}`);
  } catch {
    return [];
  }
}

async function showRoom(code) {
  showLiveRoom(root, game, extras, {
    extra: {addresses: await joinAddresses(code)},
    onLost: () => { clearSeat(); showStart({error: 'That game has ended (the server may have restarted). Open a new room.'}); },
  });
}

enableTilt();
const seat = currentSeat();
if (seat.host && seat.code && seat.token) showRoom(seat.code);
else showStart();
