/**
 * blueprint.mjs
 * --------------
 * Draws the building's floor plan as an SVG string:
 *   - the street outside, where the crew starts
 *   - one room per phase, leading left to right to the data vault
 *   - the crew's route moving forward one room each phase
 *   - in each room, a picture of what happened there (email, laptop, phone call, ransom message)
 *   - in each room, the three defence layers: ✓ if a chosen control scored there,
 *     ✗ if that layer was a gap
 *
 * Every state is shown with a symbol AND a word, never colour alone.
 * Returns a string so it is easy to test without a browser.
 */

import { LAYER_MARKERS, SCENE, phasePicture } from './artwork.mjs';
import { heistPhase, roleFor } from './heistNames.mjs';
import { chosenControlIds, currentPhaseIndex, phaseHeld, pointsFor, vaultIntegrity } from './vault.mjs';

const CATEGORIES = ['Prevent', 'Detect', 'Respond'];

// Layout (SVG units). The street, then five boxes in a row: four rooms and the vault.
const ROOM_WIDTH = 128;
const ROOM_HEIGHT = 150;
const GAP = 22;
const TOP = 40;
const LEFT = 64; // room for the street on the left
const CORRIDOR_Y = TOP + ROOM_HEIGHT / 2;
const WIDTH = LEFT + 5 * ROOM_WIDTH + 4 * GAP + 24;
const HEIGHT = TOP + ROOM_HEIGHT + 44;

/** Simple HTML/SVG escaping for any text that comes from data. */
function escape(text) {
  return String(text).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/** Left edge and centre of box i (0..4). */
function boxX(i) { return LEFT + i * (ROOM_WIDTH + GAP); }
function boxCentre(i) { return boxX(i) + ROOM_WIDTH / 2; }

/** An artwork image on a light round badge, so dark artwork stays visible on the blueprint. */
function badge(href, cx, cy, size) {
  if (!href) return '';
  const r = size / 2 + 4;
  return `<circle class="bp-badge" cx="${cx}" cy="${cy}" r="${r}" />`
    + `<image href="${escape(href)}" x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" />`;
}

/**
 * For phase n: which of the three layers had a chosen control that scored.
 * @returns {Array<{ category: string, covered: boolean }>}
 */
export function layerCoverage(data, state, n) {
  const chosen = chosenControlIds(state);
  return CATEGORIES.map(category => ({
    category,
    covered: data.controls.some(control =>
      control.category === category && chosen.includes(control.id) && pointsFor(data, n, control.id) > 0),
  }));
}

/** One room on the plan. status: 'held' | 'breached' | 'ahead' */
function roomSvg(data, state, n, status) {
  const x = boxX(n);
  const { room } = heistPhase(data.phases[n].id, n);
  const statusText = { held: '✓ HELD', breached: '✗ BREACHED', ahead: '? AHEAD' }[status];

  // Once the crew reaches a room, show what they used there. Until then, a plain room marker.
  const pictureHref = status === 'ahead' ? SCENE.room : phasePicture(n);
  const picture = badge(pictureHref, x + ROOM_WIDTH - 24, TOP + 26, 22);

  // The three layer marks, only for rooms the crew has reached.
  const layers = status === 'ahead' ? '' : layerCoverage(data, state, n).map((layer, i) => {
    const y = TOP + 92 + i * 18;
    const mark = layer.covered ? '✓' : '✗';
    return `<image href="${escape(LAYER_MARKERS[layer.category])}" x="${x + 10}" y="${y - 11}" width="14" height="14" />`
      + `<text class="bp-layer ${layer.covered ? 'is-covered' : 'is-gap'}" x="${x + 28}" y="${y}">`
      + `${mark} ${escape(roleFor(layer.category).role)}</text>`;
  }).join('');

  return `
    <g class="bp-room is-${status}">
      <rect x="${x}" y="${TOP}" width="${ROOM_WIDTH}" height="${ROOM_HEIGHT}" rx="4" />
      <text class="bp-room-name" x="${x + 12}" y="${TOP + 22}">${escape(room)}</text>
      <text class="bp-room-phase" x="${x + 12}" y="${TOP + 40}">Phase ${n + 1}</text>
      <text class="bp-status" x="${x + 12}" y="${TOP + 64}">${statusText}</text>
      ${picture}
      ${layers}
    </g>`;
}

/** The vault at the end of the corridor. */
function vaultSvg(integrity) {
  const x = boxX(4);
  return `
    <g class="bp-vault">
      <rect x="${x}" y="${TOP}" width="${ROOM_WIDTH}" height="${ROOM_HEIGHT}" rx="4" />
      <text class="bp-room-name" x="${x + 12}" y="${TOP + 22}">Data vault</text>
      ${badge(SCENE.vault, x + ROOM_WIDTH / 2, TOP + 70, 44)}
      <text class="bp-status" x="${x + 12}" y="${TOP + 130}">${integrity}% intact</text>
    </g>`;
}

/** The street where the crew starts. */
function outsideSvg() {
  return `
    <g class="bp-outside">
      ${badge(SCENE.outside, 28, CORRIDOR_Y, 26)}
      <text x="8" y="${CORRIDOR_Y + 34}">Street</text>
    </g>`;
}

/** The crew's dotted route from the street to the room they have reached. */
function routeSvg(n) {
  const endX = boxCentre(n);
  return `
    <line class="bp-corridor" x1="0" y1="${CORRIDOR_Y}" x2="${WIDTH}" y2="${CORRIDOR_Y}" />
    <path class="bp-route" d="M 28 ${CORRIDOR_Y} L ${endX} ${CORRIDOR_Y}" />
    <g class="bp-crew">
      ${badge(SCENE.crew, endX, TOP + ROOM_HEIGHT + 22, 18)}
      <text x="${endX + 18}" y="${TOP + ROOM_HEIGHT + 27}">Crew</text>
    </g>`;
}

/**
 * The full floor plan for phase n (defaults to the phase showing now).
 * @returns {string} an <svg> element as a string
 */
export function blueprintSvg(data, state, n = currentPhaseIndex(state)) {
  const rooms = data.phases.map((_, i) => {
    if (i > n) return roomSvg(data, state, i, 'ahead');
    return roomSvg(data, state, i, phaseHeld(data, state, i) ? 'held' : 'breached');
  }).join('');

  const integrity = vaultIntegrity(data, state, n);
  const { room } = heistPhase(data.phases[n].id, n);
  const summary = `Floor plan. The crew has reached the ${room}, room ${n + 1} of ${data.phases.length}. `
    + `The vault is ${integrity}% intact.`;

  return `
<svg class="bp" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="bp-title bp-desc"
     xmlns="http://www.w3.org/2000/svg">
  <title id="bp-title">Building blueprint</title>
  <desc id="bp-desc">${escape(summary)}</desc>
  <defs>
    <pattern id="bp-grid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" />
    </pattern>
  </defs>
  <rect class="bp-paper" width="${WIDTH}" height="${HEIGHT}" />
  <rect class="bp-gridlines" width="${WIDTH}" height="${HEIGHT}" fill="url(#bp-grid)" />
  ${routeSvg(n)}
  ${outsideSvg()}
  ${rooms}
  ${vaultSvg(integrity)}
</svg>`;
}

/** A small key under the blueprint explaining the map artwork. */
export function blueprintLegendHtml() {
  const item = (href, label) =>
    `<li><img class="heist-icon" src="${escape(href)}" alt="" width="20" height="20"> ${escape(label)}</li>`;
  return `
    <ul class="heist-legend" aria-label="Blueprint key">
      ${item(SCENE.outside, 'Street: where the crew starts')}
      ${item(SCENE.crew, 'Crew: their malicious device')}
      ${item(SCENE.room, 'Room: one per phase')}
      ${item(SCENE.vault, 'Data vault')}
      ${CATEGORIES.map(category => item(LAYER_MARKERS[category],
        `${roleFor(category).role} (${category})`)).join('')}
    </ul>`;
}
