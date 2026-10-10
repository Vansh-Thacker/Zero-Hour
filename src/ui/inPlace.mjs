// The three controls the business already has (challenge.json, already_in_place).
// They can't be chosen and score nothing. Each card flips over to say why it won't stop
// tonight's attack, word for word from the data: owning tools isn't the same as being safe.

import {controlRender} from './assets.mjs';
import {el, img} from './dom.mjs';

// Which cards are turned over, so a card stays flipped when the screen redraws after a pick.
const flipped = new Set();

function card(item, i) {
  const button = el('button', {
    class: `ip-card${flipped.has(item.name) ? ' is-flipped' : ''}`, type: 'button',
    'data-key': `in-place-${i}`, 'aria-pressed': String(flipped.has(item.name)),
    'aria-label': `${item.name}: already in place, scores nothing. ${item.why_no_score}`,
    onclick: () => {
      const on = !flipped.has(item.name);
      if (on) flipped.add(item.name); else flipped.delete(item.name);
      button.classList.toggle('is-flipped', on);
      button.setAttribute('aria-pressed', String(on));
    },
  },
  el('span', {class: 'ip-inner', 'aria-hidden': 'true'},
    el('span', {class: 'ip-face ip-front'},
      el('span', {class: 'ip-status'}, '✓ Running'),
      img(controlRender(item)),
      el('strong', {}, item.name),
      el('span', {class: 'ip-desc'}, item.description),
      el('span', {class: 'ip-hint'}, '↻ Will it stop tonight’s attack?')),
    el('span', {class: 'ip-face ip-back'},
      el('span', {class: 'ip-verdict'}, '✗ Scores nothing tonight'),
      el('strong', {}, item.name),
      el('span', {class: 'ip-why'}, item.why_no_score),
      el('span', {class: 'ip-hint'}, '↻ Turn back'))));
  return button;
}

// On the choose screen, above the controls you can buy.
export function inPlaceCards(data) {
  return el('section', {class: 'inplace', 'aria-labelledby': 'inplace-title'},
    el('div', {class: 'inplace-head'},
      el('span', {class: 'eyebrow', id: 'inplace-title'}, 'Already in place · can’t be chosen · scores nothing'),
      el('p', {}, 'Your business already runs these. Tap one to see why it won’t save you tonight.')),
    el('div', {class: 'inplace-cards'}, data.already_in_place.map(card)));
}

// In the night report: they were running all night, and the crew still got in.
export function inPlaceLesson(data) {
  return el('section', {class: 'panel inplace-lesson', 'aria-labelledby': 'lesson-title'},
    el('h3', {id: 'lesson-title'}, '🛡 Already in place all night'),
    el('ul', {class: 'lesson-chips'}, data.already_in_place.map(item =>
      el('li', {}, img(controlRender(item)),
        el('span', {}, el('strong', {}, item.name), '✓ Running · ✗ didn’t stop the attack')))),
    el('p', {class: 'lesson-line'},
      'The crew never had to break through the firewall: they came in through a person, with an email let through on purpose. ',
      'Tools you already own are not enough on their own. What stopped them tonight was the controls you chose and the way your people answered.'));
}
