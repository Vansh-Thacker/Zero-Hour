/**
 * heistNames.mjs
 * ---------------
 * Every heist name in the theme lives in this one file: controls, phases and roles.
 *
 * Rule from the brief: the real control name must always be shown next to any
 * theme name, so players still learn the real cyber term. heistLabel() does that.
 *
 * All names here are original. Nothing is taken from Money Heist or any other show.
 */

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

/**
 * Heist names for controls, matched by words in the control's real name.
 * We match on the name (not the ID) so this keeps working even if the IDs
 * in challenge.json change. Order matters: the first match wins, so the more
 * specific entries (e.g. "24x7 response team") come before general ones.
 */
const CONTROL_NAME_RULES = [
  // Prevent
  { match: ['training', 'awareness'], heist: 'Crew-spotting drills' },
  { match: ['email'], heist: 'Mailroom scanner' },
  { match: ['anti malware', 'anti-malware', 'antivirus', 'malware'], heist: 'Device sweep' },
  { match: ['segmentation'], heist: 'Sealed corridors' },
  { match: ['patch', 'update'], heist: 'Reinforced locks' },
  { match: ['secure by design'], heist: 'Heist-proof blueprints' },
  { match: ['behaviour analysis', 'behavior analysis', 'nba'], heist: 'Footstep sensors' },
  { match: ['multi-factor', 'multi factor', 'mfa', 'two-factor'], heist: 'Two-key entry' },
  { match: ['privileged', 'access management'], heist: 'Master-key safe' },
  { match: ['password'], heist: 'Key cabinet' },
  { match: ['encryption'], heist: 'Locked strongboxes' },
  { match: ['data loss', 'dlp'], heist: 'Exit searches' },

  // Detect
  { match: ['siem'], heist: 'Monitor wall' },
  { match: ['endpoint', 'edr'], heist: 'Desk cameras' },
  { match: ['intrusion', 'ids', 'ips'], heist: 'Laser tripwires' },
  { match: ['threat hunting', 'hunting'], heist: 'Night patrol' },
  { match: ['security operations', 'soc', 'monitoring', 'logging'], heist: 'Control-room watch' },

  // Respond (specific response teams first, then plans, then general)
  { match: ['24x7', '24 x 7', '24×7', '24/7', '24 × 7'], heist: 'Round-the-clock response unit' },
  { match: ['9-5', '9–5', 'mon - fri', 'mon-fri', 'office hours'], heist: 'Day-shift response unit' },
  { match: ['plan', 'playbook'], heist: 'Lockdown playbook' },
  { match: ['forensic'], heist: 'Evidence team' },
  { match: ['backup'], heist: 'Duplicate vault' },
  { match: ['recovery', 'restore'], heist: 'Emergency restore crew' },
  { match: ['incident response', 'response team'], heist: 'Rapid response unit' },

  // Already in place (shown, but cannot be chosen)
  { match: ['firewall'], heist: 'Perimeter fence' },
  { match: ['vulnerability'], heist: 'Weekly lock check' },
  { match: ['penetration', 'pen test'], heist: 'Practice break-in' },
];

/** Used only if a control's name matches none of the rules above. */
const CATEGORY_FALLBACK = {
  Prevent: 'Gate',
  Detect: 'Lookout',
  Respond: 'Response crew',
};

/**
 * Does the real name contain this word?
 * Short words like "ids" or "soc" must match a whole word, so "ids" does not
 * match inside a longer word by accident.
 */
function nameContains(realName, word) {
  if (word.length > 4) return realName.includes(word);
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(realName);
}

/** The first naming rule that matches this control, or undefined. */
function findRule(control) {
  const realName = control.name.toLowerCase();
  return CONTROL_NAME_RULES.find(rule => rule.match.some(word => nameContains(realName, word)));
}

/**
 * The heist name for one control, e.g. "Mailroom scanner".
 * @param {{name: string, category?: string}} control
 * @returns {string}
 */
export function heistName(control) {
  const rule = findRule(control);
  if (rule) return rule.heist;
  return CATEGORY_FALLBACK[control.category] ?? 'Security measure';
}

/**
 * True if the control has its own heist name (not the category fallback).
 * Used by the tests to check that every real control is covered.
 */
export function hasOwnHeistName(control) {
  return findRule(control) !== undefined;
}

/**
 * The label shown to players: heist name plus the real name.
 * e.g. "Mailroom scanner (Email Security)"
 */
export function heistLabel(control) {
  return `${heistName(control)} (${control.name})`;
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

/** Heist names for the four phases, keyed by phase number (1 to 4). */
const PHASE_NAMES = {
  1: { title: 'The Way In', room: 'Front desk' },
  2: { title: 'Casing the Vault', room: 'Corridors' },
  3: { title: 'The Inside Call', room: 'Night desk' },
  4: { title: 'Lockdown', room: 'Vault door' },
};

/**
 * Heist title and room for a phase.
 * Accepts the phase ID from challenge.json ("phase_1", "phase1", "p1"...)
 * or the phase's position in the list (0 to 3) as a fallback.
 * @param {string} phaseId
 * @param {number} index position of the phase in data.phases
 */
export function heistPhase(phaseId, index) {
  const numberInId = String(phaseId ?? '').match(/\d+/);
  const phaseNumber = numberInId ? Number(numberInId[0]) : index + 1;
  return PHASE_NAMES[phaseNumber] ?? { title: `Stage ${index + 1}`, room: `Room ${index + 1}` };
}

// ---------------------------------------------------------------------------
// Roles (used by multiplayer)
// ---------------------------------------------------------------------------

/** Each player role looks after one category of controls. */
export const ROLES = {
  Prevent: { role: 'Gatekeeper', icon: '🔒', job: 'Keeps the crew out' },
  Detect: { role: 'Watcher', icon: '🎥', job: 'Spots the crew moving' },
  Respond: { role: 'Responder', icon: '🚨', job: 'Fights back and recovers' },
};

/** e.g. roleFor('Detect') -> { role: 'Watcher', icon: '🎥', job: '...' } */
export function roleFor(category) {
  return ROLES[category];
}

// ---------------------------------------------------------------------------
// The crew
// ---------------------------------------------------------------------------

export const MASTERMIND = 'The Architect';
export const HEIST_NAME = 'Zero Hour';
