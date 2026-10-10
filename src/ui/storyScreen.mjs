// Story screen: what the crew does in this phase, told like a comic: the crew's move in a speech bubble.

import {PHASE_ART} from './assets.mjs';
import {el, img, hostOnly} from './dom.mjs';

export function storyScreen(state, {data}, dispatch, extras, room) {
  const phase = data.phases[state.phase];
  const art = PHASE_ART[state.phase] ?? {};
  const heistTitle = extras.heistPhaseTitle?.(phase.id, state.phase);

  return [
    el('section', {class: 'casefile'},
      el('div', {},
        el('span', {class: 'eyebrow'}, `🌙 Attack ${state.phase + 1} of ${data.phases.length}`),
        el('div', {class: 'clock', 'aria-label': `Time: ${phase.local_time}`}, `🕒 ${phase.local_time}`),
        el('h1', {class: 'screen-title'}, heistTitle ?? phase.title),
        heistTitle ? el('p', {class: 'lead'}, phase.title) : null,
        el('div', {class: 'comic'},
          el('span', {class: 'comic-who', 'aria-hidden': 'true'}, el('span', {class: 'comic-face'}, '🦹'), 'The crew'),
          el('p', {class: 'story bubble'}, phase.story))),
      el('div', {class: 'evidence', 'aria-hidden': 'true'},
        el('div', {class: 'photo'}, img(art.evidence)),
        img(art.object, 'object'),
        el('span', {class: 'stamp'}, 'Evidence'))),
    el('div', {class: 'actions'}, hostOnly(room,
      el('button', {class: 'btn btn-primary', type: 'button', 'data-key': 'next', onclick: () => dispatch({type: 'next'})},
        '⚔️ See the attack!'),
      'Waiting for the host to reveal your defences.')),
  ];
}
