// Choose screen: plan the defences before the crew strikes.
// Reads state only; every pick goes to the engine with dispatch().

import {BUSINESS_NAME} from '../config.mjs';
import {controlRender, SCENE} from './assets.mjs';
import {el, img, money, budgetSummary, CATEGORIES} from './dom.mjs';

const CREW_BLURB = {
  Prevent: 'Keep the crew out: stop the attack before it lands.',
  Detect: 'Spot the crew moving: see what is happening, so you can act.',
  Respond: 'Fight back and recover: contain the damage and get running again.',
};

export function chooseScreen(state, {data}, dispatch, extras) {
  const summary = budgetSummary(data, state.selected);
  const firstPhase = data.phases[0];

  const brief = el('section', {class: 'brief'},
    el('div', {},
      el('span', {class: 'eyebrow'}, 'The plan'),
      el('h1', {class: 'screen-title'}, 'Defend the vault'),
      el('p', {class: 'lead'},
        `A crew is planning to break into ${BUSINESS_NAME} overnight. They strike at ${firstPhase.local_time}. `,
        `You have ${money(data.budget)} to put defences in place before they do.`),
      el('ul', {class: 'rules'},
        el('li', {}, 'Pick at least one Prevent, one Detect and one Respond control.'),
        el('li', {}, `Spend up to ${money(data.budget)}. You don't have to spend it all.`),
        el('li', {}, 'Once you lock the plan, it cannot change for the rest of the night.'))),
    el('div', {class: 'brief-art', 'aria-hidden': 'true'},
      img(SCENE.office, 'a'), img(SCENE.substation, 'b')));

  const fill = Math.min(100, (summary.spent / data.budget) * 100);
  const planbar = el('section', {class: 'panel planbar', 'aria-label': 'Your plan'},
    el('div', {},
      el('div', {class: 'budget-head'},
        el('span', {}, 'Budget left ', el('strong', {}, money(summary.left))),
        el('span', {}, `Spent ${money(summary.spent)} of ${money(data.budget)}`)),
      el('div', {class: `meter${summary.left < 200000 ? ' is-low' : ''}`, role: 'meter', 'aria-label': 'Budget spent',
        'aria-valuemin': 0, 'aria-valuemax': data.budget, 'aria-valuenow': summary.spent, style: `--fill:${fill}%`}, el('i')),
      el('div', {class: 'coverage'}, CATEGORIES.map(cat =>
        el('span', {class: `cover${summary.covered[cat] ? ' is-on' : ''}`, 'data-cat': cat},
          summary.covered[cat] ? `✓ ${cat}` : `○ ${cat} needed`)))),
    el('button', {class: 'btn btn-primary', type: 'button', 'data-key': 'confirm',
      'aria-disabled': summary.ready ? null : 'true', onclick: () => dispatch({type: 'confirm'})},
    '🔒 Lock the plan'));

  const inPlace = el('section', {class: 'inplace', 'aria-label': 'Already in place'},
    el('span', {class: 'eyebrow'}, 'Already in place · scores nothing'),
    data.already_in_place.map(item => el('div', {class: 'inplace-item', title: item.why_no_score},
      img(controlRender(item)), el('span', {}, el('strong', {}, item.name), 'Can\'t be chosen'))));

  const crews = CATEGORIES.map(cat => el('section', {class: 'crew', 'data-cat': cat, 'aria-labelledby': `crew-${cat}`},
    el('div', {class: 'crew-head'},
      el('span', {class: 'crew-tag'}, extras.roleName?.(cat) ?? `${CATEGORIES.indexOf(cat) + 1} of 3`),
      el('h2', {id: `crew-${cat}`}, cat),
      el('p', {}, CREW_BLURB[cat])),
    el('div', {class: 'cards'}, data.controls.filter(c => c.category === cat)
      .map(control => controlCard(control, state, summary, dispatch, extras)))));

  return [brief, planbar, state.error ? el('p', {class: 'alert', role: 'alert'}, state.error) : null, inPlace, ...crews];
}

function controlCard(control, state, summary, dispatch, extras) {
  const chosen = state.selected.includes(control.id);
  const affordable = chosen || control.cost <= summary.left;
  const heist = extras.heistName?.(control);
  const action = chosen ? {type: 'deselect', id: control.id} : {type: 'select', id: control.id};

  return el('article', {class: `card${chosen ? ' is-chosen' : ''}${affordable ? '' : ' is-unaffordable'}`, 'data-tilt': true},
    el('span', {class: 'badge-chosen'}, '✓ In the plan'),
    el('div', {class: 'card-art', 'aria-hidden': 'true'}, img(controlRender(control))),
    el('div', {class: 'card-body'},
      el('span', {class: 'card-id'}, control.id),
      el('h3', {}, control.name),
      heist ? el('span', {class: 'heist-name'}, `Heist name: ${heist}`) : null,
      el('p', {class: 'desc'}, control.description),
      el('details', {},
        el('summary', {}, 'When it helps, and its limits'),
        el('p', {}, control.use_case),
        el('p', {}, el('strong', {}, 'Limit: '), control.limitation))),
    el('div', {class: 'card-foot'},
      el('span', {},
        el('span', {class: 'price'}, money(control.cost)),
        affordable ? null : el('span', {class: 'over'}, ' · over budget')),
      el('button', {class: 'pick', type: 'button', 'data-key': `pick-${control.id}`, 'aria-pressed': String(chosen),
        'aria-label': `${chosen ? 'Remove' : 'Add'} ${control.name}, ${money(control.cost)}`, onclick: () => dispatch(action)},
      chosen ? '✓ Added' : '＋ Add')));
}
