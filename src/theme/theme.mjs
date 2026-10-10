/**
 * theme.mjs
 * ----------
 * Puts the heist theme together: blueprint, vault meter, heist clock,
 * this phase's defences and The Architect's messages.
 *
 * renderTheme() is the one function the host screen calls.
 * buildThemeHtml() does the real work and returns a string, so it can be
 * tested without a browser.
 *
 * The theme only reads `state` and `data`. Delete this folder and the game
 * still works: the rules and scores live in the engine, not here.
 */

import { HEIST_NAME, MASTERMIND, heistLabel, heistPhase, roleFor } from './heistNames.mjs';
import { architectMessages } from './architect.mjs';
import { blueprintSvg, layerCoverage } from './blueprint.mjs';
import { heistClock } from './clock.mjs';
import {
  chosenControlIds, currentPhaseIndex, heistOutcome, phaseScore,
  bestPossiblePhaseScore, pointsFor, vaultIntegrity,
} from './vault.mjs';

/** Escapes text from the data before it goes into HTML. */
function escape(text) {
  return String(text).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/** A word and icon for the vault meter, so it never relies on colour alone. */
function vaultStatus(integrity) {
  if (integrity >= 70) return { icon: '🛡️', word: 'Holding', level: 'good' };
  if (integrity >= 40) return { icon: '⚠️', word: 'Under pressure', level: 'warn' };
  return { icon: '🚨', word: 'Critical', level: 'bad' };
}

function headerHtml(data, n) {
  const { title } = heistPhase(data.phases[n].id, n);
  const clock = heistClock(data, n);
  const percentThroughNight = Math.round(clock.progress * 100);

  return `
    <header class="heist-header">
      <div>
        <p class="heist-eyebrow">${escape(HEIST_NAME)} · Phase ${n + 1} of ${data.phases.length}</p>
        <h2 class="heist-title">${escape(title)}</h2>
      </div>
      <div class="heist-clock" aria-label="Heist clock: ${escape(clock.label)}">
        <span class="heist-clock-time">⏱ ${escape(clock.label)}</span>
        <span class="heist-clock-bar" aria-hidden="true"><i style="width:${percentThroughNight}%"></i></span>
        <span class="heist-clock-note">${percentThroughNight}% through the night</span>
      </div>
    </header>`;
}

function vaultMeterHtml(data, state, n) {
  const integrity = vaultIntegrity(data, state, n);
  const status = vaultStatus(integrity);

  return `
    <div class="heist-vault is-${status.level}">
      <p class="heist-vault-label">
        Vault integrity: <strong>${integrity}%</strong> · ${status.icon} ${status.word}
      </p>
      <div class="heist-vault-meter" role="meter" aria-label="Vault integrity"
           aria-valuemin="0" aria-valuemax="100" aria-valuenow="${integrity}">
        <i style="width:${integrity}%"></i>
      </div>
    </div>`;
}

function defencesHtml(data, state, n) {
  const chosen = new Set(chosenControlIds(state));
  const scored = data.controls
    .filter(control => chosen.has(control.id))
    .map(control => ({ control, points: pointsFor(data, n, control.id) }))
    .sort((a, b) => b.points - a.points);

  const rows = scored.map(({ control, points }) => `
      <li class="${points > 0 ? 'is-lit' : 'is-dark'}">
        <span class="mark">${points > 0 ? '✓' : '–'}</span>
        <span>${escape(heistLabel(control))}</span>
        <span class="pts">${points} pts</span>
      </li>`).join('');

  const gaps = layerCoverage(data, state, n)
    .filter(layer => !layer.covered)
    .map(layer => {
      const { icon, role } = roleFor(layer.category);
      return `<li class="is-gap"><span class="mark">✗</span>
        <span>${icon} No ${escape(role)} defence (${escape(layer.category)}) worked in this room</span></li>`;
    }).join('');

  const score = phaseScore(data, state, n);
  const best = bestPossiblePhaseScore(data, n);

  return `
    <section class="heist-defences" aria-label="Your defences this phase">
      <h3>Your defences in this room · ${score} of ${best} possible points</h3>
      <ul>${rows}${gaps}</ul>
    </section>`;
}

function architectHtml(data, state, n) {
  const lines = architectMessages(data, state, n)
    .map(line => `<li class="is-${line.kind}">${escape(line.text)}</li>`)
    .join('');

  return `
    <section class="heist-architect" aria-live="polite" aria-label="Message from ${escape(MASTERMIND)}">
      <h3>📞 ${escape(MASTERMIND)}</h3>
      <ul>${lines}</ul>
    </section>`;
}

function outcomeHtml(data, state) {
  const outcome = heistOutcome(data, state);
  const heading = outcome.result === 'foiled' ? '✓ Heist foiled. The vault holds.' : '✗ The crew got away.';

  return `
    <section class="heist-outcome is-${outcome.result}" role="status">
      <h2>${heading}</h2>
      <p>${escape(outcome.reason)}</p>
    </section>`;
}

/**
 * The whole theme panel as an HTML string.
 * @param {object} state  the engine's game state (read only)
 * @param {object} data   the scenario from challenge.json (read only)
 * @param {{ showOutcome?: boolean }} options  showOutcome: true on the final screen
 */
export function buildThemeHtml(state, data, { showOutcome = false } = {}) {
  const n = currentPhaseIndex(state);

  return `
  <div class="heist">
    ${showOutcome ? outcomeHtml(data, state) : ''}
    ${headerHtml(data, n)}
    <div class="heist-blueprint">${blueprintSvg(data, state, n)}</div>
    ${vaultMeterHtml(data, state, n)}
    <div class="heist-columns">
      ${defencesHtml(data, state, n)}
      ${architectHtml(data, state, n)}
    </div>
  </div>`;
}

/**
 * Draws the theme into a page element. This is the function the host screen calls.
 * @param {HTMLElement} root
 */
export function renderTheme(root, state, data, options = {}) {
  root.innerHTML = buildThemeHtml(state, data, options);
}
