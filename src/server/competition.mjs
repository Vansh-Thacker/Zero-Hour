// Multiplayer with several teams in one room. Each team builds its own defence with its own
// £3m budget (its own game state, run by rooms.mjs exactly like a one-team game). The host runs
// one night for everyone: locking the plans, revealing each phase, the checkpoint clock and
// reset happen for every team at once, so all the walls face the same attacks at the same time.
// No network here: server.mjs calls these one at a time.

import {createInitialState} from '../engine/state.mjs';
import {act, createRoom, joinRoom, viewFor} from './rooms.mjs';
import {randomUUID} from 'node:crypto';

export const MAX_TEAMS = 15;
export const MIN_TEAM_SIZE = 2;
export const DEFAULT_TEAM = 'Team 1';
const NAME_LIMIT = 24;
const LOG_LENGTH = 20;
const HOST_ACTIONS = new Set(['confirm', 'next', 'pause', 'resume', 'timeout', 'reset']);

function refuse(status, message) {
  return Object.assign(new Error(message), {status});
}

export function createCompetition(code) {
  return {code, hostToken: randomUUID(), teams: [], idle: createInitialState()};
}

/** The stage, phase and checkpoint clock: the same for every team, so the first team's will do. */
export function sharedState(competition) {
  return competition.teams[0]?.state ?? competition.idle;
}

const started = competition => sharedState(competition).confirmed;

function findSeat(competition, token) {
  for (const team of competition.teams) {
    const player = team.players.find(p => p.token === token);
    if (player) return {team, player};
  }
  return null;
}

/**
 * Join a team by name, making the team if it doesn't exist yet. New teams can only form before
 * the night starts; an existing team can still be joined later (its plan stays as it is).
 */
export function joinCompetition(competition, name, teamName = DEFAULT_TEAM) {
  if (teamName != null && typeof teamName !== 'string') throw refuse(400, 'Enter a team name.');
  const wanted = (teamName ?? '').trim().slice(0, NAME_LIMIT) || DEFAULT_TEAM;
  let team = competition.teams.find(t => t.name.toLowerCase() === wanted.toLowerCase());

  if (!team) {
    if (started(competition)) throw refuse(409, `The night has started, so new teams can't join. Join one of: ${competition.teams.map(t => t.name).join(', ')}.`);
    if (competition.teams.length >= MAX_TEAMS) throw refuse(409, `This room already has the most teams (${MAX_TEAMS}). Join one of the teams that are here.`);
    team = createRoom(competition.code);
    team.hostToken = competition.hostToken;   // one host runs every team
    team.id = randomUUID().slice(0, 8);
    team.name = wanted;
    competition.teams.push(team);
  }
  const player = joinRoom(team, name);
  return {player, team};
}

// Why a team can't start yet, in words, or null if it's ready. The only rule is the team size:
// a team may lock any plan within its budget, with or without all three categories.
export function teamProblem(team) {
  if (team.players.length < MIN_TEAM_SIZE) {
    const short = MIN_TEAM_SIZE - team.players.length;
    return `${team.name} needs ${short} more player${short === 1 ? '' : 's'} (at least ${MIN_TEAM_SIZE} per team).`;
  }
  return null;
}

/**
 * Apply one action. Players act on their own team's game. The host acts on every team at once:
 * "confirm" locks every team's plan, and is refused (nothing changes) unless every team is ready.
 */
export function actCompetition(competition, token, action, game, now = Date.now()) {
  if (token !== competition.hostToken) {
    const seat = findSeat(competition, token);
    if (!seat) throw refuse(403, 'This seat is not part of this game.');
    return act(seat.team, token, action, game, now);
  }

  const type = action?.type;
  if (!HOST_ACTIONS.has(type)) {
    // Let the team rules give the usual answer (host can't buy or answer, malformed actions are refused).
    if (!competition.teams.length) throw refuse(400, 'That is not something the game can do.');
    return act(competition.teams[0], token, action, game, now);
  }
  if (!competition.teams.length) {
    if (type === 'reset') return sharedState(competition);
    throw refuse(409, 'Nobody has joined yet. Players join with the room code and a team name.');
  }
  if (type === 'confirm' && !started(competition)) {
    const problems = competition.teams.map(teamProblem).filter(Boolean);
    if (problems.length) throw refuse(409, `Not every team is ready. ${problems.join(' ')}`);
  }
  for (const team of competition.teams) act(team, token, action, game, now, {anyCategories: true});
  return sharedState(competition);
}

// What every screen needs to know about every team: who is in it and its game so far.
// Game states hold no tokens, so they are safe to share; everything else is copied field by field.
function teamSummaries(competition) {
  return competition.teams.map(team => ({
    id: team.id,
    name: team.name,
    players: viewFor(team, team.hostToken).players,
    state: team.state,
  }));
}

/**
 * The view for one seat, or null for a token that isn't in the game.
 * Player: their own team's game (as a one-team game) plus every team, for the standings.
 * Host: the shared stage and clock, every team, and the latest activity from all of them.
 */
export function competitionView(competition, token) {
  const teams = teamSummaries(competition);
  if (token === competition.hostToken) {
    const log = competition.teams
      .flatMap(team => team.log.map(entry => ({...entry, text: `${team.name}: ${entry.text}`})))
      .sort((a, b) => b.at - a.at)
      .slice(0, LOG_LENGTH);
    return {
      code: competition.code,
      state: sharedState(competition),
      players: teams.flatMap(team => team.players.map(p => ({...p, team: team.name}))),
      log,
      teams,
      limits: {maxTeams: MAX_TEAMS, minTeamSize: MIN_TEAM_SIZE},
      you: {host: true},
    };
  }
  const seat = findSeat(competition, token);
  if (!seat) return null;
  return {
    ...viewFor(seat.team, token),
    code: competition.code,
    team: {id: seat.team.id, name: seat.team.name},
    teams,
    limits: {maxTeams: MAX_TEAMS, minTeamSize: MIN_TEAM_SIZE},
  };
}
