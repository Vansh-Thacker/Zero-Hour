// Multiplayer: the bar under the header on the host screen and on every phone.
// Room code, the player's team and its roles (or every team, on the host), and what just happened.

import {el} from './dom.mjs';

export function roomBar(room) {
  const {code, you, players, log = [], notice, addresses = [], onLeave, team: myTeam, teams = []} = room;
  const latest = log.slice(0, 3);

  const who = el('div', {class: 'room-seat'},
    el('span', {class: 'eyebrow'}, 'Room'),
    el('strong', {class: 'room-code'}, code),
    el('span', {class: 'room-you'}, you.host
      ? `Host screen · ${teams.length} team${teams.length === 1 ? '' : 's'}`
      : `You: ${you.name} · ${(you.categories ?? [you.category]).join(' + ')}`),
    myTeam ? el('span', {class: 'room-team-name'}, `Team: ${myTeam.name}`) : null,
    you.host && addresses.length
      ? el('span', {class: 'room-join'}, 'Join on a phone: ', addresses.map(url => el('a', {href: url, target: '_blank', rel: 'noopener'}, url)))
      : null);

  const team = el('ul', {class: 'room-team', 'aria-label': you.host ? 'Teams' : 'Your team'},
    you.host && teams.length
      ? teams.map(t => el('li', {}, el('span', {class: 'dot', 'aria-hidden': 'true'}),
        `${t.name} · ${t.players.length} player${t.players.length === 1 ? '' : 's'}`))
      : players.length
      ? players.map(p => el('li', {'data-cat': p.category},
        el('span', {class: 'dot', 'aria-hidden': 'true'}), `${p.name} · ${(p.categories ?? [p.category]).join(' + ')}`, p.id === you.id ? ' (you)' : ''))
      : el('li', {class: 'is-empty'}, you.host ? 'Waiting for players to join with the code…' : 'Nobody here yet'));

  const activity = el('ul', {class: 'room-log', 'aria-label': 'Live activity', 'aria-live': 'polite'},
    latest.length
      ? latest.map(entry => el('li', {class: entry.ok ? '' : 'is-refused'}, entry.ok ? '✓ ' : '✕ ', entry.text))
      : el('li', {class: 'is-empty'}, 'Nothing has happened yet.'));

  return el('section', {class: 'panel room-bar', 'aria-label': `Game room ${code}`},
    who, team, activity,
    notice ? el('p', {class: 'alert', role: 'alert'}, notice) : null,
    onLeave ? el('button', {class: 'btn btn-ghost room-leave', type: 'button', 'data-key': 'leave', onclick: onLeave}, 'Leave room') : null);
}
