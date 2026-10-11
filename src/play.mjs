// The player's phone: join a room with the code from the host screen and a team name, then play
// the team's game on the same screens as single player. Each team builds its own wall; each
// player chooses their own category's controls and answers the checkpoint questions themselves.

import {loadGameData} from './engine/loadData.mjs';
import {clearSeat, currentSeat, joinGame} from './net/client.mjs';
import {showLiveRoom} from './net/liveRoom.mjs';
import {loadExtras} from './ui/app.mjs';
import {enableTilt} from './ui/effects.mjs';
import {joinScreen, nameProblem} from './ui/startScreens.mjs';

const root = document.getElementById('app');
const [game, extras] = await Promise.all([loadGameData({moreTopics: true}), loadExtras()]);
let live = null;

// The username from the home page, so players aren't asked twice.
function savedName() {
  try { return sessionStorage.getItem('zero-hour-player-name') ?? ''; } catch { return ''; }
}

// The teams already in a room, so a player can tap their team instead of typing it.
async function teamsIn(code) {
  if (!code) return [];
  try {
    const reply = await fetch(`/api/rooms/${encodeURIComponent(code.toUpperCase())}/teams`).then(r => r.json());
    return reply.teams ?? [];
  } catch {
    return [];
  }
}

function showJoin(view = {}) {
  live?.close();
  live = null;
  const code = view.code ?? new URLSearchParams(location.search).get('code') ?? '';
  const join = async (code, name, team) => {
    const problem = !code ? 'Enter the room code from the host screen.' : nameProblem(name) ?? (team ? null : "Enter your team's name.");
    const teams = view.teams ?? [];
    if (problem) return showJoin({code, name, team, teams, error: problem});
    showJoin({code, name, team, teams, busy: true});
    const seat = await joinGame(code, name, team).catch(() => ({error: 'Could not reach the game. Check you are on the same Wi-Fi.'}));
    if (seat.error) return showJoin({code, name, team, teams: await teamsIn(code), error: seat.error});
    try { sessionStorage.setItem('zero-hour-player-name', name); } catch { /* not remembered */ }
    showRoom();
  };
  const lookUp = async (code, typed) => showJoin({...view, ...typed, code, teams: await teamsIn(code)});
  root.replaceChildren(joinScreen({name: savedName(), ...view, code}, join, lookUp));
  root.querySelector(!code ? '#room-code' : !(view.name ?? savedName()) ? '#player-name' : '#team-name')?.focus();
  if (code && !view.teams) teamsIn(code).then(teams => { if (teams.length && !live) showJoin({...view, code, teams}); });
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
