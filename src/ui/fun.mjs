// The friendly face of the game: squad names and icons for the three categories,
// short prices, star ratings and badges. Pictures and words only: nothing here changes a score.
// The real category names (Prevent, Detect, Respond) are always shown next to the squad names.

import {POINTS_PER_SECURE_ANSWER, QUESTIONS_PER_CHECKPOINT} from '../config.mjs';
import {nightSummary} from './nightSummary.mjs';

export const SQUADS = {
  Prevent: {icon: '🛡️', name: 'Blockers', job: 'Stop the crew getting in'},
  Detect: {icon: '🔍', name: 'Spotters', job: 'Catch them sneaking around'},
  Respond: {icon: '🚒', name: 'Fixers', job: 'Clean up fast and recover'},
};

// £350,000 -> "£350k", £1,000,000 -> "£1m", £1,500,000 -> "£1.5m"
export function shortMoney(n) {
  if (n >= 1000000) return `£${+(n / 1000000).toFixed(2)}m`;
  if (n >= 1000) return `£${Math.round(n / 1000)}k`;
  return `£${n}`;
}

const STARS = {strong: 3, holding: 2, weak: 1};
const HEADLINE = {
  strong: {title: 'Vault saved!', line: 'The crew never got a grip. Brilliant night’s work.'},
  holding: {title: 'Close call!', line: 'The vault survived, but the crew found some gaps.'},
  weak: {title: 'Vault cracked!', line: 'The crew got through a lot tonight. See what would have helped.'},
};

/** Stars out of 3 and a headline for the end of the night, from the night report's rating. */
export function nightStars(data, bank, state) {
  const summary = nightSummary(data, bank, state);
  return {stars: STARS[summary.rating], rating: summary.rating, ...HEADLINE[summary.rating], summary};
}

/**
 * Badges for the end of the night. Each one is earned or not, with a line saying how.
 * Unearned badges are still shown (locked), so players know what to aim for next time.
 */
export function badges(data, bank, state) {
  const summary = nightSummary(data, bank, state);
  const perfect = POINTS_PER_SECURE_ANSWER * QUESTIONS_PER_CHECKPOINT;
  const perfectCheckpoints = state.behaviourPoints.filter(p => p >= perfect).length;
  return [
    {id: 'vault', icon: '🏰', name: 'Iron vault', how: 'Keep the vault secure all night',
      earned: summary.vault === 'secure'},
    {id: 'all-rounder', icon: '🧩', name: 'All-rounder', how: 'Blockers, Spotters and Fixers all help in every phase',
      earned: summary.layers.every(l => l.phasesHelped === data.phases.length)},
    {id: 'sharp', icon: '🧠', name: 'Sharp minds', how: 'Answer 75% of the questions securely',
      earned: summary.peoplePercent >= 75},
    {id: 'perfect', icon: '🔥', name: 'Perfect checkpoint', how: 'Get every question right at one checkpoint',
      earned: perfectCheckpoints > 0},
    {id: 'budget', icon: '💰', name: 'Budget boss', how: 'Spend at least 90% of the budget',
      earned: state.result.unspent <= data.budget * 0.1},
  ];
}
