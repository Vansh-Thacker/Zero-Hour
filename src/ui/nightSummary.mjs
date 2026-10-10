// The night report on the outcome screen: how well the defences held across all four phases,
// what was lacking, and what would have done better. Pure: no page code.
// It builds on defenceStrength(), so it always agrees with the battle display and the scores.

import {scoreSelection} from '../../1-foundation/starter/controls.mjs';
import {defenceStrength, ATTACKS, STRONG_FROM, WEAK_BELOW} from './defenceStrength.mjs';
import {POINTS_PER_SECURE_ANSWER, QUESTIONS_PER_CHECKPOINT} from '../config.mjs';

const CATEGORIES = ['Prevent', 'Detect', 'Respond'];
const VAULT = {strong: 'secure', holding: 'damaged', weak: 'breached'};

export function nightSummary(data, bank, state) {
  const phases = data.phases.map((phase, n) => ({n, title: phase.title, time: phase.local_time, ...defenceStrength(data, state, n)}));
  const average = Math.round(phases.reduce((sum, p) => sum + p.wallPercent, 0) / phases.length);
  const rating = average >= STRONG_FROM * 100 ? 'strong' : average >= WEAK_BELOW * 100 ? 'holding' : 'weak';
  const byWall = [...phases].sort((a, b) => b.wallPercent - a.wallPercent || a.n - b.n);

  // Each layer across the night: points, and how many phases it helped in.
  const layers = CATEGORIES.map(category => {
    const points = phases.map(p => p.layers.find(l => l.category === category).points);
    return {category, points: points.reduce((a, b) => a + b, 0), phasesHelped: points.filter(x => x > 0).length};
  });
  const weakestLayer = [...layers].sort((a, b) => a.phasesHelped - b.phasesHelped || a.points - b.points)[0];

  // People: share of all checkpoint questions answered securely (team average).
  const behaviour = (state.behaviourPoints ?? []).reduce((a, b) => a + b, 0);
  const peoplePercent = Math.round(100 * behaviour / (POINTS_PER_SECURE_ANSWER * QUESTIONS_PER_CHECKPOINT * data.phases.length));

  // The control that would have added most across the night, and whether it would have fitted.
  const nightPoints = id => data.phases.reduce((sum, p) => sum + p.scores[id], 0);
  const chosen = state.selected.map(id => data.controls.find(c => c.id === id));
  const unchosen = data.controls.filter(c => !state.selected.includes(c.id))
    .map(c => ({...c, night: nightPoints(c.id)}))
    .sort((a, b) => b.night - a.night || a.id.localeCompare(b.id));
  const unspent = state.result.unspent;
  const affordable = unchosen.find(c => c.cost <= unspent && c.night > 0);
  const suggestion = affordable
    ? {kind: 'add', control: affordable, points: affordable.night, unspent}
    : bestSwap(data, state.selected, chosen, unchosen, nightPoints);

  // The behaviour topic with the most answers that were not secure.
  const missedTopics = new Map();
  for (const answer of state.answers ?? []) {
    if (answer.correct) continue;
    const topic = bank.questions.find(q => q.id === answer.questionId)?.category;
    if (topic) missedTopics.set(topic, (missedTopics.get(topic) ?? 0) + 1);
  }
  const weakestTopic = [...missedTopics].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null;

  // Damage dealt to the vault: every attack that got through, out of all attacks in the night.
  const reached = phases.reduce((sum, p) => sum + p.through, 0);
  const attacks = ATTACKS * phases.length;

  return {
    phases,
    average,
    reached,
    attacks,
    damage: reached / attacks,
    rating,
    vault: VAULT[rating],
    strongest: byWall[0],
    weakest: byWall[byWall.length - 1],
    layers,
    weakestLayer,
    peoplePercent,
    suggestion,
    weakestTopic: weakestTopic && {topic: weakestTopic[0], missed: weakestTopic[1]},
  };
}

// The swap that gains the most points across the night. Only swaps that leave a plan the game
// would accept count: within budget and still with a Prevent, a Detect and a Respond control.
function bestSwap(data, selected, chosen, unchosen, nightPoints) {
  let best = null;
  for (const control of unchosen) {
    if (control.night <= 0) continue;
    for (const instead of chosen) {
      const points = control.night - nightPoints(instead.id);
      if (points <= 0 || (best && points <= best.points)) continue;
      try {
        scoreSelection(data, [...selected.filter(id => id !== instead.id), control.id]);
      } catch {
        continue; // over budget or a category left empty: not advice we can give
      }
      best = {kind: 'swap', control, points, instead};
    }
  }
  return best;
}
