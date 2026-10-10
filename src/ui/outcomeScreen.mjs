// Outcome screen: the scores, kept separate and then added together, and a debrief
// of what happened in each phase and why.
// TODO: swap the debrief section for Mo's buildDebrief() once it lands.

import {SCENE} from './assets.mjs';
import {el, img, points} from './dom.mjs';

export function outcomeScreen(state, {data, bank}, dispatch, extras) {
  const control = state.result.total;
  const behaviour = state.behaviourPoints.reduce((sum, p) => sum + p, 0);
  const total = control + behaviour;
  const ending = extras.heistOutcome?.(data, state);

  const hero = el('section', {class: 'verdict-hero'},
    el('div', {},
      el('span', {class: 'eyebrow'}, 'Tuesday, morning · Debrief'),
      el('h1', {class: 'screen-title'},
        ending ? (ending.result === 'foiled' ? '✓ Heist foiled' : '✗ The crew got away') : 'The night is over'),
      el('p', {class: 'lead'}, ending?.reason
        ?? 'Here is how your defences and your people did across the four phases of the attack.')),
    el('div', {'aria-hidden': 'true'}, img(ending?.result === 'escaped' ? SCENE.usb : SCENE.turbine)));

  const scores = el('section', {class: 'scores', 'aria-label': 'Final scores'},
    scoreCard('Control score', control, 'from your defences'),
    scoreCard('Behaviour points', behaviour, 'from the checkpoints'),
    scoreCard('Total', total, 'control + behaviour', 'is-total'));

  const debrief = el('section', {'aria-labelledby': 'debrief-title'},
    el('h2', {id: 'debrief-title'}, 'Debrief: what happened and why'),
    el('div', {class: 'debrief'}, data.phases.map((phase, n) => phaseDebrief(phase, n, state, data, bank))));

  return [
    hero, scores, debrief,
    el('div', {class: 'actions'},
      el('button', {class: 'btn btn-primary', type: 'button', 'data-key': 'reset', onclick: () => dispatch({type: 'reset'})},
        '↻ Play again')),
  ];
}

function scoreCard(label, value, sign, extra = '') {
  return el('div', {class: `panel score ${extra}`},
    el('span', {class: 'num', 'data-count-to': value}, points(value)),
    el('span', {class: 'label'}, label),
    el('span', {class: 'sign'}, sign));
}

function phaseDebrief(phase, n, state, data, bank) {
  const scored = state.result.phases[n];
  const byId = id => data.controls.find(c => c.id === id);
  const helped = scored.contributions.filter(c => c.points > 0).sort((a, b) => b.points - a.points);
  const missed = data.controls
    .filter(c => !state.selected.includes(c.id) && phase.scores[c.id] > 0)
    .sort((a, b) => phase.scores[b.id] - phase.scores[a.id])[0];
  const answers = state.answers.filter(a => a.phase === n);

  return el('article', {class: 'panel debrief-phase'},
    el('div', {},
      el('div', {class: 'when'}, phase.local_time),
      el('h3', {}, phase.title),
      el('span', {class: 'chip'}, 'Control ', el('strong', {}, String(scored.score))),
      ' ',
      el('span', {class: 'chip'}, 'Behaviour ', el('strong', {}, points(state.behaviourPoints[n])))),
    el('div', {},
      el('p', {}, helped.length
        ? [el('span', {class: 'tag-ok'}, '✓ What helped: '), helped.map(c => `${byId(c.id).name} (+${c.points})`).join(', ')]
        : [el('span', {class: 'tag-gap'}, '✗ What helped: '), 'none of your chosen controls scored in this phase.']),
      missed ? el('p', {},
        el('span', {class: 'tag-gap'}, '○ Worth considering: '),
        `${missed.name} (${missed.category}, would have scored ${phase.scores[missed.id]}). ${missed.use_case}`) : null,
      answers.length ? el('ul', {}, answers.map(a => {
        const q = bank.questions.find(x => x.id === a.questionId);
        return el('li', {}, el('strong', {}, a.correct ? '✓ Secure: ' : '✗ Not secure: '), `${q.secure_behaviour}. `, q.explanation);
      })) : el('p', {class: 'lead'}, 'No behaviour questions were answered in this phase.')));
}
