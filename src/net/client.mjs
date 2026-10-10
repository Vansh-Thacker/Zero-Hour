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

export async function joinGame(code, name) {
  const normalCode = code.trim().toUpperCase();
  const seat = await post(`/api/rooms/${encodeURIComponent(normalCode)}/join`, {name});
  if (!seat.error) save({...seat, host: false});
  return seat;
}

export const currentSeat = saved;

export function clearSeat() {
  fallbackSeat = {};
  try { sessionStorage.removeItem(KEY); }
  catch { /* A private tab may not allow storage. */ }
}

export function listen(onView, onError = () => {}) {
  const {code, token} = saved();
  if (!code || !token) throw new Error('Create or join a game first.');

  const stream = new EventSource(`/api/rooms/${encodeURIComponent(code)}/events?token=${encodeURIComponent(token)}`);
  stream.onmessage = event => onView(JSON.parse(event.data));
  stream.onerror = () => onError('Connection lost. Trying to reconnect…');
  return stream;
}

export function send(action) {
  const {code, token} = saved();
  if (!code || !token) return Promise.resolve({error: 'Create or join a game first.'});
  return post(`/api/rooms/${encodeURIComponent(code)}/actions`, {token, action});
}
