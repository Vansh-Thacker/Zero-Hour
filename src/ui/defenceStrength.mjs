// How strong the team's defences were in one phase, for the battle display on the reveal screen.
// Pure: no page code. It only reads the game state, so the picture can never disagree with it.
//
// Two layers stop attacks:
//  - Controls: the phase's control score from the scoring module, measured against the best score
//    any valid £3m plan could get in that phase (bestPossiblePhaseScore in engine/scores.mjs).
//  - People: how securely the team answered at the previous checkpoint. Secure answers patch the
//    wall for the next phase. People can stop at most 30% of what got past the controls, so the
//    controls stay the main defence: good answers can lift a phase one level, but cannot rescue
//    a plan with no defences. Phase 1 has no checkpoint before it, so people are untested.
// Neither layer changes any score: the control score and behaviour points stay exactly as they are.

import {bestPossiblePhaseScore} from '../engine/scores.mjs';
import {POINTS_PER_SECURE_ANSWER, QUESTIONS_PER_CHECKPOINT} from '../config.mjs';

export const ATTACKS = 10;            // attack icons in the display
export const STRONG_FROM = 0.7;       // 70% or more held: the wall holds
export const WEAK_BELOW = 0.4;        // under 40% held: the wall cracks and the player is warned
export const PEOPLE_SHARE = 0.3;      // at most 30% of what gets past the controls

const CATEGORIES = ['Prevent', 'Detect', 'Respond'];
const bestCache = new WeakMap();      // data -> [best score per phase]; the search is too slow to redo each draw

function bestFor(data, n) {
  if (!bestCache.has(data)) bestCache.set(data, data.phases.map((_, i) => bestPossiblePhaseScore(data, i)));
  return bestCache.get(data)[n];
}

// Share of the previous checkpoint answered securely, 0 to 1. Uses the engine's behaviour points,
// which are already a team average, so it works the same for one screen or many phones.
export function peopleRate(state, n) {
  if (n === 0) return null;
  const earned = state.behaviourPoints?.[n - 1] ?? 0;
  const possible = POINTS_PER_SECURE_ANSWER * QUESTIONS_PER_CHECKPOINT;
  return Math.max(0, Math.min(1, earned / possible));
}

// Damage dealt to the vault so far: attacks that got through in phases 0..n, as a share of
// every attack in the night. Only goes up as the night goes on.
export function vaultDamageSoFar(data, state, n) {
  let reached = 0;
  for (let i = 0; i <= n; i++) reached += defenceStrength(data, state, i).through;
  return {reached, attacks: ATTACKS * data.phases.length, damage: reached / (ATTACKS * data.phases.length)};
}

export function defenceStrength(data, state, n) {
  const phase = state.result.phases[n];
  const best = bestFor(data, n);
  const ratio = best > 0 ? Math.min(1, phase.score / best) : 1;

  const heldByControls = Math.round(ATTACKS * ratio);
  const rate = peopleRate(state, n);
  const heldByPeople = rate === null ? 0 : Math.round((ATTACKS - heldByControls) * rate * PEOPLE_SHARE);
  const held = heldByControls + heldByPeople;
  const wall = held / ATTACKS;
  const level = wall >= STRONG_FROM ? 'strong' : wall >= WEAK_BELOW ? 'holding' : 'weak';

  const byId = id => data.controls.find(c => c.id === id);
  const layers = CATEGORIES.map(category => ({
    category,
    points: phase.contributions
      .filter(c => byId(c.id).category === category)
      .reduce((sum, c) => sum + c.points, 0),
  }));

  // The single control that would have added most here, if the team didn't choose it.
  const scores = data.phases[n].scores;
  const missed = data.controls
    .filter(c => !state.selected.includes(c.id) && scores[c.id] > 0)
    .sort((a, b) => scores[b.id] - scores[a.id] || a.id.localeCompare(b.id))[0] ?? null;

  return {
    score: phase.score,
    best,
    percent: Math.round(ratio * 100),          // controls only, as a share of the best plan
    wallPercent: Math.round(wall * 100),       // controls and people together
    level,
    attacks: ATTACKS,
    heldByControls,
    heldByPeople,
    held,
    through: ATTACKS - held,
    people: {tested: rate !== null, percent: rate === null ? null : Math.round(rate * 100)},
    layers,
    missed: missed && {id: missed.id, name: missed.name, category: missed.category, points: scores[missed.id], useCase: missed.use_case},
  };
}
