// Unit tests for view functions. The small DOM recorder below tests generated text,
// attributes and callbacks only; browser layout, focus and accessibility need browser QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {el, img, money, points, budgetSummary, runsGame, picksFor, answersQuestions, seatId} from '../src/ui/dom.mjs';
import {checkpointScreen, updateTimer} from '../src/ui/checkpointScreen.mjs';
import {chooseScreen} from '../src/ui/chooseScreen.mjs';
import {storyScreen} from '../src/ui/storyScreen.mjs';
import {revealScreen} from '../src/ui/revealScreen.mjs';
import {outcomeScreen} from '../src/ui/outcomeScreen.mjs';
import {debriefBlocks} from '../src/debrief/debriefPdf.mjs';
import {roomBar} from '../src/ui/roomBar.mjs';
import {nameProblem, homeScreen, joinScreen, nameScreen, hostStartScreen} from '../src/ui/startScreens.mjs';
import {LOGO, SCENE, PHASE_ART, controlRender} from '../src/ui/assets.mjs';
import {nightSummary} from '../src/ui/nightSummary.mjs';
import {vaultSafe} from '../src/ui/vaultSafe.mjs';
import {scoreSelection} from '../1-foundation/starter/controls.mjs';
import {CHECKPOINT_SECONDS, POINTS_PER_SECURE_ANSWER} from '../src/config.mjs';

class RecordedNode {
  constructor(tag, text = '') {
    this.tag = tag; this.children = []; this.attributes = {}; this.events = {}; this.dataset = {}; this._text = text;
    this.style = {cssText: '', setProperty: (key, value) => {this.style[key] = value;}};
    this.className = '';
    this.classList = {toggle: (name, force) => {
      const names = new Set(this.className.split(/\s+/).filter(Boolean));
      if (force) names.add(name); else names.delete(name);
      this.className = [...names].join(' ');
    }};
  }
  append(...children) { this.children.push(...children.map(c => c instanceof RecordedNode ? c : new RecordedNode('#text', String(c)))); }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key === 'class') this.className = String(value);
    if (key === 'value') this.value = String(value);
    if (key.startsWith('data-')) this.dataset[key.slice(5)] = String(value);
  }
  addEventListener(key, value) {this.events[key] = value;}
  get firstChild() {return this.children[0];}
  get textContent() {return this._text + this.children.map(c => c.textContent).join('');}
  set textContent(value) {this._text = String(value); this.children = [];}
}

test.before(() => {
  globalThis.Node = RecordedNode;
  globalThis.document = {
    createElement: tag => new RecordedNode(tag),
    createElementNS: (_, tag) => new RecordedNode(tag),
    createTextNode: value => new RecordedNode('#text', String(value)),
  };
});
test.after(() => {delete globalThis.Node; delete globalThis.document;});

const walk = value => (Array.isArray(value) ? value : [value]).filter(Boolean).flatMap(n => [n, ...walk(n.children ?? [])]);
const find = (tree, pred) => walk(tree).filter(pred);
const keyed = (tree, key) => find(tree, n => n.attributes?.['data-key'] === key)[0];
const text = tree => (Array.isArray(tree) ? tree.filter(Boolean) : [tree]).map(n => n.textContent).join('');
const hasClass = (n, cls) => n.className.split(/\s+/).includes(cls);
const load = file => JSON.parse(readFileSync(new URL(file, import.meta.url)));
const data = load('../1-foundation/data/challenge.json');
const bank = load('../1-foundation/data/questions.json');
const game = {data, bank};
const selected = ['P3', 'D3', 'R1'];
const base = () => ({stage: 'checkpoint', phase: 0, selected: [...selected], confirmed: true,
  result: scoreSelection(data, selected), behaviourPoints: [0, 0, 0, 0], answers: [], error: null,
  checkpoint: {questionIds: ['Q01'], timer: {startedAt: 1000, pausedAt: null, pausedMs: 0}, expired: false}});
const players = [{id: 'alice', name: 'Alice', category: 'Prevent'}, {id: 'bob', name: 'Bob', category: 'Detect'}];
const phone = {code: 'VAULT-01', you: {host: false, ...players[0]}, players};
const host = {code: 'VAULT-01', you: {host: true}, players};
const q = bank.questions.find(q => q.id === 'Q01');
const freeze = value => {if (value && typeof value === 'object') {Object.freeze(value); Object.values(value).forEach(freeze);} return value;};
const renderCheckpoint = (state = base(), room = null, dispatch = () => {}) => checkpointScreen(state, game, dispatch, {}, room);

test('DOM helper keeps hostile text as text and preserves numeric zero', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const n = el('p', {}, payload, 0, false, null);
  assert.equal(n.textContent, payload + '0');
  assert.ok(n.children.every(c => c.tag === '#text'));
});

test('DOM helper omits absent boolean attributes and retains aria false as a string', () => {
  const n = el('button', {disabled: false, 'aria-pressed': 'false', required: true});
  assert.equal(n.attributes.disabled, undefined);
  assert.equal(n.attributes['aria-pressed'], 'false');
  assert.equal(n.attributes.required, '');
});

test('decorative images have empty alt text and missing artwork produces no element', () => {
  assert.equal(img('/picture.png').attributes.alt, '');
  assert.equal(img(null), null);
});

test('currency and fractional behaviour points are formatted for the player', () => {
  assert.equal(money(3000000), '£3,000,000');
  assert.equal(points(8), '8');
  assert.equal(points(4 / 3), '1.3');
});

test('budget summary accounts for selected controls and all three categories', () => {
  const actual = budgetSummary(data, selected);
  assert.equal(actual.spent, 350000);
  assert.equal(actual.left, 2650000);
  assert.deepEqual(actual.covered, {Prevent: true, Detect: true, Respond: true});
  assert.equal(actual.ready, true);
  assert.equal(budgetSummary(data, ['P3', 'D3']).ready, false);
});

test('single player, host and phone have the correct UI permissions', () => {
  assert.equal(runsGame(null), true); assert.equal(answersQuestions(null), true); assert.equal(seatId(null), null);
  assert.equal(runsGame(host), true); assert.equal(answersQuestions(host), false); assert.equal(picksFor(host, 'Prevent'), false);
  assert.equal(runsGame(phone), false); assert.equal(answersQuestions(phone), true); assert.equal(seatId(phone), 'alice');
  assert.equal(picksFor(phone, 'Prevent'), true); assert.equal(picksFor(phone, 'Detect'), false);
});

test('every configured logo, scenery, phase illustration and control render exists on disk', () => {
  const paths = [LOGO, ...Object.values(SCENE), ...PHASE_ART.flatMap(Object.values),
    ...[...data.controls, ...data.already_in_place].map(controlRender)];
  for (const path of paths) {
    assert.ok(path, 'Every supplied control has a render mapping');
    assert.ok(existsSync(new URL('..' + path, import.meta.url)), `Missing asset: ${path}`);
  }
});

test('name validation accepts the 24-character boundary and rejects empty or longer names', () => {
  assert.ok(nameProblem('')); assert.equal(nameProblem('a'.repeat(24)), null); assert.ok(nameProblem('a'.repeat(25)));
});

test('home buttons dispatch the selected play mode', () => {
  const calls = []; const tree = homeScreen(mode => calls.push(mode));
  keyed(tree, 'mode-single').events.click(); keyed(tree, 'mode-multi').events.click();
  assert.deepEqual(calls, ['single', 'multi']);
});

test('name form trims the user name and has an explicitly associated label', () => {
  const calls = []; const tree = nameScreen({mode: 'single'}, {back() {}, go: name => calls.push(name)});
  keyed(tree, 'name').value = '  Alice  ';
  find(tree, n => n.tag === 'form')[0].events.submit({preventDefault() {}});
  assert.deepEqual(calls, ['Alice']);
  assert.ok(find(tree, n => n.tag === 'label' && n.attributes.for === 'player-name').length);
});

test('join form trims fields, exposes failures as alerts, and blocks duplicate busy submissions in markup', () => {
  const calls = []; const tree = joinScreen({busy: true, error: 'Room not found'}, (...args) => calls.push(args));
  keyed(tree, 'code').value = '  VAULT-01  '; keyed(tree, 'name').value = ' Alice '; keyed(tree, 'team').value = ' Red ';
  find(tree, n => n.tag === 'form')[0].events.submit({preventDefault() {}});
  assert.deepEqual(calls, [['VAULT-01', 'Alice', 'Red']]);
  assert.equal(keyed(tree, 'go').attributes.disabled, '');
  assert.equal(find(tree, n => n.attributes.role === 'alert')[0].textContent, 'Room not found');
});

test('host creation button has a busy disabled state', () => {
  assert.equal(keyed(hostStartScreen({busy: true}, () => {}), 'create').attributes.disabled, '');
});

test('phone control picker exposes only its assigned category and keeps real control names', () => {
  const tree = chooseScreen(base(), game, () => {}, {heistName: () => 'Theme alias'}, phone);
  const pickButtons = find(tree, n => n.tag === 'button' && n.attributes['data-key']?.startsWith('pick-'));
  assert.equal(pickButtons.length, data.controls.filter(c => c.category === 'Prevent').length);
  assert.equal(keyed(tree, 'confirm'), undefined);
  for (const c of data.controls) assert.ok(text(tree).includes(c.name));
  assert.ok(text(tree).includes('Theme alias'));
});

test('control picker callbacks select and deselect the chosen control without mutating state', () => {
  const state = freeze(base()); const calls = [];
  const tree = chooseScreen(state, game, a => calls.push(a), {}, null);
  keyed(tree, 'pick-P3').events.click(); keyed(tree, 'pick-P1').events.click();
  assert.deepEqual(calls, [{type: 'deselect', id: 'P3'}, {type: 'select', id: 'P1'}]);
});

test('another phone answering does not close this player question or reveal its answer', t => {
  t.mock.method(Date, 'now', () => 2000);
  const state = base(); state.answers = [{phase: 0, questionId: q.id, player: 'bob', choice: q.correct, correct: true}];
  const tree = renderCheckpoint(state, phone);
  assert.equal(keyed(tree, `answer-${q.id}-${q.correct}`).attributes.disabled, undefined);
  assert.ok(!text(tree).includes(q.explanation));
});

test('personal secure answer locks the question and displays its exact explanation', t => {
  t.mock.method(Date, 'now', () => 2000);
  const state = base(); state.answers = [{phase: 0, questionId: q.id, player: 'alice', choice: q.correct, correct: true}];
  const tree = renderCheckpoint(freeze(state), phone);
  assert.equal(keyed(tree, `answer-${q.id}-${q.correct}`).attributes.disabled, '');
  assert.ok(text(tree).includes(`Secure answer: +${POINTS_PER_SECURE_ANSWER} points`));
  assert.ok(text(tree).includes(q.explanation));
});

test('wrong personal answer has textual feedback as well as colour classes', t => {
  t.mock.method(Date, 'now', () => 2000);
  const state = base(); const wrong = Object.keys(q.options).find(letter => letter !== q.correct);
  state.answers = [{phase: 0, questionId: q.id, player: null, choice: wrong, correct: false}];
  const tree = renderCheckpoint(state);
  assert.ok(text(tree).includes('Not the secure answer: 0 points'));
  assert.ok(keyed(tree, `answer-${q.id}-${wrong}`).textContent.includes('Your answer'));
  assert.ok(keyed(tree, `answer-${q.id}-${q.correct}`).textContent.includes('Secure answer'));
});

test('expired unanswered question shows zero points, its correct answer and its explanation', () => {
  const state = base(); state.checkpoint.expired = true;
  const tree = renderCheckpoint(state, phone);
  assert.ok(text(tree).includes('Not answered in time: 0 points'));
  assert.ok(text(tree).includes(q.explanation));
  assert.ok(Object.keys(q.options).every(letter => keyed(tree, `answer-${q.id}-${letter}`).attributes.disabled === ''));
  assert.equal(keyed(tree, 'pause'), undefined);
});

test('host can pause and advance, sees team participation, and cannot answer', t => {
  t.mock.method(Date, 'now', () => 2000);
  const state = base(); state.answers = [{phase: 0, questionId: q.id, player: 'alice', choice: q.correct, correct: true}];
  const calls = []; const tree = renderCheckpoint(state, host, a => calls.push(a));
  assert.ok(text(tree).includes('1 of 2 answered'));
  assert.equal(keyed(tree, `answer-${q.id}-${q.correct}`).attributes.disabled, '');
  keyed(tree, 'pause').events.click(); keyed(tree, 'next').events.click();
  assert.deepEqual(calls, [{type: 'pause'}, {type: 'next'}]);
});

test('phone cannot access pause or advance buttons but can dispatch its own answer', t => {
  t.mock.method(Date, 'now', () => 2000);
  const calls = []; const tree = renderCheckpoint(base(), phone, a => calls.push(a));
  assert.equal(keyed(tree, 'pause'), undefined); assert.equal(keyed(tree, 'next'), undefined);
  keyed(tree, `answer-${q.id}-${q.correct}`).events.click();
  assert.deepEqual(calls, [{type: 'answer', questionId: q.id, choice: q.correct}]);
});

test('timer updates expose exact seconds, low time, pause and expiry in accessible labels', t => {
  t.mock.method(Date, 'now', () => 1000 + CHECKPOINT_SECONDS * 1000 - 19001);
  const state = base(); const ring = el('div', {}, el('span'));
  updateTimer(ring, state.checkpoint);
  assert.equal(ring.firstChild.textContent, '20'); assert.ok(hasClass(ring, 'is-low'));
  assert.equal(ring.attributes['aria-label'], '20 seconds left');
  state.checkpoint.timer.pausedAt = 2000; updateTimer(ring, state.checkpoint);
  assert.equal(ring.firstChild.textContent, '❚❚'); assert.match(ring.attributes['aria-label'], /paused/);
  state.checkpoint.expired = true; updateTimer(ring, state.checkpoint);
  assert.equal(ring.firstChild.textContent, '0'); assert.equal(ring.attributes['aria-label'], 'Time is up');
});

test('room names and activity remain literal text and leave callback is wired', () => {
  let left = false; const hostile = '<script>alert(1)</script>';
  const tree = roomBar({...phone, players: [{...players[0], name: hostile}], log: [{ok: false, text: hostile}], onLeave: () => {left = true;}});
  assert.ok(text(tree).includes(hostile)); assert.equal(find(tree, n => n.tag === 'script').length, 0);
  keyed(tree, 'leave').events.click(); assert.equal(left, true);
});

test('story preserves the source title and story when an optional theme title is supplied', () => {
  const tree = storyScreen(freeze(base()), game, () => {}, {heistPhaseTitle: () => 'Theme title'}, phone);
  assert.ok(text(tree).includes('Theme title')); assert.ok(text(tree).includes(data.phases[0].title));
  assert.ok(text(tree).includes(data.phases[0].story)); assert.equal(keyed(tree, 'next'), undefined);
});

test('reveal renderer keeps control names and scores, and does not mutate game inputs', () => {
  const state = freeze(base()); const before = JSON.stringify(state);
  const tree = revealScreen(state, game, () => {}, {heistName: () => 'Alias'}, null);
  for (const id of selected) assert.ok(text(tree).includes(data.controls.find(c => c.id === id).name));
  assert.equal(JSON.stringify(state), before);
  assert.ok(find(tree, n => n.attributes.role === 'img' && n.attributes['aria-label']?.includes('attacks held back')).length);
});

test('outcome separates scores; on a phone the debrief is a PDF that groups answers once per question', () => {
  const state = base(); state.stage = 'outcome'; state.phase = 3; state.checkpoint = null;
  state.behaviourPoints = [1, 0, 0, 0];
  state.answers = [{phase: 0, questionId: q.id, player: 'alice', choice: q.correct, correct: true},
    {phase: 0, questionId: q.id, player: 'bob', choice: 'Z', correct: false}];
  const tree = outcomeScreen(freeze(state), game, () => {}, {}, phone);
  const cards = find(tree, n => hasClass(n, 'score'));
  assert.equal(cards.length, 3);
  assert.equal(find(cards[0], n => n.attributes['data-count-to'] !== undefined)[0].attributes['data-count-to'], String(state.result.total));
  assert.equal(find(cards[1], n => n.attributes['data-count-to'] !== undefined)[0].attributes['data-count-to'], '1');
  assert.equal(find(cards[2], n => n.attributes['data-count-to'] !== undefined)[0].attributes['data-count-to'], String(state.result.total + 1));
  // Phones get no debrief pop-ups, only the download button; the PDF holds the debrief.
  assert.equal(text(tree).includes(q.explanation), false);
  assert.equal(keyed(tree, 'open-debrief'), undefined);
  assert.ok(keyed(tree, 'download-debrief')); assert.equal(keyed(tree, 'reset'), undefined);
  const pdfText = debriefBlocks(game, freeze(state), phone).map(b => b.text).join(' ');
  assert.equal(pdfText.split(q.explanation).length - 1, 1);
  assert.ok(pdfText.includes('1 of 2 secure'));
  assert.ok(pdfText.includes(`Your answer: ${q.correct}.`));   // Alice's own answer
});

test('vault SVGs have distinct gradient IDs and an explicit status/damage label', () => {
  const first = vaultSafe('damaged', 'Vault', 0.35); const second = vaultSafe('secure');
  const ids = [...walk(first), ...walk(second)].map(n => n.attributes.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(first.attributes['aria-label'], 'Vault: damaged, 35% damaged');
});

test('night report swap recommendation preserves the required control categories', () => {
  const chosen = ['P2', 'D1', 'D5', 'R1', 'R2'];
  const state = {selected: chosen, result: scoreSelection(data, chosen), behaviourPoints: [0, 0, 0, 0], answers: []};
  const suggestion = nightSummary(data, bank, state).suggestion;
  if (suggestion?.kind === 'swap') {
    const replacement = [...chosen.filter(id => id !== suggestion.instead.id), suggestion.control.id];
    assert.doesNotThrow(() => scoreSelection(data, replacement), 'A recommended swap must leave a valid Prevent/Detect/Respond plan');
  }
});
