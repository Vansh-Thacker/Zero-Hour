// The night report: the safe, a strip showing how the wall held in each phase,
// and three plain-language cards: what worked, what was lacking, what would have done better.

import {el, money} from './dom.mjs';
import {nightSummary} from './nightSummary.mjs';
import {vaultSafe} from './vaultSafe.mjs';

const RATING = {
  strong: {mark: '▲', word: 'Strong defence', line: 'Your defences held through the night. The crew never got a real grip on the vault.'},
  holding: {mark: '◆', word: 'Defence held, with cracks', line: 'The vault survived, but the crew found gaps. A few changes would have made it solid.'},
  weak: {mark: '✖', word: 'Weak defence', line: 'The crew got through most of your defences. Look at what was lacking below.'},
};
const VAULT_WORD = {secure: '✓ Vault secure', damaged: '◆ Vault damaged', breached: '✖ Vault breached'};
const LEVEL = {strong: '▲ Strong', holding: '◆ Holding', weak: '✖ Weak'};

// The safe on its own, for the top of the outcome screen.
export function outcomeVault(data, bank, state) {
  const summary = nightSummary(data, bank, state);
  return el('figure', {class: `outcome-vault is-${summary.vault}`},
    vaultSafe(summary.vault, 'Data vault', summary.damage),
    el('figcaption', {}, VAULT_WORD[summary.vault],
      el('span', {}, ` · ${summary.reached} of ${summary.attacks} attacks reached it`)));
}

export function nightReport(data, bank, state) {
  const s = nightSummary(data, bank, state);
  const rating = RATING[s.rating];

  const strip = el('ol', {class: 'night-strip', 'aria-label': 'How the wall held in each phase'},
    s.phases.map(p => el('li', {class: `is-${p.level}`},
      el('span', {class: 'night-time'}, p.time),
      el('strong', {}, p.title),
      el('span', {class: 'night-meter', role: 'meter', 'aria-label': `Phase ${p.n + 1} wall`, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': p.wallPercent},
        el('i', {style: `--fill:${p.wallPercent}%`})),
      el('span', {class: 'night-level'}, `${LEVEL[p.level]} · ${p.wallPercent}%`),
      el('span', {class: 'night-split'}, `${p.heldByControls} by controls + ${p.heldByPeople} by people`))));

  const worked = [
    `Best phase: ${s.strongest.time}, ${s.strongest.title}. Your wall held ${s.strongest.wallPercent}%.`,
    ...s.layers.filter(l => l.phasesHelped === 4).map(l => `${l.category} controls helped in every phase (${l.points} points).`),
    s.peoplePercent >= 50 ? `Your people answered ${s.peoplePercent}% of the questions securely and patched the wall.` : null,
  ].filter(Boolean);

  const lacking = [
    `Weakest phase: ${s.weakest.time}, ${s.weakest.title}. Only ${s.weakest.wallPercent}% held.`,
    s.weakestLayer.phasesHelped < 4
      ? `${s.weakestLayer.category} controls helped in only ${s.weakestLayer.phasesHelped} of 4 phases (${s.weakestLayer.points} points).`
      : null,
    s.peoplePercent < 50 ? `Your people answered only ${s.peoplePercent}% of the questions securely, so they patched little of the wall.` : null,
  ].filter(Boolean);

  const better = [];
  if (s.suggestion?.kind === 'add') {
    better.push(`Add ${s.suggestion.control.name} (${s.suggestion.control.category}, ${money(s.suggestion.control.cost)}). `
      + `You had ${money(s.suggestion.unspent)} unspent, and it would have added ${s.suggestion.points} points across the night.`);
  } else if (s.suggestion?.kind === 'swap') {
    better.push(`Swap ${s.suggestion.instead.name} for ${s.suggestion.control.name} (${s.suggestion.control.category}). `
      + `Same budget, ${s.suggestion.points} more points across the night.`);
  } else {
    better.push('Your control choices were close to the best your budget allowed.');
  }
  if (s.weakestTopic) {
    better.push(`Revisit ${s.weakestTopic.topic}: ${s.weakestTopic.missed} answer${s.weakestTopic.missed === 1 ? '' : 's'} on this topic `
      + 'were not secure. The explanations are in the debrief below.');
  }
  better.push(s.suggestion
    ? 'Try another game with these changes and watch the wall in each phase.'
    : 'Try another game and aim for all-secure answers to patch the wall further.');

  const card = (kind, title, lines) => el('article', {class: `panel night-card is-${kind}`},
    el('h3', {}, title), el('ul', {}, lines.map(line => el('li', {}, line))));

  return el('section', {class: `night-report is-${s.rating}`, 'aria-labelledby': 'night-title'},
    el('div', {class: 'night-head'},
      el('h2', {id: 'night-title'}, 'Night report'),
      el('span', {class: 'level-chip'}, `${rating.mark} ${rating.word} · ${s.average}%`)),
    el('p', {class: 'lead'}, rating.line),
    strip,
    el('div', {class: 'night-cards'},
      card('worked', '✓ What worked', worked),
      card('lacking', '✗ What was lacking', lacking),
      card('better', '→ What would have done better', better)));
}
