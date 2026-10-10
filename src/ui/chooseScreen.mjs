// Choose screen: plan the defences before the crew strikes.
// Reads state only; every pick goes to the engine with dispatch().
// Multiplayer: each phone picks only its own category, and only the host locks the plan.

import {BUSINESS_NAME} from '../config.mjs';
import {controlRender, SCENE} from './assets.mjs';
import {inPlaceCards} from './inPlace.mjs';
import {el, img, money, budgetSummary, CATEGORIES, hostOnly, picksFor} from './dom.mjs';

const CREW_BLURB = {
  Prevent: 'Keep the crew out: stop the attack before it lands.',
  Detect: 'Spot the crew moving: see what is happening, so you can act.',
  Respond: 'Fight back and recover: contain the damage and get running again.',
};

export function chooseScreen(state, {data}, dispatch, extras, room) {
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
        el('li', {}, 'Once you lock the plan, it cannot change for the rest of the night.'),
        room ? el('li', {class: 'role-rule'}, roleRule(room)) : null)),
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
    hostOnly(room,
      el('button', {class: 'btn btn-primary', type: 'button', 'data-key': 'confirm',
        'aria-disabled': summary.ready ? null : 'true', onclick: () => dispatch({type: 'confirm'})},
      '🔒 Lock the plan'),
      'The host locks the plan when the team is ready.'));

  const inPlace = inPlaceCards(data);

  // On a phone, the player's own category comes first.
  const order = room?.you.category ? [room.you.category, ...CATEGORIES.filter(c => c !== room.you.category)] : CATEGORIES;
  const crews = order.map(cat => el('section', {class: `crew${room && !picksFor(room, cat) ? ' is-others' : ''}`, 'data-cat': cat, 'aria-labelledby': `crew-${cat}`},
    el('div', {class: 'crew-head'},
      el('span', {class: 'crew-tag'}, crewTag(cat, room, extras)),
      el('h2', {id: `crew-${cat}`}, cat),
      el('p', {}, CREW_BLURB[cat])),
    el('div', {class: 'cards'}, data.controls.filter(c => c.category === cat)
      .map(control => controlCard(control, state, summary, dispatch, extras, room)))));

  return [brief, planbar, state.error ? el('p', {class: 'alert', role: 'alert'}, state.error) : null, inPlace, ...crews];
}

function roleRule(room) {
  if (room.you.host) return 'Your players choose the controls on their phones. You lock the plan.';
  return `You choose the ${room.you.category} controls. Your teammates choose the rest from the same budget.`;
}

function crewTag(cat, room, extras) {
  const role = extras.roleName?.(cat);
  if (!room) return role ?? `${CATEGORIES.indexOf(cat) + 1} of 3`;
  const owners = room.players.filter(p => p.category === cat).map(p => p.name);
  const who = picksFor(room, cat) ? 'Your role' : owners.length ? `Chosen by ${owners.join(', ')}` : 'Nobody yet';
  return role ? `${role} · ${who}` : who;
}

function controlCard(control, state, summary, dispatch, extras, room) {
  const chosen = state.selected.includes(control.id);
  const mine = picksFor(room, control.category);
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
      mine
        ? el('button', {class: 'pick', type: 'button', 'data-key': `pick-${control.id}`, 'aria-pressed': String(chosen),
          'aria-label': `${chosen ? 'Remove' : 'Add'} ${control.name}, ${money(control.cost)}`, onclick: () => dispatch(action)},
        chosen ? '✓ Added' : '＋ Add')
        : el('span', {class: 'pick is-locked', title: `Only a ${control.category} player can choose this`},
          chosen ? '✓ Added' : `🔒 ${control.category}`)));
}
