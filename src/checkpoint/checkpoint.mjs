import {POINTS_PER_SECURE_ANSWER, CHECKPOINT_SECONDS} from '../config.mjs';

// Fixed IDs make selection independent of bank ordering and identical on every device.
const PHASE_QUESTION_IDS = Object.freeze({
  phase_1: Object.freeze(['Q01','Q02','Q29','Q03','Q04']),
  phase_2: Object.freeze(['Q09','Q10','Q37','Q11']),
  phase_3: Object.freeze(['Q15','Q16','Q12','Q08']),
  phase_4: Object.freeze(['Q22','Q30','Q32','Q31']),
});
function check(condition, message) {
  if (!condition) throw new Error(message);
}

export function pickQuestions(bank, phaseId, count) {
  const list = Array.isArray(bank) ? bank : bank?.questions;
  check(Array.isArray(list), 'Question bank must be an array or contain a questions array.');
  const ids = PHASE_QUESTION_IDS[phaseId];
  check(ids, 'Unknown checkpoint phase: ' + phaseId);
  check(Number.isSafeInteger(count) && count >= 0 && count <= ids.length,
    'Question count must be a whole number from 0 to ' + ids.length + ' for ' + phaseId + '.');
  if (!count) return [];
  const candidates = ids.map(id => {
    const matches = list.filter(q => q.id === id);
    check(matches.length === 1, 'Expected exactly one supplied question with ID ' + id);
    return matches[0];
  });
  // For a shorter set, retain both an easier and a harder question.
  // For four questions, preserve the team's agreed IDs and order.
  let chosen;
  if (count === 1) chosen = [candidates.reduce((best,q)=>q.tier<best.tier?q:best)];
  else if (count === 2 || count === 3) {
    const easy = candidates.reduce((best,q)=>q.tier<best.tier?q:best);
    const hard = candidates.slice(0,4).reduce((best,q)=>q.tier>best.tier?q:best);
    chosen = [easy, hard];
    for (const q of candidates) {
      if (chosen.length === count) break;
      if (!chosen.includes(q)) chosen.splice(chosen.length-1,0,q);
    }
  } else chosen = candidates.slice(0,count);
  return structuredClone(chosen);
}

export function markAnswer(question, choice) {
  check(question && question.options && Object.hasOwn(question.options, question.correct),
    'Question must have options and a valid correct answer.');
  check(typeof question.explanation === 'string', 'Question explanation is missing.');
  const correct = choice === question.correct;
  return {correct, points: correct ? POINTS_PER_SECURE_ANSWER : 0,
    explanation: question.explanation};
}

// Timer is plain serialisable engine state. None of these functions mutate their input.
function validateTime(now) {
  check(Number.isFinite(now) && now >= 0, 'now must be a non-negative timestamp in milliseconds.');
}
function validateTimer(timer, now) {
  validateTime(now);
  check(timer && Number.isFinite(timer.startedAt) && timer.startedAt >= 0 &&
    Number.isFinite(timer.pausedMs) && timer.pausedMs >= 0 &&
    (timer.pausedAt === null || (Number.isFinite(timer.pausedAt) && timer.pausedAt >= timer.startedAt)),
    'Timer must contain startedAt, pausedAt and pausedMs.');
  check(now >= (timer.pausedAt ?? timer.startedAt), 'now cannot be earlier than the timer.');
  const endpoint = timer.pausedAt ?? now;
  check(endpoint - timer.startedAt >= timer.pausedMs, 'Paused time cannot exceed elapsed time.');
}
export function startTimer(now) {
  validateTime(now);
  return {startedAt: now, pausedAt: null, pausedMs: 0};
}
export function timeLeft(timer, now) {
  validateTimer(timer, now);
  const elapsed = (timer.pausedAt ?? now) - timer.startedAt - timer.pausedMs;
  return Math.max(0, CHECKPOINT_SECONDS * 1000 - elapsed);
}
export function pauseTimer(timer, now) {
  validateTimer(timer, now);
  return {...timer, pausedAt: timer.pausedAt ?? now};
}
export function resumeTimer(timer, now) {
  validateTimer(timer, now);
  if (timer.pausedAt === null) return {...timer};
  return {...timer, pausedAt: null, pausedMs: timer.pausedMs + now - timer.pausedAt};
}
export function isExpired(timer, now) {
  return timeLeft(timer, now) === 0;
}

/**
 * Team average per question. Engine passes answers for the current phase.
 * Records use the agreed shape: {phase, questionId, player, choice, correct}.
 * players may be eligible player IDs or objects with id; missing answers score zero.
 * With no roster, average the submitted records per question (single-screen compatible).
 */
export function teamBehaviourPoints(answers, players) {
  check(Array.isArray(answers), 'answers must be an array.');
  const roster = players === undefined ? null : players;
  check(roster === null || Array.isArray(roster), 'players must be an array of IDs or player objects.');
  const playerIds = roster === null ? null : roster.map(player => typeof player === 'string' ? player : player?.id);
  if (playerIds) {
    check(playerIds.every(id => typeof id === 'string' && id.trim()), 'Each eligible player needs an ID.');
    check(new Set(playerIds).size === playerIds.length, 'The player roster contains duplicate IDs.');
  }
  if (!answers.length) return 0;
  const byQuestion = new Map(), seen = new Set();
  for (const answer of answers) {
    check(answer && typeof answer.questionId === 'string' && answer.questionId.trim(),
      'Each answer needs a questionId.');
    check(typeof answer.correct === 'boolean', 'Each answer needs a boolean correct value.');
    const player = answer.player ?? null;
    check(player === null || typeof player === 'string', 'Answer player must be a player ID or null.');
    const key = JSON.stringify([answer.questionId, player]);
    check(!seen.has(key), 'A player cannot submit twice for the same question.');
    seen.add(key);
    if (playerIds?.length) check(playerIds.includes(player), 'Answer player is not in the eligible roster.');
    const group = byQuestion.get(answer.questionId) ?? {correct:0, count:0};
    group.correct += answer.correct ? 1 : 0; group.count++;
    byQuestion.set(answer.questionId, group);
  }
  if (playerIds?.length === 0 && answers.some(answer => answer.player != null))
    throw new Error('No eligible players were provided for multiplayer answers.');
  let points = 0;
  for (const group of byQuestion.values()) {
    const denominator = playerIds?.length || group.count;
    points += POINTS_PER_SECURE_ANSWER * group.correct / denominator;
  }
  return points;
}

