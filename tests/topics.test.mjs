// Tests for the judges' requests: the host chooses the quiz topics (with our extra question
// bank, data/more-questions.json), and each player downloads their debrief as a PDF.
import test from 'node:test';
import assert from 'node:assert/strict';
import {QUESTIONS_PER_CHECKPOINT} from '../src/config.mjs';
import {loadGameData, quizTopics} from '../src/engine/loadData.mjs';
import {pickTopicQuestions} from '../src/checkpoint/checkpoint.mjs';
import {actCompetition, competitionView, createCompetition, joinCompetition, sharedState} from '../src/server/competition.mjs';
import {debriefBlocks, debriefPdf} from '../src/debrief/debriefPdf.mjs';
import {makePdf, pdfText} from '../src/debrief/pdf.mjs';

const game = await loadGameData({moreTopics: true});
const {bank} = game;
const topicOf = id => bank.questions.find(q => q.id === id).category;

// ================================================================ the question bank

test('the extra topics load with the supplied bank, checked by the same rules', async () => {
  const plain = await loadGameData();
  assert.equal(plain.bank.questions.length, 40, 'without moreTopics the supplied bank is unchanged');
  assert.ok(bank.questions.length > 40);
  assert.deepEqual(bank.questions.slice(0, 40), plain.bank.questions, 'the supplied questions come first, word for word');
  const topics = quizTopics(bank);
  assert.ok(topics.length >= 18);
  for (const t of topics) assert.ok(t.questions >= 4, `${t.name} has at least one question per tier`);
  for (const q of bank.questions.slice(40)) {
    assert.equal(q.phase_id, null);
    assert.deepEqual([...new Set(bank.questions.filter(x => x.category === q.category).map(x => x.tier))].sort(), [1, 2, 3, 4]);
    for (const id of q.related_controls) assert.ok(game.data.controls.some(c => c.id === id), `${q.id} relates to a real control`);
  }
});

// ================================================================ picking questions by topic

test('topic quizzes ask only the chosen topics, easiest first, with no repeats across the night', () => {
  const topics = ['Phishing', 'Ransomware & Malware', 'Insider Threats', 'Payment & Invoice Fraud'];
  const night = [0, 1, 2, 3].map(n => pickTopicQuestions(bank, topics, 1234, n, QUESTIONS_PER_CHECKPOINT));
  for (const quiz of night) {
    assert.equal(quiz.length, QUESTIONS_PER_CHECKPOINT);
    assert.ok(quiz.every(q => topics.includes(q.category)));
    assert.deepEqual(quiz.map(q => q.tier), [...quiz.map(q => q.tier)].sort((a, b) => a - b));
    assert.ok(new Set(quiz.map(q => q.category)).size > 1, 'each quiz mixes the topics');
  }
  assert.equal(new Set(night.flat().map(q => q.id)).size, 16);
});

test('the same seed deals the same quiz; a new seed deals a different one', () => {
  const topics = quizTopics(bank).map(t => t.name);
  const deal = seed => [0, 1, 2, 3].map(n => pickTopicQuestions(bank, topics, seed, n, 4).map(q => q.id)).join();
  assert.equal(deal(7), deal(7));
  assert.notEqual(deal(7), deal(8));
});

test('one small topic still fills every quiz, coming round again', () => {
  const quiz = pickTopicQuestions(bank, ['Passwords'], 99, 3, 4);
  assert.equal(quiz.length, 4);
  assert.ok(quiz.every(q => q.category === 'Passwords'));
  assert.deepEqual(pickTopicQuestions(bank, ['Not a topic'], 1, 0, 4), []);
});

// ================================================================ the host chooses

function battle() {
  const room = createCompetition('VAULT-42');
  const red = ['Ana', 'Ben'].map(name => joinCompetition(room, name, 'Red').player);
  const blue = ['Cat', 'Dev'].map(name => joinCompetition(room, name, 'Blue').player);
  return {room, red, blue, host: room.hostToken};
}

test('the host chooses quiz topics before the night; players and unknown topics are refused', () => {
  const {room, red, host} = battle();
  assert.deepEqual(competitionView(room, host).topics, []);
  actCompetition(room, host, {type: 'topics', topics: ['Phishing', 'AI, Deepfakes & Impersonation', 'Phishing']}, game);
  assert.deepEqual(room.topics, ['Phishing', 'AI, Deepfakes & Impersonation']);
  assert.deepEqual(competitionView(room, red[0].token).topics, room.topics, 'players can see the topics too');
  assert.throws(() => actCompetition(room, red[0].token, {type: 'topics', topics: []}, game), {status: 400});
  assert.throws(() => actCompetition(room, host, {type: 'topics', topics: ['Cooking']}, game), {status: 400});
  assert.throws(() => actCompetition(room, host, {type: 'topics', topics: 'Phishing'}, game), {status: 400});
  assert.deepEqual(room.topics, ['Phishing', 'AI, Deepfakes & Impersonation'], 'a refusal changes nothing');
  actCompetition(room, host, {type: 'confirm'}, game, 1_000);
  assert.throws(() => actCompetition(room, host, {type: 'topics', topics: []}, game), {status: 409});
});

test('the topics can be chosen before anyone joins', () => {
  const room = createCompetition('VAULT-43');
  actCompetition(room, room.hostToken, {type: 'topics', topics: ['Incident Reporting']}, game);
  assert.deepEqual(room.topics, ['Incident Reporting']);
});

test('every team gets the same quiz from the chosen topics, and a new night deals again', () => {
  const {room, host} = battle();
  const topics = ['Ransomware & Malware', 'Cloud & File Sharing', 'Removable Media & USB', 'Insider Threats'];
  actCompetition(room, host, {type: 'topics', topics}, game);
  const quizzes = () => {
    actCompetition(room, host, {type: 'confirm'}, game, 1_000);
    const seen = [];
    for (let n = 0; n < 4; n++) {
      actCompetition(room, host, {type: 'next'}, game, 2_000);
      actCompetition(room, host, {type: 'next'}, game, 3_000);
      const [a, b] = room.teams.map(t => t.state.checkpoint.questionIds);
      assert.deepEqual(a, b, 'both teams answer the same questions');
      assert.ok(a.every(id => topics.includes(topicOf(id))));
      seen.push(...a);
      actCompetition(room, host, {type: 'next'}, game, 4_000);
    }
    assert.equal(sharedState(room).stage, 'outcome');
    return seen;
  };
  const first = quizzes();
  assert.equal(new Set(first).size, 16, 'no question twice in one night');
  actCompetition(room, host, {type: 'reset'}, game);
  assert.deepEqual(room.topics, topics, 'the topics stay chosen for the next night');
  const later = [quizzes()];
  for (let i = 0; i < 2; i++) {
    actCompetition(room, host, {type: 'reset'}, game);
    later.push(quizzes());
  }
  assert.ok(later.some(night => night.join() !== first.join()), 'new nights deal new questions');
});

test('with no topics chosen the quizzes are the brief\'s story questions, as before', () => {
  const {room, host} = battle();
  actCompetition(room, host, {type: 'confirm'}, game, 1_000);
  actCompetition(room, host, {type: 'next'}, game, 2_000);
  actCompetition(room, host, {type: 'next'}, game, 3_000);
  assert.equal(sharedState(room).quiz, undefined);
  assert.ok(sharedState(room).checkpoint.questionIds.every(id => id.startsWith('Q')));
});

// ================================================================ the debrief PDF

test('pdfText keeps what the PDF fonts can draw and drops the rest', () => {
  assert.equal(pdfText('£3m ✓ 🛡️ “safe” – done'), '\xA33m \x93safe\x94 \x96 done');
  assert.equal(pdfText('a\n\tb'), 'a b');
});

test('makePdf writes a well-formed PDF whose cross-reference points at every object', () => {
  const long = 'Report anything suspicious (even small things) straight away. '.repeat(40);
  const blocks = [{kind: 'title', text: 'Test'}, ...Array.from({length: 30}, (_, i) => ({kind: i % 3 ? 'li' : 'h2', text: long}))];
  const bytes = makePdf(blocks, {title: 'Test'});
  const file = Buffer.from(bytes).toString('latin1');
  assert.ok(file.startsWith('%PDF-1.4'));
  assert.ok(file.trimEnd().endsWith('%%EOF'));
  const xref = Number(/startxref\n(\d+)/.exec(file)[1]);
  assert.ok(file.startsWith('xref', xref));
  const offsets = [...file.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]));
  offsets.forEach((offset, i) => assert.ok(file.startsWith(`${i + 1} 0 obj`, offset), `object ${i + 1}`));
  const pages = Number(/\/Count (\d+)/.exec(file)[1]);
  assert.ok(pages > 1, 'long text runs onto more pages');
  for (const m of file.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    assert.ok(file.startsWith('\nendstream', start + Number(m[1])), 'each stream length is exact');
  }
  assert.ok(file.includes(`page ${pages} of ${pages}`));
  assert.ok(file.includes('\\(even small things\\)'), 'brackets are escaped');
});

test('a player\'s debrief has their own answers, the secure answer and why, and the team result', () => {
  const {room, red, host} = battle();
  actCompetition(room, host, {type: 'topics', topics: ['Payment & Invoice Fraud']}, game);
  actCompetition(room, red[0].token, {type: 'select', id: 'P5'}, game);
  actCompetition(room, host, {type: 'confirm'}, game, 1_000);
  actCompetition(room, host, {type: 'next'}, game, 2_000);
  actCompetition(room, host, {type: 'next'}, game, 3_000);
  const [first, second] = sharedState(room).checkpoint.questionIds.map(id => bank.questions.find(q => q.id === id));
  const wrong = ['A', 'B', 'C', 'D'].find(c => c !== second.correct);
  actCompetition(room, red[0].token, {type: 'answer', questionId: first.id, choice: first.correct}, game, 4_000);
  actCompetition(room, red[0].token, {type: 'answer', questionId: second.id, choice: wrong}, game, 4_000);
  actCompetition(room, red[1].token, {type: 'answer', questionId: first.id, choice: first.correct}, game, 4_000);
  for (let i = 0; i < 10; i++) actCompetition(room, host, {type: 'next'}, game, 5_000 + i);
  assert.equal(sharedState(room).stage, 'outcome');

  const view = competitionView(room, red[0].token);
  const text = debriefBlocks(game, view.state, view, new Date(2026, 9, 11)).map(b => b.text).join('\n');
  assert.match(text, /Ana {2}·  team Red/);
  assert.ok(text.includes(`Your answer: ${first.correct}. ${first.options[first.correct]} - secure.`));
  assert.ok(text.includes(`Your answer: ${wrong}. ${second.options[wrong]} - not secure.`));
  assert.ok(text.includes(`Secure answer: ${second.correct}. ${second.options[second.correct]}`));
  assert.ok(text.includes(second.explanation));
  assert.ok(text.includes('Your team: 2 of 2 secure.'));
  assert.ok(text.includes('Your team finished'));

  const bob = competitionView(room, red[1].token);
  assert.ok(debriefBlocks(game, bob.state, bob).some(b => b.text === 'You did not answer this one in time.'));
  assert.ok(Buffer.from(debriefPdf(game, view.state, view)).toString('latin1').startsWith('%PDF'));
});
