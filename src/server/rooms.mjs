// One team's game in multiplayer (src/server/competition.mjs puts several teams in a room). No network here: server.mjs receives messages and calls
// these functions one at a time, so two messages that arrive together are applied in turn.
// The server checks WHO may do something (roles, host); the engine's reduce() decides
// WHETHER it is allowed by the game rules (budget, duplicates, lock, timer).

import {randomUUID} from 'node:crypto';
import {isValidAction} from '../engine/actions.mjs';
import {createInitialState, reduce} from '../engine/state.mjs';

const ROLE_ORDER = ['Prevent', 'Detect', 'Respond'];
const PLAYER_ACTIONS = new Set(['select', 'deselect', 'answer']);
const HOST_ACTIONS = new Set(['confirm', 'next', 'pause', 'resume', 'timeout', 'reset']);
const LOG_LENGTH = 20;

/** An error the server can show to the player as it is, with the HTTP status to use. */
function refuse(status, message) {
  return Object.assign(new Error(message), {status});
}

export function createRoom(code) {
  return {
    code,
    hostToken: randomUUID(),
    players: [],
    state: createInitialState(),
    log: [],
  };
}

export function joinRoom(room, name) {
  if (typeof name !== 'string' || !name.trim()) throw refuse(400, 'Enter your name to join the game.');
  const cleanName = name.trim().slice(0, 24);

  const category = ROLE_ORDER[room.players.length % ROLE_ORDER.length];
  const player = {
    id: randomUUID().slice(0, 8),
    token: randomUUID(),
    name: cleanName,
    category,
  };
  room.players.push(player);
  addLog(room, true, `${player.name} joined as ${category}.`);
  return player;
}

// The categories a player chooses for. Usually one: Prevent, Detect, Respond, then round again.
// In a team of two, the first player also looks after Respond, so every category has someone.
export function categoriesOf(room, player) {
  const index = room.players.indexOf(player);
  if (room.players.length !== 2 || index !== 0) return [player.category];
  return [player.category, ROLE_ORDER[2]];
}

// Only a room member gets a view, and no view contains anyone's token.
export function viewFor(room, token) {
  const isHost = token === room.hostToken;
  const player = room.players.find(member => member.token === token);
  if (!isHost && !player) return null;

  return {
    code: room.code,
    state: room.state,
    players: room.players.map(p => ({id: p.id, name: p.name, category: p.category, categories: categoriesOf(room, p), left: Boolean(p.left)})),
    log: room.log.map(entry => ({...entry})),
    you: isHost
      ? {host: true}
      : {id: player.id, name: player.name, category: player.category, categories: categoriesOf(room, player), host: false},
  };
}

export function addLog(room, ok, text) {
  room.log.unshift({at: Date.now(), ok, text});
  room.log.length = Math.min(room.log.length, LOG_LENGTH);
}

/**
 * Apply one action from one seat, at time `now` (the server's clock, so every screen shares
 * one timer). Returns the new game state, or throws a readable error (with .status) and
 * leaves the game unchanged. Refusals go in the shared log too, so everyone sees why.
 *   Players: select / deselect (own role only), answer (during a checkpoint)
 *   Host:    confirm, next, pause, resume, timeout, reset
 */
export function act(room, token, action, game, now = Date.now(), {anyCategories = false} = {}) {
  const isHost = token === room.hostToken;
  const player = room.players.find(member => member.token === token);
  if (!isHost && !player) throw refuse(403, 'This seat is not part of this game.');

  const who = isHost ? 'The host' : player.name;
  const fail = (status, message) => {
    addLog(room, false, `${who}: ${message}`);
    return refuse(status, message);
  };

  // Only these fields are taken from the device. The server adds who and when.
  const {type, id, questionId, choice} = action ?? {};
  // teamSize lets the engine count a player who has not answered as 0 in the team average.
  // A player who left the game (see competition.mjs) no longer counts.
  const teamSize = type === 'answer' || type === 'timeout' ? room.players.filter(p => !p.left).length : undefined;
  const stamped = {type, id, questionId, choice, now, player: player?.id, teamSize,
    anyCategories: type === 'confirm' && anyCategories ? true : undefined};
  for (const key of Object.keys(stamped)) if (stamped[key] === undefined) delete stamped[key];
  if (!isValidAction(stamped)) throw fail(400, 'That is not something the game can do.');

  if (PLAYER_ACTIONS.has(type)) {
    if (isHost) throw fail(403, 'The host runs the game. Players choose the controls and answer the questions.');
    if (type !== 'answer') {
      const control = game.data.controls.find(c => c.id === id);
      if (!control) throw fail(400, `"${id}" is not a control.`);
      if (!categoriesOf(room, player).includes(control.category)) {
        throw fail(403, `Only a ${control.category} player can choose ${control.id} ${control.name}. You are ${player.category}.`);
      }
      if (room.state.confirmed) throw fail(409, "The team's choice is locked. It cannot change now.");
      if (type === 'select' && room.state.selected.includes(id)) return room.state; // two taps on the same control
      if (type === 'deselect' && !room.state.selected.includes(id)) return room.state;
    }
  } else if (HOST_ACTIONS.has(type)) {
    if (!isHost) throw fail(403, 'Only the host can do that.');
  }

  const next = reduce(game, room.state, stamped);
  if (next.error) throw fail(409, next.error); // the engine refused: keep the game as it was
  const changed = next !== room.state;
  room.state = next;

  if (type === 'select' || type === 'deselect') {
    const control = game.data.controls.find(c => c.id === id);
    const pounds = '£' + control.cost.toLocaleString('en-GB');
    addLog(room, true, `${who} ${type === 'select' ? 'bought' : 'removed'} ${control.id} ${control.name} (${pounds}).`);
  } else if (type === 'confirm' && changed) {
    addLog(room, true, "The host confirmed the team's choice. It is locked for the whole game.");
  } else if (type === 'answer') {
    addLog(room, true, `${who} answered a question.`);
  } else if (type === 'reset') {
    addLog(room, true, 'The host started a new game.');
  }
  return room.state;
}
