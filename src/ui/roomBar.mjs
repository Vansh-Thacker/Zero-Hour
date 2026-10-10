// Multiplayer: the bar under the header on the host screen and on every phone.
// Room code, who is on the team and their roles, and what just happened, in words.

import {el} from './dom.mjs';

export function roomBar(room) {
  const {code, you, players, log = [], notice, addresses = [], onLeave} = room;
  const latest = log.slice(0, 3);

  const who = el('div', {class: 'room-seat'},
    el('span', {class: 'eyebrow'}, 'Room'),
    el('strong', {class: 'room-code'}, code),
    el('span', {class: 'room-you'}, you.host ? 'Host screen' : `You: ${you.name} · ${you.category}`),
    you.host && addresses.length
      ? el('span', {class: 'room-join'}, 'Join on a phone: ', addresses.map(url => el('a', {href: url, target: '_blank', rel: 'noopener'}, url)))
      : null);

  const team = el('ul', {class: 'room-team', 'aria-label': 'Your team'},
    players.length
      ? players.map(p => el('li', {'data-cat': p.category},
        el('span', {class: 'dot', 'aria-hidden': 'true'}), `${p.name} · ${p.category}`, p.id === you.id ? ' (you)' : ''))
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
