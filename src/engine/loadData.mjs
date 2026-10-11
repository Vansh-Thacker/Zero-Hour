import {validateData} from '../../1-foundation/starter/controls.mjs';
import {DATA_PATHS} from '../config.mjs';

async function loadJson(path) {
  try {
    if (typeof window === 'undefined') {
      const {readFile} = await import('node:fs/promises');
      const root = new URL('../../', import.meta.url);
      return JSON.parse(await readFile(new URL(path.slice(1), root), 'utf8'));
    }

    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    throw new Error(`Could not load ${path}: ${error.message}`, {cause: error});
  }
}

function validateQuestions(bank, data) {
  if (!bank || !Array.isArray(bank.questions) || bank.questions.length === 0) {
    throw new Error('The question bank needs a non-empty questions list.');
  }

  const phaseIds = new Set(data.phases.map(phase => phase.id));
  const seen = new Set();
  for (const question of bank.questions) {
    if (!question || typeof question.id !== 'string' || !question.id.trim()) {
      throw new Error('Every question needs an ID.');
    }
    if (seen.has(question.id)) throw new Error(`Question ${question.id} appears twice.`);
    seen.add(question.id);
    if (typeof question.question !== 'string' || !question.question.trim()) {
      throw new Error(`Question ${question.id} needs its question text.`);
    }
    if (!question.options || ['A', 'B', 'C', 'D'].some(key =>
      typeof question.options[key] !== 'string' || !question.options[key].trim())) {
      throw new Error(`Question ${question.id} needs options A, B, C and D.`);
    }
    if (!['A', 'B', 'C', 'D'].includes(question.correct)) {
      throw new Error(`Question ${question.id} needs a correct answer from A to D.`);
    }
    if (typeof question.explanation !== 'string' || !question.explanation.trim()) {
      throw new Error(`Question ${question.id} needs an explanation.`);
    }
    if (question.phase_id != null && !phaseIds.has(question.phase_id)) {
      throw new Error(`Question ${question.id} refers to an unknown phase.`);
    }
  }
}

// Return the same {data, bank} shape used by the reducer in Node and browsers.
// moreTopics: also add our own questions on extra topics (data/more-questions.json), which the
// host can choose in the team battle. They are checked by the same rules as the supplied bank.
export async function loadGameData({moreTopics = false} = {}) {
  const [data, bank, more] = await Promise.all([
    loadJson(DATA_PATHS.challenge),
    loadJson(DATA_PATHS.questions),
    moreTopics ? loadJson(DATA_PATHS.moreQuestions) : null,
  ]);
  validateData(data);
  validateQuestions(bank, data);
  if (!more) return {data, bank};
  const merged = {...bank, questions: [...bank.questions, ...(more.questions ?? [])]};
  validateQuestions(merged, data);
  return {data, bank: merged};
}

// Every quiz topic in the bank, with how many questions it has, in the bank's order.
export function quizTopics(bank) {
  const counts = new Map();
  for (const q of bank.questions) counts.set(q.category, (counts.get(q.category) ?? 0) + 1);
  return [...counts].map(([name, questions]) => ({name, questions}));
}
