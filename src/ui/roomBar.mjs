// Multiplayer: the team bar under the header on the host screen and on every phone.
// The room code; on a phone, one slot per squad in the player's own team, with each player's
// avatar and what they're doing right now; on the host, every team with its players; and a live
// feed of what just happened. Pictures and words only: the server holds the rules.

import {el, CATEGORIES, isHere, presenceText, presenceClass} from './dom.mjs';
import {SQUADS} from './fun.mjs';

const categoriesOf = p => p.categories ?? [p.category];

// What a player is up to, worked out from their team's game state.
function status(player, state, data) {
  if (state.stage === 'choose') {
    const mine = categoriesOf(player);
    const picked = state.selected.filter(id => mine.includes(data.controls.find(c => c.id === id)?.category)).length;
    return picked ? `🛒 ${picked} picked` : '🤔 Shopping…';
  }
  if (state.stage === 'checkpoint' && state.checkpoint) {
    const total = state.checkpoint.questionIds.length;
    const done = state.answers.filter(a => a.phase === state.phase && a.player === player.id).length;
    return done === total ? '✅ All answered' : `✍️ ${done} of ${total}`;
  }
  return '👀 Watching';
}

function avatar(player) {
  return el('span', {class: 'avatar', 'data-cat': player.category, 'aria-hidden': 'true'}, player.name.slice(0, 1).toUpperCase());
}

// The server's log lines, with a picture in front so they read at a glance.
function feedIcon(entry) {
  if (!entry.ok) return '⛔';
  const text = entry.text;
  if (/ joined /.test(text)) return '👋';
  if (/ bought /.test(text)) return '🛒';
  if (/ removed /.test(text)) return '↩️';
  if (/ answered /.test(text)) return '✍️';
  if (/confirmed/.test(text)) return '🔒';
  if (/new game/.test(text)) return '🔄';
  return '•';
}

// A phone: the player's own team, one slot per squad.
function squadSlots(players, you, state, data) {
  return el('ul', {class: 'room-squads', 'aria-label': 'Your team'}, CATEGORIES.map(cat => {
    const members = players.filter(p => categoriesOf(p).includes(cat));
    return el('li', {class: `squad-slot${members.length ? ' is-filled' : ''}`, 'data-cat': cat},
      el('span', {class: 'squad-name'}, `${SQUADS[cat].icon} ${SQUADS[cat].name}`, el('span', {class: 'visually-hidden'}, ` (${cat})`)),
      members.length
        ? el('ul', {}, members.map(p => el('li', {class: `member${presenceClass(p)}`},
          avatar(p),
          el('span', {class: 'member-name'}, p.name, p.id === you.id ? ' (you)' : presenceText(p)),
          state ? el('span', {class: 'member-status'}, status(p, state, data)) : null)))
        : el('span', {class: 'squad-empty'}, '⏳ Waiting for a player…'));
  }));
}

// The host: every team, with its players' avatars.
function teamChips(teams, minTeamSize, started) {
  if (!teams.length) {
    return el('ul', {class: 'room-squads room-teams', 'aria-label': 'Teams'},
      el('li', {class: 'squad-slot team-slot'}, el('span', {class: 'squad-empty'}, '⏳ Waiting for the first team…')));
  }
  return el('ul', {class: 'room-squads room-teams', 'aria-label': 'Teams'}, teams.map(t => {
    const here = t.players.filter(isHere);
    const short = started ? 0 : Math.max(0, minTeamSize - here.length);   // the size rule is only for starting
    const gone = t.players.length - here.length;
    return el('li', {class: `squad-slot team-slot${short ? '' : ' is-filled'}`},
      el('span', {class: 'squad-name'}, `🚩 ${t.name}`),
      el('span', {class: 'team-avatars'}, t.players.map(p => el('span', {title: p.name + presenceText(p), class: presenceClass(p).trim() || null},
        avatar(p), el('span', {class: 'visually-hidden'}, p.name + presenceText(p))))),
      el('span', {class: 'member-status'}, short ? `⏳ Needs ${short} more` : `✅ ${here.length} player${here.length === 1 ? '' : 's'}`,
        gone ? ` · 🚪 ${gone} left` : '',
        t.players.some(p => p.online === false && !p.left) ? ` · 📴 ${t.players.filter(p => p.online === false && !p.left).length} offline` : ''));
  }));
}

export function roomBar(room, data) {
  const {code, you, players, log = [], notice, addresses = [], onLeave, state, team: myTeam, teams = [], limits} = room;
  // Prefer a home or hotspot address (192.168.x / 10.x) over a virtual adapter's (172.x).
  const joinUrl = addresses.find(url => !/\/\/172\./.test(url)) ?? addresses[0];
  const mine = you.host ? [] : categoriesOf(you);

  const codeBox = el('div', {class: 'room-seat'},
    el('span', {class: 'eyebrow'}, 'Room code'),
    el('strong', {class: 'room-code'}, code),
    you.host
      ? el('span', {class: 'room-join'}, '📱 Join on your phone: ',
        joinUrl ? el('a', {href: joinUrl, target: '_blank', rel: 'noopener'}, joinUrl.replace(/^https?:\/\//, '')) : 'open play.html')
      : el('span', {class: 'room-you'}, avatar(you),
        `${you.name} · ${mine.map(cat => `${SQUADS[cat].icon} ${SQUADS[cat].name}`).join(' + ')}`),
    myTeam ? el('span', {class: 'room-team-name'}, `🚩 Team ${myTeam.name}`) : null);

  const people = you.host && (teams.length || limits)
    ? teamChips(teams, limits?.minTeamSize ?? 1, Boolean(state?.confirmed))
    : squadSlots(players, you, state, data);

  const feed = el('ul', {class: 'room-log', 'aria-label': 'Live activity', 'aria-live': 'polite'},
    log.length
      ? log.slice(0, 3).map(entry => el('li', {class: entry.ok ? '' : 'is-refused'},
        el('span', {'aria-hidden': 'true'}, feedIcon(entry)), ' ', entry.text))
      : el('li', {class: 'is-empty'}, you.host ? '👋 Share the code, then watch your teams arrive!' : 'Nothing has happened yet.'));

  return el('section', {class: 'panel room-bar', 'aria-label': `Game room ${code}`},
    codeBox, people, feed,
    notice ? el('p', {class: 'alert', role: 'alert'}, notice) : null,
    onLeave ? el('button', {class: 'btn btn-ghost room-leave', type: 'button', 'data-key': 'leave', onclick: onLeave}, 'Leave room') : null);
}
