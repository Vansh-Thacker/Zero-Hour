// The host screen in multiplayer: several teams, each building its own wall with its own £3m,
// all facing the same night. The host sees every team at once, runs the night for everyone,
// and at the end shows how well each team's wall held, side by side.
// Reads the server's view only; every button sends an action back through dispatch().

import {BUSINESS_NAME} from '../config.mjs';
import {brandBar, phaseTrack} from './app.mjs';
import {timerRing} from './checkpointScreen.mjs';
import {el, money, points, CATEGORIES} from './dom.mjs';
import {roomBar} from './roomBar.mjs';
import {revealedUpTo, standings} from './standings.mjs';
import {LEVEL, leaderboard, wallBar} from './standingsTable.mjs';
import {vaultSafe} from './vaultSafe.mjs';

const VAULT_WORD = {secure: '✓ Vault secure', damaged: '◆ Vault damaged', breached: '✖ Vault breached'};
let resetArmed = false;

export function renderCompetition(root, view, game, dispatch, extra = {}) {
  const {state} = view;
  const {data} = game;
  const upTo = revealedUpTo(state);
  const rows = standings(data, view.teams, upTo);

  const content = !state.confirmed ? lobby(view, game)
    : state.stage === 'story' ? story(view, game, rows)
    : state.stage === 'reveal' ? reveal(view, game, rows)
    : state.stage === 'checkpoint' ? checkpoint(view, game, rows)
    : outcome(view, game, rows);

  const focusedKey = document.activeElement?.dataset?.key;
  root.replaceChildren(el('div', {class: 'shell'},
    brandBar([
      el('span', {class: 'chip'}, 'Teams ', el('strong', {}, `${view.teams.length} / ${view.limits.maxTeams}`)),
      el('span', {class: 'chip'}, 'Players ', el('strong', {}, String(view.players.length)))]),
    roomBar({...view, ...extra}),
    state.confirmed ? phaseTrack(state, data) : null,
    el('main', {class: 'screen', id: 'screen'}, content, hostButtons(state, dispatch, view)),
    el('p', {class: 'footer-note'},
      `${BUSINESS_NAME} is fictional. A teaching game: controls, prices and points are simplified for learning, not advice on what to buy.`)));
  if (focusedKey) root.querySelector(`[data-key="${CSS.escape(focusedKey)}"]`)?.focus({preventScroll: true});
}

// ---------------------------------------------------------------- before the night: teams form

function lobby(view, {data}) {
  const {minTeamSize, maxTeams} = view.limits;
  const cards = view.teams.map(team => {
    const chosen = team.state.selected.map(id => data.controls.find(c => c.id === id));
    const spent = chosen.reduce((sum, c) => sum + c.cost, 0);
    const covered = Object.fromEntries(CATEGORIES.map(cat => [cat, chosen.some(c => c.category === cat)]));
    const short = Math.max(0, minTeamSize - team.players.length);
    const ready = !short;   // the only rule is the team size: any plan within budget can be locked
    return el('article', {class: `panel team-card${ready ? ' is-ready' : ''}`},
      el('div', {class: 'team-head'},
        el('h3', {}, team.name),
        el('span', {class: ready ? 'tag-ok' : 'tag-gap'}, ready ? '✓ Ready' : `⏳ Needs ${short} more player${short === 1 ? '' : 's'}`)),
      el('ul', {class: 'team-players'}, team.players.map(p => el('li', {'data-cat': p.category},
        el('span', {class: 'dot', 'aria-hidden': 'true'}), `${p.name} · ${p.categories.join(' + ')}`))),
      el('div', {class: 'meter', role: 'meter', 'aria-label': `${team.name} budget spent`, 'aria-valuemin': 0,
        'aria-valuemax': data.budget, 'aria-valuenow': spent, style: `--fill:${Math.min(100, 100 * spent / data.budget)}%`}, el('i')),
      el('p', {class: 'team-budget'}, `${money(spent)} spent · ${money(data.budget - spent)} left · ${chosen.length} control${chosen.length === 1 ? '' : 's'}`),
      el('div', {class: 'coverage'}, CATEGORIES.map(cat =>
        el('span', {class: `cover${covered[cat] ? ' is-on' : ''}`, 'data-cat': cat}, covered[cat] ? `✓ ${cat}` : `○ ${cat}`))));
  });

  return [
    el('section', {class: 'brief'},
      el('div', {},
        el('span', {class: 'eyebrow'}, 'Team battle · Building the walls'),
        el('h1', {class: 'screen-title'}, 'Teams are building their defences'),
        el('p', {class: 'lead'}, `Each team has its own ${money(data.budget)} to build a wall of Prevent, Detect and Respond controls. `,
          `When every team has at least ${minTeamSize} players, lock the plans: the same attacks then hit every wall, and the best-held wall wins.`),
        el('ul', {class: 'rules'},
          el('li', {}, 'Players join on their phones with the room code and a team name.'),
          el('li', {}, `At least ${minTeamSize} players per team, up to ${maxTeams} teams. Any number of players per team.`),
          el('li', {}, 'Each team chooses its own mix of Prevent, Detect and Respond controls. Skipping a category is allowed, but the attacks will find the gap.')))),
    view.teams.length
      ? el('div', {class: 'team-grid'}, cards)
      : el('p', {class: 'panel waiting'}, '⏳ Waiting for the first team. Players enter the room code and a team name on their phones.'),
  ];
}

// ---------------------------------------------------------------- during the night

function story(view, {data}, rows) {
  const phase = data.phases[view.state.phase];
  return [
    el('section', {class: 'casefile'},
      el('div', {},
        el('span', {class: 'eyebrow'}, `Phase ${view.state.phase + 1} of ${data.phases.length} · every team`),
        el('div', {class: 'clock'}, phase.local_time),
        el('h1', {class: 'screen-title'}, phase.title),
        el('p', {class: 'story'}, phase.story))),
    rows.length && view.state.phase > 0 ? leaderboard(rows, data, 'Standings so far') : null,
  ];
}

function reveal(view, {data}, rows) {
  const n = view.state.phase;
  const byPhase = [...rows].sort((a, b) => b.phases[n].wallPercent - a.phases[n].wallPercent || a.name.localeCompare(b.name));
  return [
    el('section', {class: 'reveal-head'},
      el('div', {},
        el('span', {class: 'eyebrow'}, `Phase ${n + 1} · ${data.phases[n].local_time}`),
        el('h1', {class: 'screen-title'}, 'How every wall held'),
        el('p', {class: 'lead'}, `${data.phases[n].title}: the same 10 attacks hit every team's wall.`))),
    el('section', {class: 'panel'},
      el('h2', {}, 'This phase'),
      el('ol', {class: 'wall-bars'}, byPhase.map(row => wallBar(row.name, row.phases[n].wallPercent, row.phases[n].level,
        `${row.phases[n].through} attack${row.phases[n].through === 1 ? '' : 's'} got through · +${row.phases[n].score} control points`)))),
    leaderboard(rows, data, 'Standings after this phase'),
  ];
}

function checkpoint(view, {bank}, rows) {
  const {state} = view;
  return [
    el('section', {class: 'cp-head'},
      el('div', {},
        el('span', {class: 'eyebrow'}, `Behaviour checkpoint · Phase ${state.phase + 1}`),
        el('h1', {class: 'screen-title'}, 'Every team answers on their phones'),
        el('p', {class: 'cp-rule'}, 'Secure answers earn behaviour points and patch each team\'s wall for the next phase. A missed answer counts as 0.')),
      el('div', {class: 'timer'}, timerRing(state.checkpoint))),
    el('section', {class: 'panel'},
      el('h2', {}, 'Answers so far'),
      el('ul', {class: 'team-answers'}, view.teams.map(team => {
        const answered = team.state.answers.filter(a => a.phase === state.phase).length;
        const possible = team.players.length * team.state.checkpoint.questionIds.length;
        return el('li', {}, el('strong', {}, team.name), ` ${answered} of ${possible} answers · `,
          el('span', {}, `${points(team.state.behaviourPoints[state.phase])} behaviour points`));
      }))),
    el('p', {class: 'lead'}, `Questions: ${state.checkpoint.questionIds.map(id => bank.questions.find(q => q.id === id).category).join(', ')}.`),
  ];
}

// ---------------------------------------------------------------- the end: every team side by side

function outcome(view, {data}, rows) {
  const winners = rows.filter(row => row.rank === 1);
  return [
    el('section', {class: 'verdict-hero'},
      el('div', {},
        el('span', {class: 'eyebrow'}, 'Tuesday, morning · Team results'),
        el('h1', {class: 'screen-title'}, winners.length === 1 ? `🏆 ${winners[0].name} held best` : `🏆 Joint winners: ${winners.map(w => w.name).join(' & ')}`),
        el('p', {class: 'lead'}, 'Every wall faced the same 40 attacks through the night. Teams are ranked by how many attacks their wall held, then by total points.'))),
    el('div', {class: 'final-teams'}, rows.map(row => el('article', {class: `panel final-team is-${row.vault}${row.rank === 1 ? ' is-winner' : ''}`},
      el('div', {class: 'final-rank'}, `#${row.rank}`),
      el('figure', {class: 'final-vault'}, vaultSafe(row.vault, `${row.name}'s vault`, row.cracks / row.attacks),
        el('figcaption', {}, VAULT_WORD[row.vault])),
      el('div', {class: 'final-body'},
        el('h3', {}, row.name),
        el('ul', {class: 'wall-bars'}, wallBar('Wall held', row.wallPercent, row.level, `${row.cracks} of ${row.attacks} attacks cracked through`)),
        el('ol', {class: 'night-strip', 'aria-label': `${row.name}: how the wall held in each phase`},
          row.phases.map(p => el('li', {class: `is-${p.level}`},
            el('span', {class: 'time'}, data.phases[p.n].local_time), `${LEVEL[p.level]} · ${p.wallPercent}%`))),
        el('p', {class: 'final-scores'},
          el('span', {}, 'Control ', el('strong', {}, String(row.control))), ' · ',
          el('span', {}, 'Behaviour ', el('strong', {}, points(row.behaviour))), ' · ',
          el('span', {}, 'Total ', el('strong', {}, points(row.total))), ' · ',
          el('span', {}, `${row.players} players · spent ${money(row.spent)}`)))))),
  ];
}

function hostButtons(state, dispatch, view) {
  const send = action => () => dispatch(action);
  const buttons = [];
  if (!state.confirmed) {
    buttons.push(el('button', {class: 'btn btn-primary', type: 'button', 'data-key': 'confirm', disabled: !view.teams.length,
      onclick: send({type: 'confirm'})}, '🔒 Lock every team\'s plan and start the night'));
  } else if (state.stage === 'story') {
    buttons.push(el('button', {class: 'btn btn-primary', type: 'button', 'data-key': 'next', onclick: send({type: 'next'})}, 'Reveal how every wall held →'));
  } else if (state.stage === 'reveal') {
    buttons.push(el('button', {class: 'btn btn-primary', type: 'button', 'data-key': 'next', onclick: send({type: 'next'})}, 'Start the checkpoint →'));
  } else if (state.stage === 'checkpoint') {
    const paused = state.checkpoint.timer.pausedAt !== null;
    if (!state.checkpoint.expired) {
      buttons.push(el('button', {class: 'btn btn-ghost', type: 'button', 'data-key': 'pause',
        onclick: send({type: paused ? 'resume' : 'pause'})}, paused ? '▶ Resume' : '❚❚ Pause'));
    }
    buttons.push(el('button', {class: 'btn btn-primary', type: 'button', 'data-key': 'next', onclick: send({type: 'next'})},
      state.phase === 3 ? 'See the final results →' : 'Continue the night →'));
  }
  if (state.confirmed) {
    buttons.unshift(el('button', {class: 'btn btn-ghost', type: 'button', 'data-key': 'reset', onclick: () => {
      if (!resetArmed) { resetArmed = true; return renderAgain(); }
      resetArmed = false;
      dispatch({type: 'reset'});
    }}, resetArmed ? 'Click again to start a new night' : '↻ New night'));
  }
  return el('div', {class: 'actions'}, buttons);

  function renderAgain() { dispatch({type: 'redraw'}); }
}
