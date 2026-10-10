// Reveal screen: each chosen control flips over to show what it scored this phase.
// The points come straight from the scoring module's result, never worked out here.

import {controlRender} from './assets.mjs';
import {el, img, hostOnly} from './dom.mjs';
import {battleDisplay} from './battleDisplay.mjs';

export function revealScreen(state, {data}, dispatch, extras, room) {
  const phase = data.phases[state.phase];
  const scored = state.result.phases[state.phase];
  const soFar = state.result.phases.slice(0, state.phase + 1).reduce((sum, p) => sum + p.score, 0);
  const contributions = [...scored.contributions].sort((a, b) => b.points - a.points);

  const flips = contributions.map(({id, points}, i) => {
    const control = data.controls.find(c => c.id === id);
    const heist = extras.heistName?.(control);
    return el('div', {class: 'flip', 'data-cat': control.category, style: `--i:${i}`},
      el('div', {class: 'flip-inner'},
        el('div', {class: 'flip-face', 'aria-hidden': 'true'}, img(controlRender(control)), el('span', {}, control.name)),
        el('div', {class: `flip-face flip-back ${points > 0 ? 'is-scored' : 'is-zero'}`},
          el('span', {class: 'pts'}, points > 0 ? `+${points}` : '0'),
          el('span', {class: 'name'}, heist ? `${heist} (${control.name})` : control.name),
          el('span', {class: 'verdict'}, points > 0 ? `✓ ${control.category}: helped this phase` : '– No effect this phase'))));
  });

  return [
    el('section', {class: 'reveal-head'},
      el('div', {},
        el('span', {class: 'eyebrow'}, `Phase ${state.phase + 1} · ${phase.local_time}`),
        el('h1', {class: 'screen-title'}, 'How your defences did'),
        el('p', {class: 'lead'}, phase.title)),
      el('div', {class: 'bigscore', 'aria-live': 'polite'},
        el('div', {class: 'num', 'data-count-to': scored.score}, String(scored.score)),
        el('div', {class: 'label'}, `control points this phase · ${soFar} so far`))),
    battleDisplay(state, data),
    el('div', {class: 'flips'}, flips),
    el('div', {class: 'theme-slot', id: 'theme-slot'}),
    el('div', {class: 'actions'}, hostOnly(room,
      el('button', {class: 'btn btn-primary', type: 'button', 'data-key': 'next', onclick: () => dispatch({type: 'next'})},
        'Behaviour checkpoint →'),
      'Waiting for the host to start the behaviour checkpoint.')),
  ];
}
