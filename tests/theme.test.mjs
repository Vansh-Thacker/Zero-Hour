/**
 * Tests for the heist theme (src/theme/).
 * One behaviour per test. Each test builds the data it needs.
 * The tests at the end also check the real challenge.json and artwork from the pack.
 *
 * Game state uses the engine's names: { selected, phase }.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

import { heistLabel, heistName, hasOwnHeistName, heistPhase } from '../src/theme/heistNames.mjs';
import {
  FOILED_THRESHOLD, bestAffordableChoice, chosenControlIds, currentPhaseIndex,
  heistOutcome, vaultIntegrity,
} from '../src/theme/vault.mjs';
import { architectMessages } from '../src/theme/architect.mjs';
import { heistClock } from '../src/theme/clock.mjs';
import { buildThemeHtml } from '../src/theme/theme.mjs';
import { allArtworkPaths, controlIcon } from '../src/theme/artwork.mjs';

// ---------------------------------------------------------------------------
// Test data: a small scenario in the same shape as challenge.json
// ---------------------------------------------------------------------------

function makeData() {
  return {
    controls: [
      { id: 'P5', name: 'Training and awareness', category: 'Prevent', cost: 400000 },
      { id: 'P6', name: 'Email security', category: 'Prevent', cost: 600000 },
      { id: 'D1', name: 'SIEM', category: 'Detect', cost: 700000 },
      { id: 'D2', name: 'Intrusion detection and prevention', category: 'Detect', cost: 500000 },
      { id: 'R2', name: 'Incident response team (24/7)', category: 'Respond', cost: 800000 },
      { id: 'R1', name: 'Incident response plan', category: 'Respond', cost: 100000 },
    ],
    already_in_place: [{ id: 'X1', name: 'Firewall and DDoS protection' }],
    phases: [
      { id: 'phase_1', title: 'Delivery', local_time: 'Monday 16:40', scores: { P5: 3, P6: 2, D1: 3, D2: 2, R2: 3, R1: 2 } },
      { id: 'phase_2', title: 'Discovery', local_time: 'Tuesday 02:00', scores: { P5: 0, P6: 0, D1: 2, D2: 3, R2: 3, R1: 2 } },
      { id: 'phase_3', title: 'Command and control', local_time: 'Tuesday 03:30', scores: { P5: 1, P6: 0, D1: 1, D2: 3, R2: 3, R1: 2 } },
      { id: 'phase_4', title: 'Encryption', local_time: 'Tuesday 06:30', scores: { P5: 0, P6: 0, D1: 1, D2: 2, R2: 3, R1: 1 } },
    ],
  };
}

// The 18 controls players can choose in the real game (from the pack's icon names).
const REAL_CONTROLS = [
  ['P1', 'Endpoint protection', 'Prevent'], ['P2', 'Network segmentation', 'Prevent'],
  ['P3', 'Patching and updates', 'Prevent'], ['P4', 'Secure by design', 'Prevent'],
  ['P5', 'Training and awareness', 'Prevent'], ['P6', 'Email security', 'Prevent'],
  ['P7', 'Multi-factor authentication', 'Prevent'],
  ['D1', 'SIEM', 'Detect'], ['D2', 'Intrusion detection and prevention', 'Detect'],
  ['D3', 'Threat hunting and honeypots', 'Detect'], ['D4', 'Managed detection and response', 'Detect'],
  ['D5', 'Network behaviour analysis', 'Detect'],
  ['R1', 'Incident response plan', 'Respond'], ['R2', 'Incident response team (24/7)', 'Respond'],
  ['R3', 'Incident response team (office hours)', 'Respond'], ['R4', 'Backup restores', 'Respond'],
  ['R5', 'Digital forensics', 'Respond'], ['R6', 'Incident response retainer', 'Respond'],
].map(([id, name, category]) => ({ id, name, category }));

// The cost of all six is £3.1m, so the best affordable choice must leave one out.
const everyControl = ['P5', 'P6', 'D1', 'D2', 'R2', 'R1'];
const cheapestValidChoice = ['P5', 'D2', 'R1']; // one of each category, lowest cost
const atPhase = (selected, phase) => ({ selected, phase });

/** Freezes an object and everything inside it, so any change would throw. */
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** The real challenge.json from the pack, or null if it is not next to the tests. */
async function loadRealData() {
  try {
    return JSON.parse(await readFile(new URL('../1-foundation/data/challenge.json', import.meta.url), 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// heistNames.mjs
// ---------------------------------------------------------------------------

test('every control label includes its real name', () => {
  for (const control of REAL_CONTROLS) {
    assert.ok(heistLabel(control).includes(control.name), heistLabel(control));
  }
});

test('all 18 real controls have their own heist name', () => {
  const missing = REAL_CONTROLS.filter(control => !hasOwnHeistName(control)).map(c => c.name);
  assert.deepEqual(missing, []);
});

test('all 18 heist names are different', () => {
  const names = REAL_CONTROLS.map(heistName);
  const repeated = names.filter((name, i) => names.indexOf(name) !== i);
  assert.deepEqual(repeated, []);
});

test('phase IDs map to the four heist stages', () => {
  assert.equal(heistPhase('phase_1', 0).title, 'The Way In');
  assert.equal(heistPhase('phase_4', 3).title, 'Lockdown');
});

// ---------------------------------------------------------------------------
// vault.mjs: reading the engine's state
// ---------------------------------------------------------------------------

test('the theme reads the engine state names selected and phase', () => {
  const state = { selected: ['P5', 'D1'], phase: 2 };
  assert.deepEqual(chosenControlIds(state), ['P5', 'D1']);
  assert.equal(currentPhaseIndex(state), 2);
});

// ---------------------------------------------------------------------------
// vault.mjs: the best affordable choice and vault integrity
// ---------------------------------------------------------------------------

test('the best affordable choice fits the budget and covers all three categories', () => {
  const data = makeData();
  const best = bestAffordableChoice(data);
  assert.ok(best.cost <= 3_000_000, `cost ${best.cost}`);
  const categories = new Set(best.ids.map(id => data.controls.find(c => c.id === id).category));
  assert.deepEqual([...categories].sort(), ['Detect', 'Prevent', 'Respond']);
});

test('the best affordable choice leaves out the control worth least for its cost', () => {
  // All six cost £3.1m. Dropping email security (£0.6m, 2 points) loses the fewest points.
  const best = bestAffordableChoice(makeData());
  assert.deepEqual([...best.ids].sort(), ['D1', 'D2', 'P5', 'R1', 'R2']);
  assert.equal(best.total, 40);
});

test('vault integrity stays between 0 and 100 for every phase', () => {
  const data = makeData();
  for (const selected of [[], cheapestValidChoice, everyControl]) {
    for (let phase = 0; phase < 4; phase++) {
      const integrity = vaultIntegrity(data, atPhase(selected, phase));
      assert.ok(integrity >= 0 && integrity <= 100, `got ${integrity}`);
    }
  }
});

test('matching the best affordable choice keeps the vault at 100', () => {
  const data = makeData();
  assert.equal(vaultIntegrity(data, atPhase(bestAffordableChoice(data).ids, 3)), 100);
});

test('the cheapest valid choice leaves the vault below 100', () => {
  assert.ok(vaultIntegrity(makeData(), atPhase(cheapestValidChoice, 3)) < 100);
});

test('the heist outcome is the same for the same choices and gives a reason', () => {
  const data = makeData();
  const first = heistOutcome(data, atPhase(cheapestValidChoice, 3));
  const second = heistOutcome(data, atPhase(cheapestValidChoice, 3));
  assert.deepEqual(first, second);
  assert.match(first.reason, /of the 40 points the best £3m choice could earn/);
});

test('the heist is foiled at or above the threshold and escaped below it', () => {
  const data = makeData();
  const strong = heistOutcome(data, atPhase(bestAffordableChoice(data).ids, 3));
  const weak = heistOutcome(data, atPhase([], 3));
  assert.equal(strong.result, 'foiled');
  assert.ok(strong.integrity >= FOILED_THRESHOLD);
  assert.equal(weak.result, 'escaped');
});

// ---------------------------------------------------------------------------
// architect.mjs
// ---------------------------------------------------------------------------

test('a Detect control is never said to have blocked or stopped the crew', () => {
  const data = makeData();
  for (let phase = 0; phase < 4; phase++) {
    const lines = architectMessages(data, atPhase(everyControl, phase));
    for (const line of lines.filter(l => l.category === 'Detect')) {
      assert.doesNotMatch(line.text, /blocked|stopped/i, line.text);
    }
  }
});

test('the Architect names the best control for a layer the team left empty', () => {
  const lines = architectMessages(makeData(), atPhase(['P6', 'R1'], 0)); // no Detect at all
  const gap = lines.find(line => line.kind === 'gap' && line.category === 'Detect');
  assert.match(gap.text, /Nobody was watching/);
  assert.match(gap.text, /SIEM/);
});

test('the Architect never says "nobody was watching" after a Detect control scored', () => {
  const lines = architectMessages(makeData(), atPhase(['P5', 'D2', 'R1'], 0)); // D2 scores 2 here
  assert.ok(lines.some(line => line.kind === 'defence' && line.category === 'Detect'));
  assert.ok(!lines.some(line => line.kind === 'gap' && line.category === 'Detect'));
});

test('backups and forensics are said to help you recover, not to contain the crew', () => {
  const data = makeData();
  data.controls.push({ id: 'R4', name: 'Backup restores', category: 'Respond', cost: 300000 });
  data.phases[3].scores.R4 = 3;
  const lines = architectMessages(data, atPhase(['R4'], 3));
  const line = lines.find(l => l.text.includes('Backup restores'));
  assert.match(line.text, /recovered/);
  assert.doesNotMatch(line.text, /contained/);
});

test('the Architect always ends with a summary line', () => {
  const lines = architectMessages(makeData(), atPhase([], 0));
  assert.equal(lines.at(-1).kind, 'summary');
});

// ---------------------------------------------------------------------------
// clock.mjs
// ---------------------------------------------------------------------------

test('the heist clock runs from 0 at the first phase to 1 at the last', () => {
  const data = makeData();
  assert.equal(heistClock(data, 0).progress, 0);
  assert.equal(heistClock(data, 3).progress, 1);
  assert.equal(heistClock(data, 1).label, 'Tuesday 02:00');
});

test('the clock places 02:00 most of the way through the night', () => {
  // 16:40 to 06:30 is 830 minutes; 16:40 to 02:00 is 560 minutes.
  assert.equal(heistClock(makeData(), 1).progress.toFixed(3), (560 / 830).toFixed(3));
});

// ---------------------------------------------------------------------------
// theme.mjs
// ---------------------------------------------------------------------------

test('the theme never changes the game state or the data', () => {
  const data = deepFreeze(makeData());
  const state = deepFreeze(atPhase(cheapestValidChoice, 2));
  assert.doesNotThrow(() => {
    buildThemeHtml(state, data, { showOutcome: true });
    architectMessages(data, state);
    heistOutcome(data, state);
  });
});

test('the theme shows real control names next to heist names', () => {
  const html = buildThemeHtml(atPhase(['P6', 'D1', 'R2'], 0), makeData());
  assert.ok(html.includes('Mailroom scanner (Email security)'));
});

test('text from the data is escaped in the theme', () => {
  const data = makeData();
  data.controls[0].name = 'Training <script>';
  const html = buildThemeHtml(atPhase(['P5', 'D1', 'R2'], 0), data);
  assert.ok(!html.includes('<script>'));
});

// ---------------------------------------------------------------------------
// artwork.mjs
// ---------------------------------------------------------------------------

test('every control that can be chosen has an icon', () => {
  for (const control of REAL_CONTROLS) {
    assert.match(controlIcon(control), new RegExp(`icons/${control.id}_.+\\.svg$`), control.name);
  }
});

test('the controls already in place get their icons by name', () => {
  assert.match(controlIcon({ id: 'X1', name: 'Firewall and DDoS protection' }), /IP_firewall_and_ddos_protection\.svg$/);
  assert.match(controlIcon({ id: 'X2', name: 'Penetration testing' }), /IP_penetration_testing\.svg$/);
});

test('the theme shows the icon of each chosen control', () => {
  const html = buildThemeHtml(atPhase(['P6', 'D1', 'R2'], 0), makeData());
  assert.ok(html.includes('P6_email_security.svg'));
  assert.ok(html.includes('D1_siem.svg'));
});

test('every artwork file the theme uses exists in the pack', async t => {
  const packRoot = new URL('../', import.meta.url);
  try {
    await access(new URL('1-foundation/artwork', packRoot));
  } catch {
    return t.skip('pack artwork folder not found');
  }
  const missing = [];
  for (const path of allArtworkPaths()) {
    try { await access(new URL(path, packRoot)); } catch { missing.push(path); }
  }
  assert.deepEqual(missing, []);
});

// ---------------------------------------------------------------------------
// Real data from the pack
// ---------------------------------------------------------------------------

test('every real control in challenge.json has its own, different heist name', async t => {
  const data = await loadRealData();
  if (!data) return t.skip('challenge.json not found');

  const missing = data.controls.filter(control => !hasOwnHeistName(control)).map(c => c.name);
  assert.deepEqual(missing, [], `Add these to CONTROL_NAME_RULES in heistNames.mjs: ${missing.join(', ')}`);

  const names = data.controls.map(heistName);
  assert.deepEqual(names.filter((name, i) => names.indexOf(name) !== i), []);
});

test('the best £3m choice in the real scenario scores 54 points', async t => {
  const data = await loadRealData();
  if (!data) return t.skip('challenge.json not found');
  assert.equal(bestAffordableChoice(data).total, 54);
});
