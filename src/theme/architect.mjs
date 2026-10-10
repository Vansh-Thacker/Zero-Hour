/**
 * architect.mjs
 * --------------
 * Short lines from The Architect, the crew's mastermind, after each phase.
 *
 * The lines teach the real lesson of the game: the right defence at the right
 * moment. They are based on which chosen controls scored in this phase, and
 * which gaps were left.
 *
 * Wording follows the category, because detecting is not the same as stopping:
 *   Prevent  -> "blocked us"
 *   Detect   -> "spotted us"   (never "blocked" or "stopped")
 *   Respond  -> "contained us"
 */

import { heistLabel, heistName } from './heistNames.mjs';
import { buyableControls, chosenControlIds, currentPhaseIndex, pointsFor } from './vault.mjs';

/** How many lines to show at most, so the message stays quick to read. */
const MAX_DEFENCE_LINES = 2;
const MAX_GAP_LINES = 2;

/** What The Architect says about a defence that worked, by category. */
const WORKED = {
  Prevent: label => `${label} blocked us. We'll need another way in.`,
  Detect: label => `${label} spotted us. Being seen doesn't end a heist, but now your team knows where we are.`,
  Respond: label => `${label} contained us. You planned for the worst. Annoying.`,
};

/** What The Architect says about a gap the team left, by category. */
const GAP = {
  Prevent: (name, realName) => `Nothing stood in our way. ${name} (${realName}) would have kept us out.`,
  Detect: (name, realName) => `Nobody was watching. ${name} (${realName}) would have seen us coming.`,
  Respond: (name, realName) => `When we struck, nobody answered. You had no ${name.toLowerCase()} (${realName}).`,
};

/**
 * The Architect's lines for phase n (defaults to the phase showing now).
 * @returns {Array<{ kind: 'defence' | 'gap' | 'summary', category?: string, text: string }>}
 */
export function architectMessages(data, state, n = currentPhaseIndex(state)) {
  const chosen = new Set(chosenControlIds(state));
  const controls = buyableControls(data).map(control => ({
    ...control,
    points: pointsFor(data, n, control.id),
  }));

  // Chosen controls that scored this phase, best first.
  const defences = controls
    .filter(control => chosen.has(control.id) && control.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, MAX_DEFENCE_LINES)
    .map(control => ({
      kind: 'defence',
      category: control.category,
      text: WORKED[control.category](heistLabel(control)),
    }));

  // The best control the team did NOT choose in each category, if it scored.
  const gaps = ['Prevent', 'Detect', 'Respond']
    .map(category => controls
      .filter(control => control.category === category && !chosen.has(control.id) && control.points > 0)
      .sort((a, b) => b.points - a.points)[0])
    .filter(Boolean)
    .sort((a, b) => b.points - a.points)
    .slice(0, MAX_GAP_LINES)
    .map(control => ({
      kind: 'gap',
      category: control.category,
      text: GAP[control.category](heistName(control), control.name),
    }));

  return [...defences, ...gaps, summaryLine(defences.length, gaps.length)];
}

/** One closing line that sums up the phase. */
function summaryLine(defenceCount, gapCount) {
  if (defenceCount === 0) {
    return { kind: 'summary', text: 'Not one of your defences touched us. Thank you for the open door.' };
  }
  if (gapCount === 0) {
    return { kind: 'summary', text: 'Every door we tried was covered. Impressive. We will wait for your next mistake.' };
  }
  return { kind: 'summary', text: 'You covered some doors, not all of them. We only need one.' };
}
