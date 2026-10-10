// The battle display on the reveal screen: the crew's attacks fly at your defence wall.
// Attacks your controls or your people held back burst against the wall; the rest slip through
// to the vault. A weak wall shows cracks, and a weak phase opens a warning that explains why.
// The wall's People row is how securely the team answered at the previous checkpoint, so a
// question answer visibly changes the next phase. It is a picture, never a separate score.

import {el} from './dom.mjs';
import {defenceStrength} from './defenceStrength.mjs';
import {vaultSafe} from './vaultSafe.mjs';

const VAULT_STATUS = {strong: 'secure', holding: 'damaged', weak: 'breached'};

// Sparks and a ring that burst out when an attack is stopped at the wall.
function burst() {
  return el('span', {class: 'burst', 'aria-hidden': 'true'},
    el('span', {class: 'burst-ring'}),
    Array.from({length: 8}, (_, k) => el('span', {class: 'spark', style: `--a:${k * 45}deg`})));
}

const LEVEL_TEXT = {
  strong: {mark: '▲', word: 'Strong', line: 'Your wall held.'},
  holding: {mark: '◆', word: 'Holding', line: 'Your wall cracked, but mostly held.'},
  weak: {mark: '✖', word: 'Weak', line: 'Your wall is badly cracked.'},
};

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...children) => {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
};

// A small virus: a body with spikes. Decorative, so hidden from screen readers.
function virusIcon() {
  const spikes = Array.from({length: 8}, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return svg('line', {x1: 12 + Math.cos(a) * 6, y1: 12 + Math.sin(a) * 6, x2: 12 + Math.cos(a) * 10, y2: 12 + Math.sin(a) * 10});
  });
  return svg('svg', {viewBox: '0 0 24 24', class: 'virus', 'aria-hidden': 'true', focusable: 'false'},
    ...spikes, svg('circle', {cx: 12, cy: 12, r: 6.5}), svg('circle', {cx: 10, cy: 10.5, r: 1.6, class: 'spot'}));
}

// Cracks drawn over the wall. More and deeper cracks the weaker the phase.
function cracks(level) {
  const paths = {
    strong: [],
    holding: ['M30 8 L22 30 L34 46 L26 70', 'M60 120 L52 138 L62 152'],
    weak: ['M30 8 L22 30 L34 46 L20 70 L32 92 L24 120', 'M58 40 L44 58 L56 76 L40 98',
      'M50 120 L36 136 L48 150 L38 168', 'M10 150 L26 160 L18 176'],
  }[level];
  return svg('svg', {viewBox: '0 0 70 180', preserveAspectRatio: 'none', class: 'cracks', 'aria-hidden': 'true'},
    ...paths.map((d, i) => svg('path', {d, style: `--c:${i}`})));
}

// Which attacks get through is spread across the wave, so it reads as a battle, not a queue.
function fates(result) {
  const out = [];
  const spread = (i, k, total) => Math.floor((i + 1) * k / total) > Math.floor(i * k / total);
  for (let i = 0; i < result.attacks; i++) out.push(spread(i, result.through, result.attacks) ? 'through' : 'held');
  // Of the attacks held back, spread the ones the people stopped among those the controls stopped.
  const heldAt = out.map((fate, i) => fate === 'held' ? i : -1).filter(i => i >= 0);
  heldAt.forEach((i, j) => { if (spread(j, result.heldByPeople, heldAt.length)) out[i] = 'people'; });
  return out;
}

// The fourth row of the wall: the team's behaviour at the previous checkpoint.
function peopleRow(result) {
  const {tested, percent} = result.people;
  const label = !tested ? '○ People'
    : `${result.heldByPeople > 0 ? '✓' : '✗'} People · ${percent}%`;
  return el('div', {class: `wall-row wall-people${tested && result.heldByPeople > 0 ? ' is-on' : ''}`, 'data-cat': 'People'},
    el('span', {class: 'wall-label'}, label));
}

function peopleLine(result, n) {
  if (!result.people.tested) return 'Your people are tested at the first checkpoint. Secure answers there patch this wall in phase 2.';
  if (result.heldByPeople > 0) return `Your secure answers at checkpoint ${n} stopped ${result.heldByPeople} more.`;
  return `Your people stopped none: no secure answers at checkpoint ${n} to patch the wall.`;
}

export function battleDisplay(state, data) {
  const n = state.phase;
  const result = defenceStrength(data, state, n);
  const text = LEVEL_TEXT[result.level];
  const summary = `${text.line} ${result.held} of ${result.attacks} attacks held back: `
    + `${result.heldByControls} by your controls and ${result.heldByPeople} by your people. `
    + `Your controls scored ${result.score} of the ${result.best} points the best £3m plan could get in this phase.`;

  const attacks = fates(result).map((fate, i) => el('span', {
    class: `attack is-${fate === 'through' ? 'through' : 'held'}${fate === 'people' ? ' by-people' : ''}`,
    style: `--i:${i}; --y:${8 + ((i * 37) % 80)}%`,
  }, virusIcon(), fate === 'through' ? null : burst()));

  const wall = el('div', {class: 'wall'},
    result.layers.map(layer => el('div', {class: `wall-row${layer.points > 0 ? ' is-on' : ''}`, 'data-cat': layer.category},
      el('span', {class: 'wall-label'}, `${layer.points > 0 ? '✓' : '✗'} ${layer.category}`))),
    peopleRow(result),
    cracks(result.level));

  const panel = el('section', {class: `battle is-${result.level}`, 'aria-label': 'How your defences held'},
    el('div', {class: 'battle-field', role: 'img', 'aria-label': summary},
      el('div', {class: 'battle-crew'}, el('span', {}, 'The crew')),
      el('div', {class: 'battle-lane'}, attacks),
      wall,
      el('div', {class: 'battle-vault'}, vaultSafe(VAULT_STATUS[result.level], 'Vault this phase'), el('span', {}, 'Vault'))),
    el('div', {class: 'battle-caption'},
      el('span', {class: 'level-chip'}, `${text.mark} ${text.word} · ${result.wallPercent}%`),
      el('span', {}, `${result.held} of ${result.attacks} attacks held back`),
      el('span', {class: 'battle-split'},
        el('span', {class: 'by-controls'}, `${result.heldByControls} by controls`), ' + ',
        el('span', {class: 'by-people'}, `${result.heldByPeople} by people`)),
      el('span', {class: 'battle-note'}, `Controls: ${result.score} of ${result.best} possible points this phase`)),
    el('p', {class: 'battle-people'}, peopleLine(result, n)));

  if (result.level === 'weak') panel.append(weakWarning(result, n, n === data.phases.length - 1));
  return panel;
}

// --- The pop-up for a weak phase. Shown once per phase per game. ---

const warned = new WeakMap();   // state.result -> Set of phases already warned about

function weakWarning(result, n, last) {
  const missingLayers = result.layers.filter(layer => layer.points === 0).map(layer => layer.category);
  const close = () => dialog.close();
  const dialog = el('dialog', {class: 'weak-alert', 'aria-labelledby': 'weak-title'},
    el('h2', {id: 'weak-title'}, '⚠ Your defences are weak'),
    el('p', {}, `In this phase your controls scored ${result.score} of a possible ${result.best} points, `
      + `so ${result.through} of ${result.attacks} attacks got through the cracks.`),
    missingLayers.length
      ? el('p', {}, el('strong', {}, 'Gaps: '), `none of your ${missingLayers.join(' or ')} controls helped here.`)
      : null,
    result.people.tested && result.heldByPeople === 0
      ? el('p', {}, el('strong', {}, 'People: '), 'no secure answers at the last checkpoint, so nobody patched the wall.')
      : null,
    result.missed
      ? el('p', {}, el('strong', {}, 'Would have helped: '),
        `${result.missed.name} (${result.missed.category}, +${result.missed.points}). ${result.missed.useCase}`)
      : null,
    el('p', {class: 'weak-note'}, last
      ? 'This was the last phase. Your plan and your answers both count in the debrief.'
      : 'Your plan is locked for tonight, but your people can still help: '
        + 'secure answers at the next checkpoint patch the wall for the next phase.'),
    el('div', {class: 'actions'}, el('button', {class: 'btn btn-primary', type: 'button', onclick: close}, 'Got it')));
  dialog.dataset.phase = String(n);
  return dialog;
}

// Called after the reveal screen is on the page: opens the warning once the attacks have
// landed, unless it has already been seen for this phase of this game. A new game makes a
// new state.result, so its warnings show again.
export function openWeakWarning(root, state) {
  const dialog = root.querySelector('dialog.weak-alert');
  if (!dialog || !state.result) return;
  const seen = warned.get(state.result) ?? new Set();
  if (seen.has(state.phase)) return;
  seen.add(state.phase);
  warned.set(state.result, seen);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => { if (dialog.isConnected && !dialog.open) dialog.showModal(); }, reduce ? 0 : 2600);
}
