// The data vault, drawn as a steel safe with a ship's-wheel lock.
// status: 'secure' (wheel spun shut, green light), 'damaged' (scratched, amber light)
// or 'breached' (door ajar, cracked, light spilling out). Decorative: the words around it
// always say the same thing, so it never relies on the picture alone.

const SVG = 'http://www.w3.org/2000/svg';
let uid = 0;

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

// The ship's wheel: rim, hub and eight spokes that run past the rim to round handles.
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

export function vaultSafe(status = 'secure', label = 'Data vault') {
  const id = ++uid;
  const bolts = [[30, 30], [170, 30], [30, 170], [170, 170]]
    .map(([cx, cy]) => svg('circle', {cx, cy, r: 5, class: 'bolt'}));
  const hinges = [52, 148].map(y => svg('rect', {x: 6, y: y - 12, width: 12, height: 24, rx: 3, class: 'hinge'}));
  const rivets = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    rivets.push(svg('circle', {cx: 100 + Math.cos(a) * 66, cy: 100 + Math.sin(a) * 66, r: 2.4, class: 'rivet'}));
  }
  const marks = status === 'breached'
    ? [svg('path', {d: 'M58 34 L72 62 L60 80 L78 108', class: 'safe-crack'}), svg('path', {d: 'M150 120 L132 138 L146 160', class: 'safe-crack'})]
    : status === 'damaged' ? [svg('path', {d: 'M140 46 L154 60 M146 42 L160 56', class: 'safe-scratch'})] : [];

  return svg('svg', {viewBox: '0 0 200 200', class: `safe is-${status}`, role: 'img', 'aria-label': `${label}: ${status}`},
    svg('defs', {},
      svg('linearGradient', {id: `steel-${id}`, x1: 0, y1: 0, x2: 1, y2: 1},
        svg('stop', {offset: '0%', 'stop-color': '#6f7d76'}), svg('stop', {offset: '55%', 'stop-color': '#3a4842'}), svg('stop', {offset: '100%', 'stop-color': '#26332d'})),
      svg('radialGradient', {id: `hub-${id}`},
        svg('stop', {offset: '0%', 'stop-color': '#ffe2a0'}), svg('stop', {offset: '100%', 'stop-color': '#b9822a'}))),
    svg('rect', {x: 2, y: 2, width: 196, height: 196, rx: 18, class: 'safe-body', fill: `url(#steel-${id})`}),
    svg('g', {class: 'safe-door'},
      svg('rect', {x: 18, y: 18, width: 164, height: 164, rx: 12, class: 'door-face', fill: `url(#steel-${id})`}),
      svg('circle', {cx: 100, cy: 100, r: 72, class: 'door-ring', fill: 'none'}),
      ...rivets, ...bolts, ...marks,
      wheel(id),
      svg('circle', {cx: 160, cy: 40, r: 6, class: 'safe-light'})),
    ...hinges);
}
