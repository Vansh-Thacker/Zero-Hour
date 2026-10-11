const KEY = 'zero-hour-seat';
let fallbackSeat = {};

function saved() {
  // Session storage survives refresh but gives each browser tab its own seat.
  try { return JSON.parse(sessionStorage.getItem(KEY)) ?? fallbackSeat; }
  catch { return fallbackSeat; }
}

function save(seat) {
  fallbackSeat = seat;
  try { sessionStorage.setItem(KEY, JSON.stringify(seat)); }
  catch { /* Private browsing may disable storage. The current tab still works. */ }
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  const reply = await response.json();
  return response.ok ? reply : {error: reply.error ?? `Request failed (${response.status}).`};
}

export async function createGame() {
  const seat = await post('/api/rooms', {});
  if (!seat.error) save({...seat, host: true});
  return seat;
}

// team: the team name to join, or a new team's name. Leave it out to join the room's first team.
export async function joinGame(code, name, team) {
  const normalCode = code.trim().toUpperCase();
  const seat = await post(`/api/rooms/${encodeURIComponent(normalCode)}/join`, team ? {name, team} : {name});
  if (!seat.error) save({...seat, host: false});
  return seat;
}

export const currentSeat = saved;

// "Leave room": tell the server first, so the host stops showing this player, then forget the seat.
export async function leaveGame() {
  const {code, token} = saved();
  if (code && token) await post(`/api/rooms/${encodeURIComponent(code)}/leave`, {token}).catch(() => null);
  clearSeat();
}

export function clearSeat() {
  fallbackSeat = {};
  try { sessionStorage.removeItem(KEY); }
  catch { /* A private tab may not allow storage. */ }
}

let leaving = false;
addEventListener('pagehide', () => { leaving = true; });

// onLost runs once if the server says this seat is gone (for example, it restarted).
// Any other drop retries by itself and gets the game as it is now when it is back.
export function listen(onView, onError = () => {}, onLost = () => {}) {
  const {code, token} = saved();
  if (!code || !token) throw new Error('Create or join a game first.');

  const url = `/api/rooms/${encodeURIComponent(code)}/events?token=${encodeURIComponent(token)}`;
  const handle = {stream: null, close() { this.closed = true; this.stream?.close(); }};
  let lost = false;
  const open = () => {
    const stream = new EventSource(url);
    handle.stream = stream;
    stream.onmessage = event => onView(JSON.parse(event.data));
    stream.onerror = async () => {
      if (leaving || handle.closed || lost) return;
      onError('Connection lost. Trying to reconnect…');
      if (stream.readyState !== EventSource.CLOSED) return; // the browser is already retrying
      const status = await fetch(url, {method: 'HEAD'}).then(r => r.status, () => 0);
      if (lost || handle.closed) return; // another error already handled this
      if (status === 403 || status === 404) {
        lost = true;
        handle.close();
        clearSeat();
        onLost();
      }
      else setTimeout(() => { if (!handle.closed) open(); }, 2000);
    };
  };
  open();
  return handle;
}

export function send(action) {
  const {code, token} = saved();
  if (!code || !token) return Promise.resolve({error: 'Create or join a game first.'});
  return post(`/api/rooms/${encodeURIComponent(code)}/actions`, {token, action});
}
