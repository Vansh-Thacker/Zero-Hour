import {randomUUID} from 'node:crypto';
import {createInitialState} from '../engine/state.mjs';

const ROLE_ORDER = ['Prevent', 'Detect', 'Respond'];

export function createRoom(code) {
  return {
    code,
    hostToken: randomUUID(),
    players: [],
    state: createInitialState(),
  };
}

export function joinRoom(room, name) {
  const cleanName = String(name ?? '').trim().slice(0, 24);
  if (!cleanName) throw new Error('Enter your name to join the game.');

  const category = ROLE_ORDER[room.players.length % ROLE_ORDER.length];
  const player = {
    id: randomUUID().slice(0, 8),
    token: randomUUID(),
    name: cleanName,
    category,
  };
  room.players.push(player);
  return player;
}

// Only a room member gets a view, and no view contains anyone's token.
export function viewFor(room, token) {
  const isHost = token === room.hostToken;
  const player = room.players.find(member => member.token === token);
  if (!isHost && !player) return null;

  return {
    code: room.code,
    state: room.state,
    players: room.players.map(({id, name, category}) => ({id, name, category})),
    you: isHost
      ? {host: true}
      : {id: player.id, name: player.name, category: player.category, host: false},
  };
}
