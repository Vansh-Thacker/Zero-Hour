// Behaviour checkpoints. Owner: Ghassan.
// Pure functions the engine calls: pick questions for a phase, mark an answer, run the
// 2-minute timer and work out the team's behaviour points. No page code, and the time is
// always passed in (never Date.now() inside), so the same code can run the shared timer
// on the multiplayer server and be tested without waiting.
// Every question, answer and explanation is used exactly as written in questions.json.

import {CHECKPOINT_SECONDS, POINTS_PER_SECURE_ANSWER} from '../config.mjs';

const LIMIT_MS = CHECKPOINT_SECONDS * 1000;
const byTierThenId = (a, b) => a.tier - b.tier || a.id.localeCompare(b.id);

// --- Choosing questions ---------------------------------------------------------------

// The questions for one phase's checkpoint, easiest first.
//  1. The phase's story questions (phase_id in questions.json, the brief's "Story questions"),
//     one per difficulty tier first, so a checkpoint climbs from Spot the Risk to Pressure Test.
//  2. If a phase has fewer than `count`, general questions on the same topics fill the gap
//     (the brief's "Topics that fit").
// Always the same questions for the same phase, so every player and every phone sees the same.
export function pickQuestions(bank, phaseId, count) {
  const story = bank.questions.filter(q => q.phase_id === phaseId).sort(byTierThenId);
  const oneEachTier = story.filter((q, i) => i === 0 || q.tier !== story[i - 1].tier);
  const rest = story.filter(q => !oneEachTier.includes(q));
  let picked = [...oneEachTier, ...rest].slice(0, count);

  if (picked.length < count) {
    const topics = new Set(story.map(q => q.category));
    const general = bank.questions
      .filter(q => q.phase_id == null && topics.has(q.category))
      .sort(byTierThenId);
    picked = [...picked, ...general.slice(0, count - picked.length)];
  }
  return picked.sort(byTierThenId);
}

// The questions for one checkpoint when the host has chosen the quiz topics.
// The chosen topics' questions are shuffled with the night's seed (so a new night gets new
// questions, but every team and phone in one night gets the same ones), mixed so the topics take
// turns, then dealt out: checkpoint 1 gets the first `count`, checkpoint 2 the next, and so on.
// Questions only come round again when the topics have fewer than count x 4 between them.
export function pickTopicQuestions(bank, topics, seed, checkpoint, count) {
  const random = seeded(seed);
  const shuffle = list => {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const groups = shuffle(topics.filter(t => bank.questions.some(q => q.category === t)))
    .map(topic => shuffle(bank.questions.filter(q => q.category === topic).sort((a, b) => a.id.localeCompare(b.id))));
  const pool = [];
  for (let round = 0; groups.some(g => g.length > round); round++) {
    for (const group of groups) if (group[round]) pool.push(group[round]);
  }
  if (!pool.length) return [];
  const picked = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) picked.push(pool[(checkpoint * count + i) % pool.length]);
  return picked.sort(byTierThenId);
}

// A small seeded random number generator (mulberry32): the same seed always gives the same numbers.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Marking ----------------------------------------------------------------------------

// One answer: secure answers earn points, anything else earns none.
// The explanation always comes back, so the screen can show it whatever the answer.
export function markAnswer(question, choice) {
  const correct = choice === question.correct;
  return {correct, points: correct ? POINTS_PER_SECURE_ANSWER : 0, explanation: question.explanation};
}

// Team average per question, so the number of players does not change the score.
// One player: full points for a secure answer, none otherwise. Two players, one secure: half.
// answers: [{questionId, correct}, ...] for one checkpoint.
// teamSize (multiplayer): how many players are in the team. A player who has not answered
// counts as 0 for that question, so staying silent never beats a wrong answer.
export function teamBehaviourPoints(answers, teamSize = 0) {
  const byQuestion = new Map();
  for (const answer of answers) {
    byQuestion.set(answer.questionId, [...(byQuestion.get(answer.questionId) ?? []), answer]);
  }
  let points = 0;
  for (const given of byQuestion.values()) {
    points += POINTS_PER_SECURE_ANSWER * given.filter(a => a.correct).length / Math.max(given.length, teamSize);
  }
  return points;
}

// --- The 2-minute timer ------------------------------------------------------------------
// A timer is a small plain object, so it can sit in the game state and be sent to phones.
// Every function returns a new timer and never changes the one it is given.

export function startTimer(now) {
  return {startedAt: now, pausedAt: null, pausedMs: 0};
}

// Milliseconds left, never below 0. Time spent paused does not count.
export function timeLeft(timer, now) {
  const pausedFor = timer.pausedMs + (timer.pausedAt === null ? 0 : now - timer.pausedAt);
  return Math.max(0, LIMIT_MS - (now - timer.startedAt - pausedFor));
}

export function isPaused(timer) {
  return timer.pausedAt !== null;
}

export function pauseTimer(timer, now) {
  if (isPaused(timer)) return timer;
  return {...timer, pausedAt: now};
}

export function resumeTimer(timer, now) {
  if (!isPaused(timer)) return timer;
  return {...timer, pausedAt: null, pausedMs: timer.pausedMs + (now - timer.pausedAt)};
}

export function isExpired(timer, now) {
  return timeLeft(timer, now) === 0;
}
