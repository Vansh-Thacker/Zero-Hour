// "How to play": three big pictures and a few words, shown once when a game starts
// and any time from the ❔ button in the header. Made for someone who has never played.

import {el, img, money} from './dom.mjs';
import {SCENE} from './assets.mjs';
import {vaultSafe} from './vaultSafe.mjs';
import {SQUADS} from './fun.mjs';

let shown = false;   // once per page load: the ❔ button brings it back

// room: multiplayer only. The host and the phones get steps for their own job.
export function howToPlay(data, room = null) {
  const close = () => dialog.close();
  const step = (n, art, title, line, extra) => el('li', {class: 'htp-step'},
    el('span', {class: 'htp-num', 'aria-hidden': 'true'}, String(n)),
    el('span', {class: 'htp-art', 'aria-hidden': 'true'}, art),
    el('strong', {}, title),
    el('span', {}, line),
    extra);

  const dialog = el('dialog', {class: 'sheet htp', id: 'how-to-play', 'aria-labelledby': 'htp-title',
    onclick: event => { if (event.target === dialog) close(); }},
  el('button', {class: 'sheet-x', type: 'button', 'aria-label': 'Close', onclick: close}, '✕'),
  el('h2', {id: 'htp-title'}, '🎮 How to play'),
  el('p', {class: 'htp-goal'}, 'A crew of hackers will attack tonight. Keep them away from the 🏦 data vault!'),
  el('ol', {class: 'htp-steps'}, steps(data, room, step)),
  el('div', {class: 'actions'},
    el('button', {class: 'btn btn-primary btn-big', type: 'button', 'data-key': 'htp-go', onclick: close}, '▶ Let’s play!')));
  return dialog;
}

function steps(data, room, step) {
  const squads = el('span', {class: 'htp-squads'}, Object.values(SQUADS).map(s => el('span', {}, `${s.icon} ${s.name}`)));
  const emoji = text => el('span', {class: 'htp-emoji'}, text);
  if (room?.you.host) {
    return [
      step(1, emoji('📱'), 'Share the code', `Players join on their phones with code ${room.code}. Each gets a squad.`, squads),
      step(2, emoji('🛒'), 'They go shopping', `Together they spend ${money(data.budget)}. You lock it in when every squad has picked.`),
      step(3, vaultSafe('secure', 'Data vault', 0), 'You run the night', 'Show each attack on this screen, then start the quiz on their phones.'),
    ];
  }
  if (room) {
    const mine = SQUADS[room.you.category];
    return [
      step(1, emoji(mine.icon), `Shop for the ${mine.name}`, `You buy the ${room.you.category} defences. ${mine.job}!`),
      step(2, vaultSafe('secure', 'Data vault', 0), 'Watch the attack', 'The big screen shows how your team’s defences hold.'),
      step(3, emoji('❓'), 'Quiz on your phone', 'Answer like a pro to earn points and patch the wall.'),
    ];
  }
  return [
    step(1, img(SCENE.office), 'Buy defences', `You have ${money(data.budget)}. Pick at least one from each squad.`, squads),
    step(2, vaultSafe('secure', 'Data vault', 0), 'Survive the night', 'Watch 4 attacks hit your defence wall. Strong defences stop more.'),
    step(3, emoji('❓'), 'Quick quiz', 'Answer like a pro to earn points and patch your wall.'),
  ];
}

// Open it the first time the choose screen appears (not on every redraw).
export function openHowToPlayOnce(root) {
  if (shown) return;
  shown = true;
  root.querySelector('#how-to-play')?.showModal();
}
