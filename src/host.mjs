// The host screen: open a room, show the code, and run the night on the same screens as
// single player. Players choose the controls and answer on their phones; the host locks
// the plan, moves the night on and runs the checkpoint clock.

import {loadGameData} from './engine/loadData.mjs';
import {clearSeat, createGame, currentSeat} from './net/client.mjs';
import {showLiveRoom} from './net/liveRoom.mjs';
import {loadExtras} from './ui/app.mjs';
import {enableTilt} from './ui/effects.mjs';
import {hostStartScreen} from './ui/startScreens.mjs';
import {phoneAddress, phoneJoinLinks} from './net/joinLinks.mjs';

const root = document.getElementById('app');
const [game, extras] = await Promise.all([loadGameData({moreTopics: true}), loadExtras()]);

function showStart(view = {}) {
  root.replaceChildren(hostStartScreen(view, async () => {
    showStart({busy: true});
    const seat = await createGame().catch(() => ({error: 'Could not reach the game server. Is it running?'}));
    if (seat.error) return showStart({error: seat.error});
    showRoom(seat.code);
  }));
}

// The addresses phones can open, with the room code filled in for them.
// Opened as localhost, this page's address only works on this laptop, so ask the server for its
// Wi-Fi addresses. Opened at any other address (the deployed site, or the laptop's own IP),
// that address is the one phones can reach: behind a host like Render, the server's own
// addresses are internal and no phone could open them.
async function joinAddresses(code) {
  if (phoneAddress(location.origin)) return phoneJoinLinks(location.origin, [], code);
  try {
    const response = await fetch('/api/join-addresses');
    if (!response.ok) return [];
    const {addresses} = await response.json();
    return phoneJoinLinks(location.origin, addresses, code);
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
