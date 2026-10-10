// The team standings table and wall bars, shared by the host screen and the phones' outcome screen.

import {el, points} from './dom.mjs';

export const LEVEL = {strong: '▲ Held', holding: '◆ Cracked', weak: '✖ Broken'};

// 🥇🥈🥉 for the top three, then the place number.
export const medal = rank => ['🥇', '🥈', '🥉'][rank - 1] ?? `#${rank}`;

export function leaderboard(rows, data, title, ownTeamId = null) {
  return el('section', {class: 'panel leaderboard'},
    el('h2', {}, title),
    el('table', {class: 'standings'},
      el('thead', {}, el('tr', {},
        ['Place', 'Team', '🧱 Wall held', '💥 Through', '🛡️ Control', '🧠 Behaviour', '⭐ Total'].map(h => el('th', {scope: 'col'}, h)))),
      el('tbody', {}, rows.map(row => el('tr', {class: `${row.id === ownTeamId ? 'is-own' : ''}${row.rank <= 3 ? ` is-top is-rank-${row.rank}` : ''}`},
        el('td', {class: 'place'}, el('span', {'aria-hidden': 'true'}, medal(row.rank)), el('span', {class: 'visually-hidden'}, `Place ${row.rank}`)),
        el('th', {scope: 'row'}, row.name, row.id === ownTeamId ? ' (you)' : ''),
        el('td', {}, `${LEVEL[row.level] ?? ''} ${row.wallPercent}%`),
        el('td', {}, `${row.cracks} of ${row.attacks}`),
        el('td', {}, String(row.control)),
        el('td', {}, points(row.behaviour)),
        el('td', {}, el('strong', {}, points(row.total))))))));
}

export function wallBar(label, percent, level, note) {
  return el('li', {class: `wall-bar is-${level}`},
    el('span', {class: 'wall-name'}, label),
    el('span', {class: 'wall-track', role: 'img', 'aria-label': `${label}: wall held ${percent}%`},
      el('i', {style: `width:${percent}%`}, el('span', {class: 'wall-runner', 'aria-hidden': 'true'}, '🧱'))),
    el('span', {class: 'wall-value'}, `${LEVEL[level]} ${percent}%`),
    el('span', {class: 'wall-note'}, note));
}
