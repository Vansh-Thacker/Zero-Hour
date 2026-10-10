// Outcome screen: stars, the scores (kept separate, then added together) and badges.
// The night report and the debrief of each phase open as pop-ups, so the page stays short.
// TODO: swap the debrief section for Mo's buildDebrief() once it lands.

import {el, points, hostOnly} from './dom.mjs';
import {nightReport, outcomeVault} from './nightReport.mjs';
import {badges, nightStars} from './fun.mjs';
import {standings} from './standings.mjs';
import {leaderboard, medal} from './standingsTable.mjs';

export function outcomeScreen(state, {data, bank}, dispatch, extras, room) {
  const control = state.result.total;
  const behaviour = state.behaviourPoints.reduce((sum, p) => sum + p, 0);
  const total = control + behaviour;
  const ending = extras.heistOutcome?.(data, state);
  const night = nightStars(data, bank, state);

  const hero = el('section', {class: 'verdict-hero'},
    el('div', {},
      el('span', {class: 'eyebrow'}, '☀️ Tuesday morning · The night is over'),
      el('div', {class: 'stars', 'data-stars': night.stars, role: 'img', 'aria-label': `${night.stars} out of 3 stars`},
        [1, 2, 3].map(n => el('span', {class: n <= night.stars ? 'is-on' : '', style: `--n:${n}`}, n <= night.stars ? '★' : '☆'))),
      el('h1', {class: 'screen-title'},
        ending ? (ending.result === 'foiled' ? '✓ Heist foiled' : '✗ The crew got away') : night.title),
      el('p', {class: 'lead'}, ending?.reason ?? night.line)),
    outcomeVault(data, bank, state));

  const earned = badges(data, bank, state);
  const shelf = el('section', {class: 'badges', 'aria-labelledby': 'badges-title'},
    el('h2', {id: 'badges-title'}, `🏅 Badges · ${earned.filter(b => b.earned).length} of ${earned.length}`),
    el('ul', {}, earned.map((b, i) => el('li', {class: `badge${b.earned ? ' is-earned' : ''}`, style: `--i:${i}`},
      el('span', {class: 'badge-icon', 'aria-hidden': 'true'}, b.earned ? b.icon : '🔒'),
      el('strong', {}, b.name),
      el('span', {}, b.earned ? '✓ Earned' : b.how)))));

  const scores = el('section', {class: 'scores', 'aria-label': 'Final scores'},
    scoreCard('Control score', control, 'from your defences'),
    scoreCard('Behaviour points', behaviour, 'from the quizzes'),
    scoreCard('Total', total, 'control + behaviour', 'is-total'));

  const debrief = el('section', {'aria-labelledby': 'debrief-title'},
    el('h2', {id: 'debrief-title'}, 'Debrief: what happened and why'),
    el('div', {class: 'debrief'}, data.phases.map((phase, n) => phaseDebrief(phase, n, state, data, bank, room))));

  // Multiplayer with several teams: how every team's wall held, with this team marked.
  const teamResults = room?.teams?.length > 1
    ? teamPlace(standings(data, room.teams, data.phases.length - 1), data, room.team?.id)
    : null;

  const report = sheet('sheet-report', 'night-title', nightReport(data, bank, state));
  const details = sheet('sheet-debrief', 'debrief-title', debrief);

  const open = (dialog, key) => el('button', {class: 'panel report-button', type: 'button', 'data-key': key,
    'aria-haspopup': 'dialog', onclick: () => dialog.showModal()},
  el('span', {class: 'report-icon', 'aria-hidden': 'true'}, key === 'open-report' ? '📊' : '🔍'),
  el('span', {class: 'report-text'},
    el('strong', {}, key === 'open-report' ? 'Night report' : 'Debrief'),
    el('span', {}, key === 'open-report'
      ? 'How your wall held in each phase, what was lacking, and what would have done better.'
      : 'Phase by phase: what helped, what was worth considering, and why each answer was secure.')),
  el('span', {class: 'report-go', 'aria-hidden': 'true'}, 'Open →'));

  return [
    hero, teamResults, scores, shelf,
    el('section', {class: 'report-buttons', 'aria-label': 'Reports'}, open(report, 'open-report'), open(details, 'open-debrief')),
    report, details,
    el('div', {class: 'actions'}, hostOnly(room,
      el('button', {class: 'btn btn-primary', type: 'button', 'data-key': 'reset', onclick: () => dispatch({type: 'reset'})},
        '↻ Play again'),
      'The host can start a new game for the team.')),
  ];
}

// A pop-up holding one report. Closes with the ✕, the Close button, Esc, or a click outside it.
function sheet(id, labelledBy, content) {
  const close = () => dialog.close();
  const dialog = el('dialog', {class: 'sheet', id, 'aria-labelledby': labelledBy,
    onclick: event => { if (event.target === dialog) close(); }},
  el('button', {class: 'sheet-x', type: 'button', 'aria-label': 'Close', onclick: close}, '✕'),
  el('div', {class: 'sheet-body'}, content),
  el('div', {class: 'actions'}, el('button', {class: 'btn btn-primary', type: 'button', onclick: close}, 'Close')));
  return dialog;
}

function scoreCard(label, value, sign, extra = '') {
  return el('div', {class: `panel score ${extra}`},
    el('span', {class: 'num', 'data-count-to': value}, points(value)),
    el('span', {class: 'label'}, label),
    el('span', {class: 'sign'}, sign));
}

function phaseDebrief(phase, n, state, data, bank, room) {
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
      answers.length ? el('ul', {}, byQuestion(answers).map(([questionId, given]) => {
        const q = bank.questions.find(x => x.id === questionId);
        const secure = given.filter(a => a.correct).length;
        const mark = secure === given.length ? '✓' : '✗';
        const label = room ? `${mark} ${secure} of ${given.length} secure: ` : secure ? '✓ Secure: ' : '✗ Not secure: ';
        return el('li', {}, el('strong', {}, label), `${q.secure_behaviour}. `, q.explanation);
      })) : el('p', {class: 'lead'}, 'No behaviour questions were answered in this phase.')));
}

// In multiplayer several players answer each question: show each question once, with the team's result.
function byQuestion(answers) {
  const groups = new Map();
  for (const a of answers) groups.set(a.questionId, [...(groups.get(a.questionId) ?? []), a]);
  return [...groups];
}

// Where this team finished, then the full table of every team.
function teamPlace(rows, data, ownId) {
  const own = rows.find(row => row.id === ownId);
  return el('section', {class: 'team-place', 'aria-label': 'Team results'},
    own ? el('div', {class: `place-banner${own.rank === 1 ? ' is-first' : ''}`},
      el('span', {class: 'place-medal', 'aria-hidden': 'true'}, medal(own.rank)),
      el('div', {},
        el('strong', {}, own.rank === 1 ? 'Your team won!' : `Your team came ${ordinal(own.rank)} of ${rows.length}`),
        el('span', {}, `🧱 Your wall held ${own.wallPercent}% of the attacks · ${own.cracks} of ${own.attacks} cracked through`))) : null,
    leaderboard(rows, data, '🏁 Every team, side by side', ownId));
}

const ordinal = n => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
