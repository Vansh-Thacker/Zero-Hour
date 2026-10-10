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
export function teamBehaviourPoints(answers) {
  const byQuestion = new Map();
  for (const answer of answers) {
    byQuestion.set(answer.questionId, [...(byQuestion.get(answer.questionId) ?? []), answer]);
  }
  let points = 0;
  for (const given of byQuestion.values()) {
    points += POINTS_PER_SECURE_ANSWER * given.filter(a => a.correct).length / given.length;
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
