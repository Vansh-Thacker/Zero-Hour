// Team standings for multiplayer: every team's wall faced the same attacks, so compare how well
// each one held. Pure: no page code. Built on defenceStrength(), so it always agrees with the
// battle display, the night report and the scores.
//
// Ranking: the share of attacks the wall held across the phases revealed so far (wall held %),
// then the total points (control + behaviour), then the team name.

import {defenceStrength, ATTACKS, STRONG_FROM, WEAK_BELOW} from './defenceStrength.mjs';

const VAULT = {strong: 'secure', holding: 'damaged', weak: 'breached'};

/** The last phase whose results everyone has seen: -1 before the first reveal, 3 at the end. */
export function revealedUpTo(state) {
  if (!state?.confirmed) return -1;
  if (state.stage === 'outcome') return 3;
  return state.stage === 'story' ? state.phase - 1 : state.phase;
}

/**
 * teams: [{id, name, players, state}], as the server sends them.
 * Returns one row per team that has locked a plan, best first, with its rank (ties share one).
 */
export function standings(data, teams, upTo) {
  const rows = teams
    .filter(team => team.state?.result)
    .map(team => {
      const phases = [];
      for (let n = 0; n <= upTo; n++) {
        const s = defenceStrength(data, team.state, n);
        phases.push({n, wallPercent: s.wallPercent, held: s.held, through: s.through, level: s.level, score: s.score});
      }
      const shown = phases.length;
      const held = phases.reduce((sum, p) => sum + p.held, 0);
      const attacks = ATTACKS * shown;
      const wallPercent = shown ? Math.round(100 * held / attacks) : 0;
      const control = phases.reduce((sum, p) => sum + p.score, 0);
      const behaviour = team.state.behaviourPoints.slice(0, shown).reduce((sum, p) => sum + p, 0);
      const level = !shown ? null : wallPercent >= STRONG_FROM * 100 ? 'strong' : wallPercent >= WEAK_BELOW * 100 ? 'holding' : 'weak';
      return {
        id: team.id,
        name: team.name,
        players: team.players.length,
        spent: team.state.result.spent,
        phases,
        wallPercent,
        cracks: attacks - held,        // attacks that got through the wall
        attacks,
        control,
        behaviour,
        total: control + behaviour,
        level,
        vault: level && VAULT[level],
      };
    })
    .sort((a, b) => b.wallPercent - a.wallPercent || b.total - a.total || a.name.localeCompare(b.name));

  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.rank = prev && prev.wallPercent === row.wallPercent && prev.total === row.total ? prev.rank : i + 1;
  });
  return rows;
}
