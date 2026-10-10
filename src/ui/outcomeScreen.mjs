// Outcome screen: the scores, kept separate and then added together, and a debrief
// of what happened in each phase and why.
// The words come from buildDebrief(), so the debrief always matches the engine's scores.

import {buildDebrief} from '../debrief/debrief.mjs';
import {SCENE} from './assets.mjs';
import {el, img, points} from './dom.mjs';

export function outcomeScreen(state, {data, bank}, dispatch, extras) {
  const report = buildDebrief({data, bank}, state);
  const {controlScore: control, behaviourPoints: behaviour, total} = report;
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
    el('div', {class: 'debrief'}, report.phases.map(phase => phaseDebrief(phase, data, bank))));

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

function phaseDebrief(phase, data, bank) {
  const missedControl = phase.missed && data.controls.find(c => c.id === phase.missed.id);

  return el('article', {class: 'panel debrief-phase'},
    el('div', {},
      el('div', {class: 'when'}, phase.localTime),
      el('h3', {}, phase.title),
      el('span', {class: 'chip'}, 'Control ', el('strong', {}, String(phase.controlPoints))),
      ' ',
      el('span', {class: 'chip'}, 'Behaviour ', el('strong', {}, points(phase.behaviourPoints)))),
    el('div', {},
      el('p', {}, phase.helped.length
        ? [el('span', {class: 'tag-ok'}, '✓ What helped: '), phase.helped.map(c => `${c.name} (+${c.points})`).join(', ')]
        : [el('span', {class: 'tag-gap'}, '✗ What helped: '), 'none of your chosen controls scored in this phase.']),
      missedControl ? el('p', {},
        el('span', {class: 'tag-gap'}, '○ Worth considering: '),
        `${missedControl.name} (${missedControl.category}, would have scored ${phase.missed.points}). ${missedControl.use_case}`) : null,
      phase.answers.length ? el('ul', {}, phase.answers.map(a => {
        const q = bank.questions.find(x => x.id === a.questionId);
        return el('li', {}, el('strong', {}, a.status === 'secure' ? '✓ Secure: ' : '✗ Not secure: '), `${q.secure_behaviour}. `, a.explanation);
      })) : el('p', {class: 'lead'}, 'No behaviour questions were answered in this phase.')));
}
