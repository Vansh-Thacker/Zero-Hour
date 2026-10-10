/**
 * vault.mjs
 * ----------
 * Turns the game's scores into the heist's "vault integrity" (0 to 100)
 * and decides the ending: the heist is foiled, or the crew escapes.
 *
 * The theme only READS the game state and the scenario data. It never changes
 * them and never works out its own control scores: the points always come from
 * the scenario's own phase scores, the same numbers the scoring module uses.
 */

// ---------------------------------------------------------------------------
// The ending rule (decided by Vansh and Mo, also written in OUR_GAME.md)
// ---------------------------------------------------------------------------

/**
 * The crew is stopped if the vault is still at least this strong after phase 4.
 * 50 means: across the night, your defences earned at least half of the points
 * that the best possible set of defences could have earned.
 */
export const FOILED_THRESHOLD = 50;

// ---------------------------------------------------------------------------
// Reading the game state
// ---------------------------------------------------------------------------
// These are the ONLY places the theme looks inside the engine's state.
// If Tejas names things differently, change them here and nowhere else.

/** IDs of the controls the team chose. */
export function chosenControlIds(state) {
  return state.chosen ?? state.selected ?? state.result?.chosen ?? [];
}

/** Which phase is showing now: 0 for phase 1, up to 3 for phase 4. */
export function currentPhaseIndex(state) {
  return state.phaseIndex ?? state.currentPhase ?? 0;
}

/** Controls that can be chosen (already-in-place ones are left out). */
export function buyableControls(data) {
  const inPlaceIds = new Set((data.already_in_place ?? []).map(item => item.id ?? item));
  return data.controls.filter(control => !inPlaceIds.has(control.id));
}

/** Points one control earns in phase n. */
export function pointsFor(data, n, controlId) {
  return data.phases[n].scores[controlId] ?? 0;
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------
// When Rayyan's scores.mjs is ready, these two can be swapped for his
// phaseScore and bestPossiblePhaseScore. The tests will show they agree.

/**
 * The team's control score in phase n.
 * Uses the engine's result when it is there, otherwise adds up the points
 * from the scenario data for the chosen controls (the same numbers).
 */
export function phaseScore(data, state, n) {
  const fromEngine = state.result?.phases?.[n]?.score;
  if (typeof fromEngine === 'number') return fromEngine;

  return chosenControlIds(state).reduce((total, id) => total + pointsFor(data, n, id), 0);
}

/**
 * The most points any team could earn in phase n: every control that scores
 * in that phase. (Budget is ignored here: this is the "perfect" yardstick.)
 */
export function bestPossiblePhaseScore(data, n) {
  return buyableControls(data)
    .map(control => pointsFor(data, n, control.id))
    .filter(points => points > 0)
    .reduce((total, points) => total + points, 0);
}

// ---------------------------------------------------------------------------
// Vault integrity and the ending
// ---------------------------------------------------------------------------

/**
 * How strong the vault is, from 0 to 100, after phases 0..n.
 * It is the team's points so far as a share of the best possible points so far.
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

/**
 * Did this phase hold? A room "holds" if the team earned at least half of
 * the best possible points in that phase.
 */
export function phaseHeld(data, state, n) {
  const best = bestPossiblePhaseScore(data, n);
  if (best === 0) return true;
  return phaseScore(data, state, n) / best >= 0.5;
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

  if (integrity >= FOILED_THRESHOLD) {
    return {
      result: 'foiled',
      integrity,
      reason: `The vault held at ${integrity}%. Your defences stopped the crew in ${roomsHeld} of ${total} rooms, `
        + `which was enough to keep them from walking out with your data.`,
    };
  }
  return {
    result: 'escaped',
    integrity,
    reason: `The vault fell to ${integrity}%. Your defences only held in ${roomsHeld} of ${total} rooms, `
      + `so the crew found enough gaps to lock your files and demand a ransom.`,
  };
}
