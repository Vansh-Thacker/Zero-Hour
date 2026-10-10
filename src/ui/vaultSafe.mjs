// The data vault, drawn as a steel safe with a ship's-wheel lock.
// status: 'secure' (wheel spun shut, green light), 'damaged' (amber light)
// or 'breached' (door ajar, light spilling out).
// damage: 0 to 1, the share of attacks that reached the vault. The more damage, the more marks:
// cracks across the door and the frame, then dents, scorch marks, a blown-off bolt and smoke.
// Decorative: the words around it always say the same thing, so it never relies on the picture.

const SVG = 'http://www.w3.org/2000/svg';
let uid = 0;

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children.filter(Boolean));
  return node;
}

// The ship's wheel: rim, hub and eight spokes that run past the rim to round handles.
// Cracks in the order they appear as damage grows: door, frame, then everywhere.
const CRACKS = [
  'M58 34 L72 62 L60 80 L78 108',
  'M150 120 L132 138 L146 160',
  'M4 70 L14 82 L8 96 L16 108',
  'M120 4 L126 14 L118 24 L124 34',
  'M170 60 L156 74 L166 92 L150 104',
  'M40 150 L56 140 L50 124 L66 112',
  'M196 128 L186 142 L192 156 L184 168',
  'M80 196 L88 186 L80 176 L92 166',
  'M100 26 L94 44 L106 58 L98 70',
  'M24 190 L36 178 L30 164 L44 154',
];
const DENTS = [[62, 150, 11, 7, -20], [150, 158, 9, 6, 15], [148, 42, 8, 5, 30]];
const SCORCH = [[66, 76, 26], [160, 98, 22]];

function damageMarks(id, damage) {
  const marks = [];
  if (damage > 0) {
    marks.push(svg('path', {d: 'M138 48 L152 62 M144 44 L158 58', class: 'safe-scratch'}));
  }
  if (damage > 0.5) {
    for (const [cx, cy, r] of SCORCH) marks.push(svg('circle', {cx, cy, r, class: 'safe-scorch', fill: `url(#scorch-${id})`}));
  }
  const dents = damage > 0.55 ? 3 : damage > 0.4 ? 2 : damage > 0.25 ? 1 : 0;
  for (const [cx, cy, rx, ry, rot] of DENTS.slice(0, dents)) {
    marks.push(svg('ellipse', {cx, cy, rx, ry, transform: `rotate(${rot} ${cx} ${cy})`, class: 'safe-dent'}));
  }
  const cracks = Math.min(CRACKS.length, Math.round(damage * CRACKS.length));
  CRACKS.slice(0, cracks).forEach((d, i) => marks.push(svg('path', {d, class: 'safe-crack', style: `--c:${i}`})));
  return marks;
}

function smoke() {
  return svg('g', {class: 'safe-smoke', 'aria-hidden': 'true'},
    ...[70, 100, 128].map((cx, i) => svg('circle', {cx, cy: 8, r: 9, style: `--s:${i}`})));
}

function wheel(id) {
  const spokes = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a), y = Math.sin(a);
    spokes.push(
      svg('line', {x1: 100 + x * 9, y1: 100 + y * 9, x2: 100 + x * 44, y2: 100 + y * 44, class: 'spoke'}),
      svg('circle', {cx: 100 + x * 47, cy: 100 + y * 47, r: 5.5, class: 'knob'}));
  }
  return svg('g', {class: 'safe-wheel'},
    ...spokes,
    svg('circle', {cx: 100, cy: 100, r: 32, class: 'rim', fill: 'none'}),
    svg('circle', {cx: 100, cy: 100, r: 13, class: 'hub', fill: `url(#hub-${id})`}),
    svg('circle', {cx: 100, cy: 100, r: 4, class: 'hub-pin'}));
}

const DEFAULT_DAMAGE = {secure: 0, damaged: 0.35, breached: 0.7};

export function vaultSafe(status = 'secure', label = 'Data vault', damage = DEFAULT_DAMAGE[status] ?? 0) {
  const id = ++uid;
  // Over 60% damage the top-right bolt is blown out, leaving an empty hole.
  const bolts = [[30, 30], [170, 30], [30, 170], [170, 170]]
    .map(([cx, cy], i) => i === 1 && damage > 0.6
      ? svg('circle', {cx, cy, r: 5, class: 'bolt-hole'})
      : svg('circle', {cx, cy, r: 5, class: 'bolt'}));
  const hinges = [52, 148].map(y => svg('rect', {x: 6, y: y - 12, width: 12, height: 24, rx: 3, class: 'hinge'}));
  const rivets = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    rivets.push(svg('circle', {cx: 100 + Math.cos(a) * 66, cy: 100 + Math.sin(a) * 66, r: 2.4, class: 'rivet'}));
  }
  const percent = Math.round(damage * 100);

  return svg('svg', {viewBox: '0 0 200 200', class: `safe is-${status}`, role: 'img', 'aria-label': `${label}: ${status}, ${percent}% damaged`},
    svg('defs', {},
      svg('linearGradient', {id: `steel-${id}`, x1: 0, y1: 0, x2: 1, y2: 1},
        svg('stop', {offset: '0%', 'stop-color': '#6f7d76'}), svg('stop', {offset: '55%', 'stop-color': '#3a4842'}), svg('stop', {offset: '100%', 'stop-color': '#26332d'})),
      svg('radialGradient', {id: `hub-${id}`},
        svg('stop', {offset: '0%', 'stop-color': '#ffe2a0'}), svg('stop', {offset: '100%', 'stop-color': '#b9822a'})),
      svg('radialGradient', {id: `scorch-${id}`},
        svg('stop', {offset: '0%', 'stop-color': '#0b0f0d', 'stop-opacity': '0.85'}), svg('stop', {offset: '100%', 'stop-color': '#0b0f0d', 'stop-opacity': '0'}))),
    damage > 0.75 ? smoke() : null,
    svg('rect', {x: 2, y: 2, width: 196, height: 196, rx: 18, class: 'safe-body', fill: `url(#steel-${id})`}),
    svg('g', {class: 'safe-door'},
      svg('rect', {x: 18, y: 18, width: 164, height: 164, rx: 12, class: 'door-face', fill: `url(#steel-${id})`}),
      svg('circle', {cx: 100, cy: 100, r: 72, class: 'door-ring', fill: 'none'}),
      ...rivets, ...bolts, ...damageMarks(id, damage),
      wheel(id),
      svg('circle', {cx: 160, cy: 40, r: 6, class: 'safe-light'})),
    ...hinges);
}
