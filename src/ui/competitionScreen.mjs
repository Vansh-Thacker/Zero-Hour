// The host screen in multiplayer: several teams, each building its own wall with its own £3m,
// all facing the same night. The host sees every team at once, runs the night for everyone,
// and at the end shows how well each team's wall held, side by side, with a podium.
// Reads the server's view only; every button sends an action back through dispatch().

import {BUSINESS_NAME} from '../config.mjs';
import {quizTopics} from '../engine/loadData.mjs';
import {brandBar, phaseTrack} from './app.mjs';
import {timerRing} from './checkpointScreen.mjs';
import {el, money, points, CATEGORIES, isHere, presenceText, presenceClass} from './dom.mjs';
import {confetti} from './effects.mjs';
import {SQUADS, shortMoney} from './fun.mjs';
import {howToPlay, openHowToPlayOnce} from './howToPlay.mjs';
import {roomBar} from './roomBar.mjs';
import {play} from './sfx.mjs';
import {revealedUpTo, standings} from './standings.mjs';
import {LEVEL, leaderboard, medal, wallBar} from './standingsTable.mjs';
import {vaultSafe} from './vaultSafe.mjs';

const VAULT_WORD = {secure: '✓ Vault secure', damaged: '◆ Vault damaged', breached: '✖ Vault breached'};
let resetArmed = false;
let topicsOpen = false; // the quiz topic list stays open while the screen redraws
let lastStage = null;   // to play a sound and throw confetti when the stage changes

export function renderCompetition(root, view, game, dispatch, extra = {}) {
  const {state} = view;
  const {data} = game;
  const upTo = revealedUpTo(state);
  const rows = standings(data, view.teams, upTo);

  const content = !state.confirmed ? lobby(view, game, dispatch)
    : state.stage === 'story' ? story(view, game, rows)
    : state.stage === 'reveal' ? reveal(view, game, rows)
    : state.stage === 'checkpoint' ? checkpoint(view, game, rows)
    : outcome(view, game, rows);

  const stageKey = `${state.confirmed ? state.stage : 'lobby'}-${state.phase}`;
  const entering = stageKey !== lastStage;
  const focusedKey = document.activeElement?.dataset?.key;
  root.replaceChildren(el('div', {class: 'shell'},
    brandBar([
      el('span', {class: 'chip'}, el('span', {'aria-hidden': 'true'}, '🚩 '), 'Teams ', el('strong', {}, `${view.teams.length} / ${view.limits.maxTeams}`)),
      el('span', {class: 'chip'}, el('span', {'aria-hidden': 'true'}, '👥 '), 'Players ', el('strong', {}, String(view.players.length))),
      // Once the night starts nobody new can join (src/server/competition.mjs), so say so.
      el('span', {class: 'chip'}, state.confirmed ? '🔒 Room locked' : '🔓 Room open to join'),
      el('button', {class: 'chip chip-btn', type: 'button', 'data-key': 'help', 'aria-label': 'How to play',
        onclick: () => document.getElementById('how-to-play')?.showModal()}, '❔')]),
    howToPlay(data, view),
    roomBar({...view, ...extra}, data),
    state.confirmed ? phaseTrack(state, data) : null,
    el('main', {class: `screen${entering ? ' is-entering' : ''}`, id: 'screen'}, content, hostButtons(state, dispatch, view)),
    el('p', {class: 'footer-note'},
      `${BUSINESS_NAME} is fictional. A teaching game: controls, prices and points are simplified for learning, not advice on what to buy.`)));
  if (focusedKey) root.querySelector(`[data-key="${CSS.escape(focusedKey)}"]`)?.focus({preventScroll: true});

  if (!state.confirmed) openHowToPlayOnce(root);
  if (entering) {
    lastStage = stageKey;
    window.scrollTo({top: 0, behavior: 'instant'});
    if (state.stage === 'reveal') play('reveal');
    if (state.confirmed && state.stage === 'outcome') {
      setTimeout(() => { play('win'); confetti(root.querySelector('.podium'), 80); }, 600);
    }
  }
}

const avatar = p => el('span', {class: 'avatar', 'data-cat': p.category, 'aria-hidden': 'true'}, p.name.slice(0, 1).toUpperCase());

// ---------------------------------------------------------------- before the night: teams form

function lobby(view, {data, bank}, dispatch) {
  const {minTeamSize, maxTeams} = view.limits;
  const cards = view.teams.map(team => {
    const chosen = team.state.selected.map(id => data.controls.find(c => c.id === id));
    const spent = chosen.reduce((sum, c) => sum + c.cost, 0);
    const covered = Object.fromEntries(CATEGORIES.map(cat => [cat, chosen.some(c => c.category === cat)]));
    const short = Math.max(0, minTeamSize - team.players.filter(isHere).length);
    const ready = !short;   // the only rule is the team size: any plan within budget can be locked
    return el('article', {class: `panel team-card${ready ? ' is-ready' : ''}`},
      el('div', {class: 'team-head'},
        el('h3', {}, `🚩 ${team.name}`),
        el('span', {class: ready ? 'tag-ok' : 'tag-gap'}, ready ? '✅ Ready' : `⏳ Needs ${short} more`)),
      el('ul', {class: 'team-players'}, team.players.map(p => el('li', {'data-cat': p.category, class: presenceClass(p).trim() || null},
        avatar(p), el('span', {}, p.name, presenceText(p)), el('span', {class: 'team-squads'},
          (p.categories ?? [p.category]).map(cat => `${SQUADS[cat].icon} ${SQUADS[cat].name}`).join(' + '))))),
      el('div', {class: 'budget-head'},
        el('span', {class: 'coins'}, el('span', {'aria-hidden': 'true'}, '💰 '), el('strong', {}, shortMoney(data.budget - spent)), ' left'),
        el('span', {class: 'spent'}, `${chosen.length} control${chosen.length === 1 ? '' : 's'}`)),
      el('div', {class: 'meter', role: 'meter', 'aria-label': `${team.name} budget spent`, 'aria-valuemin': 0,
        'aria-valuemax': data.budget, 'aria-valuenow': spent, style: `--fill:${Math.min(100, 100 * spent / data.budget)}%`}, el('i')),
      el('div', {class: 'coverage'}, CATEGORIES.map(cat =>
        el('span', {class: `cover${covered[cat] ? ' is-on' : ''}`, 'data-cat': cat},
          `${SQUADS[cat].icon} ${SQUADS[cat].name} ${covered[cat] ? '✓' : '○'}`, el('span', {class: 'visually-hidden'}, ` (${cat})`)))));
  });

  return [
    el('section', {class: 'brief mission'},
      el('div', {},
        el('span', {class: 'eyebrow'}, '🏆 Team battle'),
        el('h1', {class: 'screen-title'}, 'Build your walls!'),
        el('p', {class: 'lead'}, 'Every team shops for its own defences. Then the same attacks hit every wall. Best wall wins!'),
        el('ul', {class: 'mission-steps', 'aria-label': 'The rules'},
          el('li', {}, el('span', {'aria-hidden': 'true'}, '💰'), `${shortMoney(data.budget)} per team`),
          el('li', {}, el('span', {'aria-hidden': 'true'}, '👥'), `${minTeamSize}+ players a team, up to ${maxTeams} teams`),
          el('li', {}, el('span', {'aria-hidden': 'true'}, '🛡️🔍🚒'), 'Skip a squad and attacks find the gap')))),
    topicPicker(view, bank, dispatch),
    view.teams.length
      ? el('div', {class: 'team-grid'}, cards)
      : el('p', {class: 'panel waiting'}, '⏳ Waiting for the first team. Players enter the room code and a team name on their phones.'),
  ];
}

// The host picks the quiz topics: a drop-down list of every topic, tick as many as you like.
// None ticked: each quiz uses the brief's questions that match its attack (story mode).
function topicPicker(view, bank, dispatch) {
  const all = quizTopics(bank);
  const chosen = new Set(view.topics ?? []);
  const choose = names => dispatch({type: 'topics', topics: all.map(t => t.name).filter(name => names.includes(name))});
  const toggle = name => choose(chosen.has(name) ? [...chosen].filter(n => n !== name) : [...chosen, name]);
  const questions = all.filter(t => chosen.has(t.name)).reduce((sum, t) => sum + t.questions, 0);

  return el('section', {class: 'panel topic-box', 'aria-labelledby': 'topics-title'},
    el('div', {class: 'topic-head'},
      el('h2', {id: 'topics-title'}, '🎯 Quiz topics'),
      el('span', {class: chosen.size ? 'tag-ok' : 'tag-gap'},
        chosen.size ? `${chosen.size} topic${chosen.size === 1 ? '' : 's'} · ${questions} questions` : '📖 Story mode')),
    el('p', {class: 'topic-note'}, chosen.size
      ? `Each quiz mixes ${chosen.size === 1 ? 'questions on this topic' : 'these topics'}, easiest first. Every new night deals new questions${questions < 16 ? ' (with under 16 questions, some come round again)' : ''}.`
      : 'No topics chosen: each quiz asks the questions that match its attack. Choose topics to set your own quiz.'),
    el('details', {class: 'topic-drop', open: topicsOpen, ontoggle: event => { topicsOpen = event.currentTarget.open; }},
      el('summary', {'data-key': 'topics-open'}, chosen.size ? `${chosen.size} of ${all.length} topics chosen` : `Choose from ${all.length} topics`),
      el('div', {class: 'topic-menu'},
        el('div', {class: 'topic-tools'},
          el('button', {class: 'btn btn-ghost btn-small', type: 'button', 'data-key': 'topics-all', onclick: () => choose(all.map(t => t.name))}, '✓ All topics'),
          el('button', {class: 'btn btn-ghost btn-small', type: 'button', 'data-key': 'topics-none', disabled: !chosen.size, onclick: () => choose([])}, '📖 Story mode')),
        el('ul', {class: 'topic-list'}, all.map(t => el('li', {},
          el('label', {class: `topic-option${chosen.has(t.name) ? ' is-on' : ''}`},
            el('input', {type: 'checkbox', checked: chosen.has(t.name), 'data-key': `topic-${t.name}`, onchange: () => toggle(t.name)}),
            el('span', {}, t.name),
            el('small', {}, `${t.questions} q`))))))),
    chosen.size ? el('ul', {class: 'topic-chips', 'aria-label': 'Chosen topics'}, all.filter(t => chosen.has(t.name)).map(t =>
      el('li', {}, el('button', {type: 'button', class: 'topic-chip', 'data-key': `chip-${t.name}`, 'aria-label': `Remove ${t.name}`,
        onclick: () => toggle(t.name)}, t.name, el('span', {'aria-hidden': 'true'}, ' ✕'))))) : null);
}

// ---------------------------------------------------------------- during the night

function story(view, {data}, rows) {
  const phase = data.phases[view.state.phase];
  return [
    el('section', {class: 'casefile'},
      el('div', {},
        el('span', {class: 'eyebrow'}, `🌙 Attack ${view.state.phase + 1} of ${data.phases.length} · every team`),
        el('div', {class: 'clock'}, `🕒 ${phase.local_time}`),
        el('h1', {class: 'screen-title'}, phase.title),
        el('div', {class: 'comic'},
          el('span', {class: 'comic-who', 'aria-hidden': 'true'}, el('span', {class: 'comic-face'}, '🦹'), 'The crew'),
          el('p', {class: 'story bubble'}, phase.story)))),
    rows.length && view.state.phase > 0 ? leaderboard(rows, data, '🏁 Standings so far') : null,
  ];
}

function reveal(view, {data}, rows) {
  const n = view.state.phase;
  const byPhase = [...rows].sort((a, b) => b.phases[n].wallPercent - a.phases[n].wallPercent || a.name.localeCompare(b.name));
  return [
    el('section', {class: 'reveal-head'},
      el('div', {},
        el('span', {class: 'eyebrow'}, `⚔️ Attack ${n + 1} · ${data.phases[n].local_time}`),
        el('h1', {class: 'screen-title'}, 'Whose wall held?'),
        el('p', {class: 'lead'}, `${data.phases[n].title}: the same 10 attacks hit every team’s wall.`))),
    el('section', {class: 'panel race'},
      el('h2', {}, '🧱 Wall race: this attack'),
      el('ol', {class: 'wall-bars'}, byPhase.map(row => wallBar(row.name, row.phases[n].wallPercent, row.phases[n].level,
        `💥 ${row.phases[n].through} attack${row.phases[n].through === 1 ? '' : 's'} got through · +${row.phases[n].score} control points`)))),
    leaderboard(rows, data, '🏁 Standings after this attack'),
  ];
}

function checkpoint(view, {bank}, rows) {
  const {state} = view;
  return [
    el('section', {class: 'cp-head'},
      el('div', {},
        el('span', {class: 'eyebrow'}, `❓ Quiz time · after attack ${state.phase + 1}`),
        el('h1', {class: 'screen-title'}, 'Answer on your phones!'),
        el('ul', {class: 'quiz-pills', 'aria-label': 'Quiz rules'},
          el('li', {}, `❓ ${state.checkpoint.questionIds.length} questions`),
          el('li', {}, '✓ Secure answers earn points'),
          el('li', {}, '🧱 And patch your team’s wall'))),
      el('div', {class: 'timer'}, timerRing(state.checkpoint))),
    answerWatch(view),
    el('p', {class: 'lead'}, `Topics: ${[...new Set(state.checkpoint.questionIds.map(id => bank.questions.find(q => q.id === id).category))].join(', ')}.`),
  ];
}

// Who has answered: each team's progress, then every player with how many they have answered,
// so the host can see at a glance which team and which person is still to answer.
function answerWatch(view) {
  const {state} = view;
  const over = state.checkpoint.expired;
  let waitingCount = 0;
  const rows = view.teams.map(team => {
    const total = team.state.checkpoint.questionIds.length;
    const mine = p => team.state.answers.filter(a => a.phase === state.phase && a.player === p.id).length;
    const here = team.players.filter(isHere);   // a player who left no longer counts
    const answered = here.reduce((sum, p) => sum + mine(p), 0);
    const possible = here.length * total;
    const percent = possible ? Math.round(100 * answered / possible) : 0;
    const waiting = here.filter(p => mine(p) < total);
    waitingCount += waiting.length;
    return el('li', {class: `team-answer${waiting.length ? '' : ' is-done'}`},
      el('strong', {}, `🚩 ${team.name}`),
      el('span', {class: 'answer-track', role: 'img', 'aria-label': `${answered} of ${possible} answers`}, el('i', {style: `width:${percent}%`})),
      el('span', {class: 'answer-count'}, `${answered} of ${possible}${waiting.length ? '' : ' ✅'}`),
      el('span', {class: 'answer-points'}, `🧠 ${points(team.state.behaviourPoints[state.phase])} pts`),
      el('ul', {class: 'who-answered', 'aria-label': `${team.name} players`}, team.players.map(p => {
        const done = mine(p);
        return el('li', {class: `who${done === total ? ' is-done' : ''}${presenceClass(p)}`, 'data-cat': p.category},
          avatar(p), el('span', {class: 'who-name'}, p.name, presenceText(p)),
          isHere(p) ? el('span', {class: 'who-count'}, done === total ? '✅ Done' : `${over ? '✖' : '⏳'} ${done} of ${total}`) : null);
      })));
  });
  return el('section', {class: 'panel'},
    el('div', {class: 'topic-head'},
      el('h2', {}, '✍️ Who has answered?'),
      el('span', {class: waitingCount ? 'tag-gap' : 'tag-ok', role: 'status'}, waitingCount
        ? `${over ? '✖' : '⏳'} ${waitingCount} player${waitingCount === 1 ? '' : 's'} ${over ? 'missed out' : 'still answering'}`
        : '✅ Everyone has answered')),
    el('ul', {class: 'team-answers'}, rows));
}

// ---------------------------------------------------------------- the end: every team side by side

function outcome(view, {data}, rows) {
  const winners = rows.filter(row => row.rank === 1);
  const top = rows.slice(0, 3);
  // Podium order: 2nd, 1st, 3rd, so the winner stands in the middle.
  const podiumOrder = [top[1], top[0], top[2]].filter(Boolean);
  return [
    el('section', {class: 'verdict-hero'},
      el('div', {},
        el('span', {class: 'eyebrow'}, '☀️ Tuesday morning · Team results'),
        el('h1', {class: 'screen-title'}, winners.length === 1 ? `🏆 ${winners[0].name} wins!` : `🏆 It’s a tie: ${winners.map(w => w.name).join(' & ')}`),
        el('p', {class: 'lead'}, 'Every wall faced the same 40 attacks. Ranked by how many attacks each wall held, then by total points.'))),
    rows.length ? el('ol', {class: 'podium', 'aria-label': 'Top three teams'}, podiumOrder.map(row =>
      el('li', {class: `podium-step is-rank-${Math.min(row.rank, 3)}`},
        el('span', {class: 'podium-medal', 'aria-hidden': 'true'}, medal(row.rank)),
        el('strong', {}, row.name),
        el('span', {}, `🧱 ${row.wallPercent}% held`),
        el('span', {class: 'podium-block'}, el('span', {class: 'visually-hidden'}, `Place `), String(row.rank))))) : null,
    el('div', {class: 'final-teams'}, rows.map(row => el('article', {class: `panel final-team is-${row.vault}${row.rank === 1 ? ' is-winner' : ''}`},
      el('div', {class: 'final-rank'}, el('span', {'aria-hidden': 'true'}, medal(row.rank)), el('span', {class: 'visually-hidden'}, `Place ${row.rank}`)),
      el('figure', {class: 'final-vault'}, vaultSafe(row.vault, `${row.name}'s vault`, row.cracks / row.attacks),
        el('figcaption', {}, VAULT_WORD[row.vault])),
      el('div', {class: 'final-body'},
        el('h3', {}, `🚩 ${row.name}`),
        el('ul', {class: 'wall-bars'}, wallBar('Wall held', row.wallPercent, row.level, `💥 ${row.cracks} of ${row.attacks} attacks cracked through`)),
        el('ol', {class: 'night-strip', 'aria-label': `${row.name}: how the wall held in each phase`},
          row.phases.map(p => el('li', {class: `is-${p.level}`},
            el('span', {class: 'time'}, data.phases[p.n].local_time), `${LEVEL[p.level]} · ${p.wallPercent}%`))),
        el('p', {class: 'final-scores'},
          el('span', {}, '🛡️ Control ', el('strong', {}, String(row.control))), ' · ',
          el('span', {}, '🧠 Behaviour ', el('strong', {}, points(row.behaviour))), ' · ',
          el('span', {}, '⭐ Total ', el('strong', {}, points(row.total))), ' · ',
          el('span', {}, `👥 ${row.players} players · spent ${money(row.spent)}`)))))),
  ];
}

function hostButtons(state, dispatch, view) {
  const send = action => () => dispatch(action);
  const buttons = [];
  if (!state.confirmed) {
    buttons.push(el('button', {class: `btn btn-primary btn-big${view.teams.length ? ' is-ready' : ''}`, type: 'button', 'data-key': 'confirm', disabled: !view.teams.length,
      onclick: send({type: 'confirm'})}, '🔒 Lock every plan and start the night'));
  } else if (state.stage === 'story') {
    buttons.push(el('button', {class: 'btn btn-primary btn-big', type: 'button', 'data-key': 'next', onclick: send({type: 'next'})}, '⚔️ See whose wall held'));
  } else if (state.stage === 'reveal') {
    buttons.push(el('button', {class: 'btn btn-primary btn-big', type: 'button', 'data-key': 'next', onclick: send({type: 'next'})}, '❓ Quiz time!'));
  } else if (state.stage === 'checkpoint') {
    const paused = state.checkpoint.timer.pausedAt !== null;
    if (!state.checkpoint.expired) {
      buttons.push(el('button', {class: 'btn btn-ghost', type: 'button', 'data-key': 'pause',
        onclick: send({type: paused ? 'resume' : 'pause'})}, paused ? '▶ Resume' : '❚❚ Pause'));
    }
    buttons.push(el('button', {class: 'btn btn-primary btn-big', type: 'button', 'data-key': 'next', onclick: send({type: 'next'})},
      state.phase === 3 ? '🏆 See the winners' : '🌙 On with the night'));
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
