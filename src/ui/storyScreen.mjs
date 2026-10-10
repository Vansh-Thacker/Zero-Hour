// Story screen: what the crew does in this phase, told as a case file.

import {PHASE_ART} from './assets.mjs';
import {el, img} from './dom.mjs';

export function storyScreen(state, {data}, dispatch, extras) {
  const phase = data.phases[state.phase];
  const art = PHASE_ART[state.phase] ?? {};
  const heistTitle = extras.heistPhaseTitle?.(phase.id, state.phase);

  return [
    el('section', {class: 'casefile'},
      el('div', {},
        el('span', {class: 'eyebrow'}, `Case file · Phase ${state.phase + 1} of ${data.phases.length}`),
        el('div', {class: 'clock', 'aria-label': `Time: ${phase.local_time}`}, phase.local_time),
        el('h1', {class: 'screen-title'}, heistTitle ?? phase.title),
        heistTitle ? el('p', {class: 'lead'}, phase.title) : null,
        el('p', {class: 'story'}, phase.story)),
      el('div', {class: 'evidence', 'aria-hidden': 'true'},
        el('div', {class: 'photo'}, img(art.evidence)),
        img(art.object, 'object'),
        el('span', {class: 'stamp'}, 'Evidence'))),
    el('div', {class: 'actions'},
      el('button', {class: 'btn btn-primary', type: 'button', 'data-key': 'next', onclick: () => dispatch({type: 'next'})},
        'Reveal your defences →')),
  ];
}
