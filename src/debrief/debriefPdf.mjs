// The debrief a player downloads at the end of the night, as a PDF to read later.
// It says what the outcome screen and the night report say (the same functions work it out),
// plus every quiz question the team saw, with this player's own answer, the secure answer and why.
// Pure apart from downloadDebrief(): debriefBlocks() and debriefPdf() are tested in Node.

import {BUSINESS_NAME, GAME_NAME} from '../config.mjs';
import {badges, nightStars} from '../ui/fun.mjs';
import {reportLines} from '../ui/nightReport.mjs';
import {standings} from '../ui/standings.mjs';
import {downloadPdf, makePdf} from './pdf.mjs';

const pts = n => Number.isInteger(n) ? String(n) : n.toFixed(1);
const pounds = n => '£' + n.toLocaleString('en-GB');

/** One phase in facts: its scores, the controls that helped, and the best one that was missed. */
export function phaseFacts(data, state, n) {
  const phase = data.phases[n];
  const scored = state.result.phases[n];
  const byId = id => data.controls.find(c => c.id === id);
  const helped = scored.contributions.filter(c => c.points > 0).sort((a, b) => b.points - a.points)
    .map(c => ({control: byId(c.id), points: c.points}));
  const missed = data.controls
    .filter(c => !state.selected.includes(c.id) && phase.scores[c.id] > 0)
    .sort((a, b) => phase.scores[b.id] - phase.scores[a.id])[0] ?? null;
  return {phase, control: scored.score, behaviour: state.behaviourPoints[n], helped,
    missed: missed && {control: missed, points: phase.scores[missed.id]}};
}

// The questions answered in one phase, each once, in the order they were first answered.
function questionsOf(state, n) {
  const groups = new Map();
  for (const a of state.answers.filter(x => x.phase === n)) groups.set(a.questionId, [...(groups.get(a.questionId) ?? []), a]);
  return [...groups];
}

/**
 * The debrief as text blocks for makePdf(): [{kind, text}].
 * room: the player's view in multiplayer (their name, team and every team), or null in single player.
 */
export function debriefBlocks({data, bank}, state, room = null, date = new Date()) {
  const blocks = [];
  const add = (kind, text) => blocks.push({kind, text});
  const me = room && !room.you?.host ? room.you : null;
  const control = state.result.total;
  const behaviour = state.behaviourPoints.reduce((sum, p) => sum + p, 0);
  const night = nightStars(data, bank, state);
  const report = reportLines(data, bank, state);

  add('title', `${GAME_NAME}: your debrief`);
  add('sub', [me && `${me.name}`, room?.team?.name && `team ${room.team.name}`, BUSINESS_NAME,
    date.toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'})].filter(Boolean).join('  ·  '));

  add('h2', 'How the night went');
  add('p', `${night.stars} of 3 stars. ${night.title} ${night.line}`);
  add('li', `Control score ${control} (from the defences you bought), behaviour points ${pts(behaviour)} (from the quizzes), total ${pts(control + behaviour)}.`);
  add('li', `Your wall held ${report.summary.average}% of the attacks on average. ${report.summary.reached} of ${report.summary.attacks} attacks reached the vault.`);
  const chosen = state.selected.map(id => data.controls.find(c => c.id === id));
  add('li', `Defences bought: ${chosen.length ? chosen.map(c => `${c.name} (${c.category})`).join(', ') : 'none'}. ${pounds(state.result.unspent)} left unspent.`);
  if (room?.teams?.length > 1) {
    const rows = standings(data, room.teams, data.phases.length - 1);
    const own = rows.find(row => row.id === room.team?.id);
    if (own) add('li', `Your team finished ${own.rank} of ${rows.length}. Winner: ${rows.filter(r => r.rank === 1).map(r => r.name).join(' and ')}.`);
  }

  add('h2', `Night report: ${report.rating.word} (${report.summary.average}%)`);
  add('p', report.rating.line);
  add('h3', 'What worked');
  report.worked.forEach(line => add('li', line));
  add('h3', 'What was lacking');
  report.lacking.forEach(line => add('li', line));
  add('h3', 'What would have done better');
  report.better.forEach(line => add('li', line.replace('Open the Debrief for the explanations.', 'Each answer is explained below.')));

  add('h2', 'Phase by phase');
  data.phases.forEach((_, n) => {
    const facts = phaseFacts(data, state, n);
    add('h3', `${facts.phase.local_time}  ${facts.phase.title}`);
    add('p', `Control score ${facts.control}, behaviour points ${pts(facts.behaviour)}.`);
    add('li', facts.helped.length
      ? `What helped: ${facts.helped.map(h => `${h.control.name} (+${h.points})`).join(', ')}.`
      : 'What helped: none of your chosen controls scored in this phase.');
    if (facts.missed) {
      add('li', `Worth considering: ${facts.missed.control.name} (${facts.missed.control.category}, would have scored ${facts.missed.points}). ${facts.missed.control.use_case}`);
    }
    const questions = questionsOf(state, n);
    if (!questions.length) add('small', 'No quiz questions were answered in this phase.');
    for (const [questionId, given] of questions) {
      const q = bank.questions.find(x => x.id === questionId);
      if (!q) continue;
      add('q', `${q.category}: ${q.question}`);
      const mine = me ? given.find(a => a.player === me.id) : given[0];
      if (!mine) add('bad', 'You did not answer this one in time.');
      else if (mine.correct) add('good', `Your answer: ${mine.choice}. ${q.options[mine.choice]} - secure.`);
      else add('bad', `Your answer: ${mine.choice}. ${q.options[mine.choice] ?? ''} - not secure.`);
      if (!mine?.correct) add('li', `Secure answer: ${q.correct}. ${q.options[q.correct]}`);
      if (room) add('small', `Your team: ${given.filter(a => a.correct).length} of ${given.length} secure.`);
      add('small', `Why: ${q.secure_behaviour}. ${q.explanation}`);
    }
  });

  const earned = badges(data, bank, state).filter(b => b.earned);
  add('h2', 'Badges');
  add('p', earned.length ? earned.map(b => b.name).join(', ') : 'No badges this time. Play again to earn some.');
  add('h2', 'Keep it up at work');
  add('li', 'Stop and check anything urgent, unusual or that asks for passwords, money or data.');
  add('li', 'Verify through a channel you already trust, never the one in the message.');
  add('li', 'Report anything suspicious straight away, even if you think you made a mistake.');
  add('small', `${BUSINESS_NAME} is fictional. A teaching game: controls, prices and points are simplified for learning, not advice on what to buy.`);
  return blocks;
}

export function debriefPdf(game, state, room = null, date = new Date()) {
  return makePdf(debriefBlocks(game, state, room, date), {title: `${GAME_NAME} debrief`, footer: `${GAME_NAME} debrief`});
}

/** Browser only: build the PDF and save it on this device. */
export function downloadDebrief(game, state, room = null) {
  const who = room && !room.you?.host ? `-${room.you.name}` : '';
  const safe = `${GAME_NAME}-debrief${who}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  downloadPdf(debriefPdf(game, state, room), `${safe}.pdf`);
}
