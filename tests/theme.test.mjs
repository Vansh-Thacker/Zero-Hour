/**
 * Tests for the heist theme (src/theme/).
 * One behaviour per test. Each test builds the data it needs.
 * The last test also checks the real challenge.json from the pack.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { heistLabel, hasOwnHeistName, heistPhase } from '../src/theme/heistNames.mjs';
import { vaultIntegrity, heistOutcome, FOILED_THRESHOLD } from '../src/theme/vault.mjs';
import { architectMessages } from '../src/theme/architect.mjs';
import { heistClock } from '../src/theme/clock.mjs';
import { buildThemeHtml } from '../src/theme/theme.mjs';

// ---------------------------------------------------------------------------
// Test data: a small scenario in the same shape as challenge.json
// ---------------------------------------------------------------------------

function makeData() {
  return {
    controls: [
      { id: 'P1', name: 'Training & Awareness', category: 'Prevent', cost: 400000 },
      { id: 'P2', name: 'Email Security', category: 'Prevent', cost: 600000 },
      { id: 'D1', name: 'SIEM', category: 'Detect', cost: 700000 },
      { id: 'D2', name: 'Endpoint Detection & Response (EDR)', category: 'Detect', cost: 500000 },
      { id: 'R1', name: 'Incident Response Team (24 x 7)', category: 'Respond', cost: 800000 },
      { id: 'R2', name: 'Incident Response Plan', category: 'Respond', cost: 100000 },
    ],
    already_in_place: [{ id: 'X1', name: 'Firewall' }],
    phases: [
      { id: 'phase_1', title: 'Delivery', local_time: 'Monday 16:40', scores: { P1: 3, P2: 2, D1: 3, D2: 2, R1: 3, R2: 2 } },
      { id: 'phase_2', title: 'Discovery', local_time: 'Tuesday 02:00', scores: { P1: 0, P2: 0, D1: 2, D2: 3, R1: 3, R2: 2 } },
      { id: 'phase_3', title: 'Command and control', local_time: 'Tuesday 03:30', scores: { P1: 1, P2: 0, D1: 1, D2: 3, R1: 3, R2: 2 } },
      { id: 'phase_4', title: 'Encryption', local_time: 'Tuesday 06:30', scores: { P1: 0, P2: 0, D1: 1, D2: 2, R1: 3, R2: 1 } },
    ],
  };
}

const everyControl = ['P1', 'P2', 'D1', 'D2', 'R1', 'R2'];
const cheapestValidChoice = ['P1', 'D2', 'R2']; // one of each category, lowest cost
const lastPhase = state => ({ ...state, phaseIndex: 3 });

/** Freezes an object and everything inside it, so any change would throw. */
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// heistNames.mjs
// ---------------------------------------------------------------------------

test('every control label includes its real name', () => {
  for (const control of makeData().controls) {
    assert.ok(heistLabel(control).includes(control.name), heistLabel(control));
  }
});

test('every control in the test data has its own heist name', () => {
  for (const control of makeData().controls) {
    assert.ok(hasOwnHeistName(control), `${control.name} has no heist name`);
  }
});

test('phase IDs map to the four heist stages', () => {
  assert.equal(heistPhase('phase_1', 0).title, 'The Way In');
  assert.equal(heistPhase('phase_4', 3).title, 'Lockdown');
});

// ---------------------------------------------------------------------------
// vault.mjs
// ---------------------------------------------------------------------------

test('vault integrity stays between 0 and 100 for every phase', () => {
  const data = makeData();
  for (const chosen of [[], cheapestValidChoice, everyControl]) {
    for (let n = 0; n < 4; n++) {
      const integrity = vaultIntegrity(data, { chosen, phaseIndex: n });
      assert.ok(integrity >= 0 && integrity <= 100, `got ${integrity}`);
    }
  }
});

test('a perfect choice keeps the vault at 100', () => {
  assert.equal(vaultIntegrity(makeData(), lastPhase({ chosen: everyControl })), 100);
});

test('the cheapest valid choice leaves the vault below 100', () => {
  assert.ok(vaultIntegrity(makeData(), lastPhase({ chosen: cheapestValidChoice })) < 100);
});

test('the engine result is used for phase scores when it is there', () => {
  const state = { chosen: [], phaseIndex: 0, result: { phases: [{ score: 15 }] } };
  assert.equal(vaultIntegrity(makeData(), state), 100); // 15 of 15 possible in phase 1
});

test('the heist outcome is the same for the same choices and gives a reason', () => {
  const data = makeData();
  const first = heistOutcome(data, { chosen: cheapestValidChoice });
  const second = heistOutcome(data, { chosen: cheapestValidChoice });
  assert.deepEqual(first, second);
  assert.ok(first.reason.length > 0);
});

test('the heist is foiled at or above the threshold and escaped below it', () => {
  const data = makeData();
  const strong = heistOutcome(data, { chosen: everyControl });
  const weak = heistOutcome(data, { chosen: [] });
  assert.equal(strong.result, 'foiled');
  assert.ok(strong.integrity >= FOILED_THRESHOLD);
  assert.equal(weak.result, 'escaped');
});

// ---------------------------------------------------------------------------
// architect.mjs
// ---------------------------------------------------------------------------

test('a Detect control is never said to have blocked or stopped the crew', () => {
  const data = makeData();
  for (let n = 0; n < 4; n++) {
    const lines = architectMessages(data, { chosen: everyControl, phaseIndex: n });
    for (const line of lines.filter(l => l.category === 'Detect')) {
      assert.doesNotMatch(line.text, /blocked|stopped/i, line.text);
    }
  }
});

test('the Architect names a gap the team left', () => {
  const lines = architectMessages(makeData(), { chosen: ['P1', 'D2', 'R2'], phaseIndex: 0 });
  assert.ok(lines.some(line => line.kind === 'gap' && line.text.includes('SIEM')));
});

test('the Architect always ends with a summary line', () => {
  const lines = architectMessages(makeData(), { chosen: [], phaseIndex: 0 });
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
  const state = deepFreeze({ chosen: cheapestValidChoice, phaseIndex: 2 });
  assert.doesNotThrow(() => {
    buildThemeHtml(state, data, { showOutcome: true });
    architectMessages(data, state);
    heistOutcome(data, state);
  });
});

test('the theme shows real control names next to heist names', () => {
  const html = buildThemeHtml({ chosen: ['P2', 'D1', 'R1'], phaseIndex: 0 }, makeData());
  assert.ok(html.includes('Mailroom scanner (Email Security)'));
});

test('text from the data is escaped in the theme', () => {
  const data = makeData();
  data.controls[0].name = 'Training <script>';
  const html = buildThemeHtml({ chosen: ['P1', 'D1', 'R1'], phaseIndex: 0 }, data);
  assert.ok(!html.includes('<script>'));
});

// ---------------------------------------------------------------------------
// Real data from the pack
// ---------------------------------------------------------------------------

test('every real control in challenge.json has its own heist name', async t => {
  let data;
  try {
    data = JSON.parse(await readFile(new URL('../1-foundation/data/challenge.json', import.meta.url), 'utf8'));
  } catch {
    return t.skip('challenge.json not found');
  }
  const missing = data.controls.filter(control => !hasOwnHeistName(control)).map(c => c.name);
  assert.deepEqual(missing, [], `Add these to CONTROL_NAME_RULES in heistNames.mjs: ${missing.join(', ')}`);
});
