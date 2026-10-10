// Choose screen: the defence shop. Pick from three squads before the crew strikes.
// Reads state only; every pick goes to the engine with dispatch().
// Multiplayer: each phone picks only its own category, and only the host locks the plan.

import {controlRender, SCENE} from './assets.mjs';
import {inPlaceCards} from './inPlace.mjs';
import {el, img, money, budgetSummary, CATEGORIES, hostOnly, picksFor} from './dom.mjs';
import {SQUADS, shortMoney} from './fun.mjs';

export function chooseScreen(state, {data}, dispatch, extras, room) {
  const summary = budgetSummary(data, state.selected);
  const firstPhase = data.phases[0];

  const brief = el('section', {class: 'brief mission'},
    el('div', {},
      el('span', {class: 'eyebrow'}, '🎯 Your mission'),
      el('h1', {class: 'screen-title'}, 'Defend the vault'),
      el('p', {class: 'lead'}, `Hackers strike at ${firstPhase.local_time}. Shop for defences to stop them!`),
      el('ul', {class: 'mission-steps', 'aria-label': 'The rules'},
        el('li', {}, el('span', {'aria-hidden': 'true'}, '💰'), `Spend up to ${shortMoney(data.budget)}`),
        room?.team
          ? el('li', {}, el('span', {'aria-hidden': 'true'}, '🛡️🔍🚒'), 'Mix all 3 squads: a gap lets attacks through')
          : el('li', {}, el('span', {'aria-hidden': 'true'}, '🛡️🔍🚒'), 'One from each squad'),
        el('li', {}, el('span', {'aria-hidden': 'true'}, '🔒'), 'Lock it in: no changes after')),
      room ? el('p', {class: 'role-rule'}, roleRule(room)) : null),
    el('div', {class: 'brief-art', 'aria-hidden': 'true'},
      img(SCENE.office, 'a'), img(SCENE.substation, 'b')));

  const fill = Math.min(100, (summary.spent / data.budget) * 100);
  const planbar = el('section', {class: 'panel planbar', 'aria-label': 'Your plan'},
    el('div', {},
      el('div', {class: 'budget-head'},
        el('span', {class: 'coins'}, el('span', {'aria-hidden': 'true'}, '💰 '),
          el('strong', {}, shortMoney(summary.left)), ' left',
          el('span', {class: 'visually-hidden'}, ` (${money(summary.left)})`)),
        el('span', {class: 'spent'}, `${shortMoney(summary.spent)} of ${shortMoney(data.budget)} spent`)),
      el('div', {class: `meter${summary.left < 200000 ? ' is-low' : ''}`, role: 'meter', 'aria-label': 'Budget spent',
        'aria-valuemin': 0, 'aria-valuemax': data.budget, 'aria-valuenow': summary.spent, style: `--fill:${fill}%`}, el('i')),
      el('div', {class: 'coverage'}, CATEGORIES.map(cat =>
        el('span', {class: `cover${summary.covered[cat] ? ' is-on' : ''}`, 'data-cat': cat},
          `${SQUADS[cat].icon} ${SQUADS[cat].name} `, summary.covered[cat] ? '✓' : room?.team ? '○' : '— needed',
          el('span', {class: 'visually-hidden'}, ` (${cat})`))))),
    hostOnly(room,
      el('button', {class: `btn btn-primary btn-big${summary.ready ? ' is-ready' : ''}`, type: 'button', 'data-key': 'confirm',
        'aria-disabled': summary.ready ? null : 'true', onclick: () => dispatch({type: 'confirm'})},
      summary.ready ? '🔒 Lock it in!' : '🔒 Pick all 3 squads'),
      'The host locks the plan when the team is ready.'));

  // On a phone, the player's own category comes first.
  const mine = room?.you.category ? room.you.categories ?? [room.you.category] : [];
  const order = [...mine, ...CATEGORIES.filter(c => !mine.includes(c))];
  const crews = order.map(cat => el('section', {class: `crew${room && !picksFor(room, cat) ? ' is-others' : ''}`, 'data-cat': cat, 'aria-labelledby': `crew-${cat}`},
    el('div', {class: 'crew-head'},
      el('span', {class: 'squad-icon', 'aria-hidden': 'true'}, SQUADS[cat].icon),
      el('div', {},
        el('h2', {id: `crew-${cat}`}, SQUADS[cat].name, ' ', el('span', {class: 'crew-tag'}, cat)),
        el('p', {}, SQUADS[cat].job, crewWho(cat, room, extras)))),
    el('div', {class: 'cards'}, data.controls.filter(c => c.category === cat)
      .map(control => controlCard(control, state, summary, dispatch, extras, room)))));

  return [brief, planbar, state.error ? el('p', {class: 'alert', role: 'alert'}, state.error) : null, ...crews, inPlaceCards(data)];
}

function roleRule(room) {
  if (room.you.host) return '📱 Your players shop on their phones. You lock it in.';
  const mine = (room.you.categories ?? [room.you.category]).map(cat => `${SQUADS[cat].icon} ${SQUADS[cat].name}`).join(' and ');
  const team = room.team ? ` for team ${room.team.name}` : '';
  return `📱 You shop for the ${mine}${team}. Your teammates do the rest.`;
}

// After the squad's job: whose squad it is (multiplayer) or the heist role (theme).
function crewWho(cat, room, extras) {
  const role = extras.roleName?.(cat);
  if (!room) return role ? ` · ${role}` : '';
  const owners = room.players.filter(p => (p.categories ?? [p.category]).includes(cat)).map(p => p.name);
  const who = picksFor(room, cat) ? '⭐ Your squad' : owners.length ? `Shopped by ${owners.join(', ')}` : 'Nobody yet';
  return ` · ${role ? `${role} · ` : ''}${who}`;
}

function controlCard(control, state, summary, dispatch, extras, room) {
  const chosen = state.selected.includes(control.id);
  const mine = picksFor(room, control.category);
  const affordable = chosen || control.cost <= summary.left;
  const heist = extras.heistName?.(control);
  const action = chosen ? {type: 'deselect', id: control.id} : {type: 'select', id: control.id};

  return el('article', {class: `card${chosen ? ' is-chosen' : ''}${affordable ? '' : ' is-unaffordable'}`, 'data-tilt': true, 'data-control': control.id},
    el('span', {class: 'badge-chosen'}, '✓ In your plan'),
    el('span', {class: 'price-tag'}, shortMoney(control.cost), el('span', {class: 'visually-hidden'}, ` (${money(control.cost)})`)),
    el('div', {class: 'card-art', 'aria-hidden': 'true'}, img(controlRender(control))),
    el('div', {class: 'card-body'},
      el('h3', {}, el('span', {class: 'card-id'}, control.id), ' ', control.name),
      heist ? el('span', {class: 'heist-name'}, `Heist name: ${heist}`) : null,
      el('p', {class: 'desc'}, control.description),
      el('details', {},
        el('summary', {}, 'ⓘ When does it help?'),
        el('p', {}, control.use_case),
        el('p', {}, el('strong', {}, 'Limit: '), control.limitation))),
    el('div', {class: 'card-foot'},
      affordable ? el('span', {class: 'afford'}) : el('span', {class: 'over'}, '😬 Too pricey'),
      mine
        ? el('button', {class: 'pick', type: 'button', 'data-key': `pick-${control.id}`, 'aria-pressed': String(chosen),
          'aria-label': `${chosen ? 'Remove' : 'Add'} ${control.name}, ${money(control.cost)}`, onclick: () => dispatch(action)},
        chosen ? '✓ Added' : '＋ Add')
        : el('span', {class: 'pick is-locked', title: `Only a ${control.category} player can choose this`},
          chosen ? '✓ Added' : `🔒 ${SQUADS[control.category].name}`)));
}
