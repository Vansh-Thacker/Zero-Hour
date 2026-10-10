/**
 * vault.mjs
 * ----------
 * Turns the game's scores into the heist's "vault integrity" (0 to 100)
 * and decides the ending: the heist is foiled, or the crew escapes.
 *
 * The yardstick is the BEST CHOICE A TEAM COULD REALLY MAKE: the set of controls
 * that earns the most points across the night while fitting the £3m budget and
 * covering Prevent, Detect and Respond. A team that matches it keeps the vault at 100%.
 *
 * The theme only READS the game state and the scenario data. It never changes
 * them and never works out its own control scores: the points always come from
 * the scenario's own phase scores, the same numbers the scoring module uses.
 */

// ---------------------------------------------------------------------------
// Rules (decided by Vansh and Mo, also written in OUR_GAME.md)
// ---------------------------------------------------------------------------

/**
 * The crew is stopped if the vault is still at least this strong after phase 4:
 * your defences earned at least half the points of the best affordable choice.
 */
export const FOILED_THRESHOLD = 50;

/** A room holds if the team earned at least this share of the best affordable choice's points there. */
export const ROOM_HOLDS_AT = 0.5;

/** The budget for controls, from the brief. A scenario file can override it with total_budget. */
const DEFAULT_BUDGET = 3_000_000;

const CATEGORIES = ['Prevent', 'Detect', 'Respond'];

// ---------------------------------------------------------------------------
// Reading the game state
// ---------------------------------------------------------------------------
// These are the ONLY places the theme looks inside the engine's state.
// If the engine renames something, change it here and nowhere else.

/** IDs of the controls the team chose (engine: state.selected). */
export function chosenControlIds(state) {
  return state.selected ?? state.chosen ?? [];
}

/** Which phase is showing now: 0 for phase 1, up to 3 for phase 4 (engine: state.phase). */
export function currentPhaseIndex(state) {
  const phase = state.phase ?? state.phaseIndex ?? 0;
  return typeof phase === 'number' ? phase : 0;
}

// ---------------------------------------------------------------------------
// Reading the scenario data
// ---------------------------------------------------------------------------

/** Controls that can be chosen (already-in-place ones are left out). */
export function buyableControls(data) {
  const inPlaceIds = new Set((data.already_in_place ?? []).map(item => item.id ?? item));
  return data.controls.filter(control => !inPlaceIds.has(control.id));
}

/** Points one control earns in phase n. */
export function pointsFor(data, n, controlId) {
  return data.phases[n].scores[controlId] ?? 0;
}

/** The control budget for this scenario. */
export function totalBudget(data) {
  return data.total_budget ?? DEFAULT_BUDGET;
}

// ---------------------------------------------------------------------------
// The best affordable choice (the yardstick)
// ---------------------------------------------------------------------------

/** Worked out once per scenario, then reused. */
const bestChoiceCache = new WeakMap();

/**
 * The set of controls that earns the most points over all phases while costing
 * no more than the budget and covering all three categories. Ties go to the
 * cheaper set.
 *
 * With 18 controls there are 2^18 = 262,144 possible sets, so we simply check
 * them all. It takes a fraction of a second, runs once, and is easy to trust.
 *
 * @returns {{ ids: string[], cost: number, phasePoints: number[], total: number }}
 */
export function bestAffordableChoice(data) {
  if (bestChoiceCache.has(data)) return bestChoiceCache.get(data);

  const controls = buyableControls(data);
  const budget = totalBudget(data);
  const totalPoints = controls.map(c => data.phases.reduce((sum, _, n) => sum + pointsFor(data, n, c.id), 0));

  let best = { mask: 0, total: -1, cost: Infinity };
  for (let mask = 1; mask < 1 << controls.length; mask++) {
    let cost = 0;
    let total = 0;
    const covered = new Set();
    for (let i = 0; i < controls.length; i++) {
      if (mask & (1 << i)) {
        cost += controls[i].cost;
        total += totalPoints[i];
        covered.add(controls[i].category);
      }
    }
    const valid = cost <= budget && CATEGORIES.every(category => covered.has(category));
    if (valid && (total > best.total || (total === best.total && cost < best.cost))) {
      best = { mask, total, cost };
    }
  }

  const ids = controls.filter((_, i) => best.mask & (1 << i)).map(c => c.id);
  const result = {
    ids,
    cost: best.cost,
    total: Math.max(best.total, 0),
    phasePoints: data.phases.map((_, n) => ids.reduce((sum, id) => sum + pointsFor(data, n, id), 0)),
  };
  bestChoiceCache.set(data, result);
  return result;
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

/** The team's control score in phase n: the points of the chosen controls. */
export function phaseScore(data, state, n) {
  return chosenControlIds(state).reduce((total, id) => total + pointsFor(data, n, id), 0);
}

/** The best affordable choice's points in phase n. */
export function bestPossiblePhaseScore(data, n) {
  return bestAffordableChoice(data).phasePoints[n];
}

// ---------------------------------------------------------------------------
// Vault integrity and the ending
// ---------------------------------------------------------------------------

/**
 * How strong the vault is, from 0 to 100, after phases 0..n:
 * the team's points so far as a share of the best affordable choice's points so far.
 * Defaults to the phase showing now.
 */
export function vaultIntegrity(data, state, n = currentPhaseIndex(state)) {
  let earned = 0;
  let possible = 0;
  for (let phase = 0; phase <= n; phase++) {
    earned += phaseScore(data, state, phase);
    possible += bestPossiblePhaseScore(data, phase);
  }
  if (possible === 0) return 100;

  const percent = Math.round((earned / possible) * 100);
  return Math.min(100, Math.max(0, percent));
}

/** Did the team's defences hold in room n? */
export function phaseHeld(data, state, n) {
  const best = bestPossiblePhaseScore(data, n);
  if (best === 0) return true;
  return phaseScore(data, state, n) / best >= ROOM_HOLDS_AT;
}

/**
 * The heist's ending, worked out from the whole night (all four phases).
 * @returns {{ result: 'foiled' | 'escaped', integrity: number, reason: string }}
 */
export function heistOutcome(data, state) {
  const lastPhase = data.phases.length - 1;
  const integrity = vaultIntegrity(data, state, lastPhase);
  const roomsHeld = data.phases.filter((_, n) => phaseHeld(data, state, n)).length;
  const total = data.phases.length;
  const earned = data.phases.reduce((sum, _, n) => sum + phaseScore(data, state, n), 0);
  const best = bestAffordableChoice(data).total;
  const budget = `£${totalBudget(data) / 1_000_000}m`;
  const comparison = `You scored ${earned} of the ${best} points the best ${budget} choice could earn.`;

  if (integrity >= FOILED_THRESHOLD) {
    return {
      result: 'foiled',
      integrity,
      reason: `The vault held at ${integrity}%. ${comparison} Your defences held in ${roomsHeld} of ${total} rooms, `
        + `enough to keep the crew from walking out with your data.`,
    };
  }
  return {
    result: 'escaped',
    integrity,
    reason: `The vault fell to ${integrity}%. ${comparison} Your defences held in only ${roomsHeld} of ${total} rooms, `
      + `so the crew found enough gaps to lock your files and demand a ransom.`,
  };
}
