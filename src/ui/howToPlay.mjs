// "How to play": three big pictures and a few words, shown once when a game starts
// and any time from the ❔ button in the header. Made for someone who has never played.

import {el, img, money} from './dom.mjs';
import {SCENE} from './assets.mjs';
import {vaultSafe} from './vaultSafe.mjs';
import {SQUADS} from './fun.mjs';

let shown = false;   // once per page load: the ❔ button brings it back

export function howToPlay(data) {
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
  el('ol', {class: 'htp-steps'},
    step(1, img(SCENE.office), 'Buy defences', `You have ${money(data.budget)}. Pick at least one from each squad.`,
      el('span', {class: 'htp-squads'}, Object.values(SQUADS).map(s => el('span', {}, `${s.icon} ${s.name}`)))),
    step(2, vaultSafe('secure', 'Data vault', 0), 'Survive the night', 'Watch 4 attacks hit your defence wall. Strong defences stop more.'),
    step(3, el('span', {class: 'htp-emoji'}, '❓'), 'Quick quiz', 'Answer like a pro to earn points and patch your wall.')),
  el('div', {class: 'actions'},
    el('button', {class: 'btn btn-primary btn-big', type: 'button', 'data-key': 'htp-go', onclick: close}, '▶ Let’s play!')));
  return dialog;
}

// Open it the first time the choose screen appears (not on every redraw).
export function openHowToPlayOnce(root) {
  if (shown) return;
  shown = true;
  root.querySelector('#how-to-play')?.showModal();
}
