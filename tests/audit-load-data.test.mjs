// Node and browser loader paths, including malformed data and useful failure messages.
// Browser globals are restored after each test; fetch is mocked and no network is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadGameData} from '../src/engine/loadData.mjs';
import {DATA_PATHS} from '../src/config.mjs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const data = read('../1-foundation/data/challenge.json');
const bank = read('../1-foundation/data/questions.json');

function browser(t, respond) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {value: {}, configurable: true});
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete globalThis.window;
  });
  t.mock.method(globalThis, 'fetch', respond);
}

function mockData(t, changedBank = bank, changedData = data) {
  browser(t, async path => ({ok: true, json: async () => structuredClone(path === DATA_PATHS.challenge ? changedData : changedBank)}));
}

test('audit/load: Node loads and validates the supplied files without fetch', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Node must read local files'); });
  assert.deepEqual(await loadGameData(), {data, bank});
});

test('audit/load: browser requests exactly the configured paths and returns the engine shape', async t => {
  const requested = [];
  browser(t, async path => {
    requested.push(path);
    return {ok: true, json: async () => structuredClone(path === DATA_PATHS.challenge ? data : bank)};
  });
  assert.deepEqual(await loadGameData(), {data, bank});
  assert.deepEqual(requested.sort(), [DATA_PATHS.challenge, DATA_PATHS.questions].sort());
});

test('audit/load: an HTTP failure names the failed file and preserves its cause', async t => {
  browser(t, async path => path === DATA_PATHS.questions
    ? {ok: false, status: 404}
    : {ok: true, json: async () => structuredClone(data)});
  await assert.rejects(loadGameData(), error => {
    assert.ok(error.message.includes(DATA_PATHS.questions));
    assert.match(error.message, /HTTP 404/);
    assert.match(error.cause.message, /HTTP 404/);
    return true;
  });
});

test('audit/load: invalid JSON produces a readable file-specific error', async t => {
  browser(t, async path => ({ok: true, json: async () => {
    if (path === DATA_PATHS.questions) throw new SyntaxError('bad JSON');
    return structuredClone(data);
  }}));
  await assert.rejects(loadGameData(), /Could not load .*questions\.json: bad JSON/);
});

test('audit/load: network failure produces a readable error with the original cause', async t => {
  browser(t, async () => { throw new Error('offline'); });
  await assert.rejects(loadGameData(), /Could not load .*offline/);
});

test('audit/load: an invalid challenge is rejected before it reaches the engine', async t => {
  mockData(t, bank, {...data, budget: -1});
  await assert.rejects(loadGameData(), /budget must be/);
});

for (const [label, mutate, message] of [
  ['empty bank', copy => { copy.questions = []; }, /non-empty questions/],
  ['missing question ID', copy => { copy.questions[0].id = ' '; }, /needs an ID/],
  ['duplicate question ID', copy => { copy.questions.push(structuredClone(copy.questions[0])); }, /appears twice/],
  ['missing question text', copy => { copy.questions[0].question = ' '; }, /question text/],
  ['missing option D', copy => { delete copy.questions[0].options.D; }, /options A, B, C and D/],
  ['invalid correct answer', copy => { copy.questions[0].correct = 'E'; }, /correct answer from A to D/],
  ['missing explanation', copy => { copy.questions[0].explanation = ''; }, /needs an explanation/],
  ['unknown phase mapping', copy => { copy.questions[0].phase_id = 'phase_99'; }, /unknown phase/],
]) {
  test(`audit/load: ${label} is rejected`, async t => {
    const modified = structuredClone(bank);
    mutate(modified);
    mockData(t, modified);
    await assert.rejects(loadGameData(), message);
  });
}
