/**
 * architect.mjs
 * --------------
 * Short lines from The Architect, the crew's mastermind, after each phase.
 *
 * The lines teach the real lesson of the game: the right defence at the right
 * moment. They are based on which chosen controls scored in this phase, and
 * which defence layers were left with nothing that worked.
 *
 * Wording follows what the control actually does, because detecting is not
 * the same as stopping, and containing is not the same as recovering:
 *   Prevent                    -> "blocked us"
 *   Detect                     -> "spotted us"     (never "blocked" or "stopped")
 *   Respond                    -> "contained us"
 *   Respond: backups, forensics -> "you recovered"
 */

import { heistLabel, heistName } from './heistNames.mjs';
import { buyableControls, chosenControlIds, currentPhaseIndex, pointsFor } from './vault.mjs';

const CATEGORIES = ['Prevent', 'Detect', 'Respond'];

/** How many "this worked" lines to show at most, so the message stays quick to read. */
const MAX_DEFENCE_LINES = 2;

/** Respond controls that help you recover afterwards, rather than contain the crew. */
const RECOVERY_WORDS = ['backup', 'restore', 'recovery', 'forensic'];

function isRecoveryControl(control) {
  const name = control.name.toLowerCase();
  return RECOVERY_WORDS.some(word => name.includes(word));
}

/** What The Architect says about a defence that worked. */
function workedLine(control) {
  const label = heistLabel(control);
  if (control.category === 'Prevent') {
    return `${label} blocked us. We'll need another way in.`;
  }
  if (control.category === 'Detect') {
    return `${label} spotted us. Being seen doesn't end a heist, but now your team knows where we are.`;
  }
  if (isRecoveryControl(control)) {
    return `${label} means you recovered what we took. Our leverage just got smaller.`;
  }
  return `${label} contained us. You planned for the worst. Annoying.`;
}

/**
 * What The Architect says when a whole layer had nothing that worked.
 * Only used when NO chosen control in that category scored this phase,
 * so he never says "nobody was watching" after a Detect control spotted him.
 */
const GAP_LINE = {
  Prevent: control => `Nothing stood in our way. ${heistName(control)} (${control.name}) would have kept us out.`,
  Detect: control => `Nobody was watching. ${heistName(control)} (${control.name}) would have seen us coming.`,
  Respond: control => `When we struck, nobody answered. ${heistName(control)} (${control.name}) would have.`,
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
    chosen: chosen.has(control.id),
  }));

  // Chosen controls that scored this phase, best first.
  const worked = controls
    .filter(control => control.chosen && control.points > 0)
    .sort((a, b) => b.points - a.points);

  const defences = worked.slice(0, MAX_DEFENCE_LINES).map(control => ({
    kind: 'defence',
    category: control.category,
    text: workedLine(control),
  }));

  // Layers where nothing the team chose scored. Name the best control they could have had.
  const gaps = CATEGORIES
    .filter(category => !worked.some(control => control.category === category))
    .map(category => controls
      .filter(control => control.category === category && control.points > 0)
      .sort((a, b) => b.points - a.points)[0])
    .filter(Boolean)
    .map(control => ({ kind: 'gap', category: control.category, text: GAP_LINE[control.category](control) }));

  return [...defences, ...gaps, summaryLine(worked.length, gaps.length)];
}

/** One closing line that sums up the phase. */
function summaryLine(workedCount, gapCount) {
  if (workedCount === 0) {
    return { kind: 'summary', text: 'Not one of your defences touched us. Thank you for the open door.' };
  }
  if (gapCount === 0) {
    return { kind: 'summary', text: 'Every layer had something in our way. Impressive. We will wait for your next mistake.' };
  }
  return { kind: 'summary', text: 'You covered some layers, not all of them. We only need one gap.' };
}
