// Shows a multiplayer game. The server holds the game; this page draws each view it sends and
// sends actions back. Phones play their own team's game on the same screens as single player
// (src/ui/app.mjs). The host sees every team at once (src/ui/competitionScreen.mjs).
// Used by the host screen (host.mjs) and the phones (play.mjs).

import {listen, send} from './client.mjs';
import {render, tick} from '../ui/app.mjs';
import {renderCompetition} from '../ui/competitionScreen.mjs';

// The checkpoint timer is in the server's clock. Move it to this device's clock,
// so the countdown on every screen matches.
function onThisClock(state, skew) {
  const timer = state.checkpoint?.timer;
  if (!timer) return state;
  const local = {...timer, startedAt: timer.startedAt - skew, pausedAt: timer.pausedAt === null ? null : timer.pausedAt - skew};
  return {...state, checkpoint: {...state.checkpoint, timer: local}};
}

/**
 * Connect this seat and keep its screen up to date.
 * extra: things for the room bar that don't come from the server (join addresses, a Leave button).
 * onLost: the server no longer knows this seat (game ended or server restarted).
 */
export function showLiveRoom(root, game, extras, {extra = {}, onLost}) {
  let room = null;
  let state = null;
  let notice = null;

  const draw = () => room.you.host
    ? renderCompetition(root, {...room, state, notice}, game, dispatch, extra)
    : render(root, state, game, dispatch, extras, {...room, ...extra, notice});

  async function dispatch(action) {
    if (action.type === 'redraw') return draw();   // a screen-only change, nothing for the server
    const reply = await send(action);
    if (reply.error) {
      notice = reply.error;
      draw();
    }
  }

  const stream = listen(view => {
    room = view;
    state = onThisClock(view.state, view.serverNow - Date.now());
    notice = null;
    draw();
  }, error => {
    notice = error;
    if (room) draw();
  }, onLost);

  // Once a second during a checkpoint: move the countdown. The server ends the checkpoint itself.
  const timer = setInterval(() => {
    if (state?.stage === 'checkpoint' && !state.checkpoint.expired) tick(root, state);
  }, 1000);

  return {close() { clearInterval(timer); stream.close(); }};
}
