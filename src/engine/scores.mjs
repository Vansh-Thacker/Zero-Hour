import {scoreSelection, validateData} from '../../1-foundation/starter/controls.mjs';

const CATEGORY_BITS = {Prevent: 1, Detect: 2, Respond: 4};

function isRevealed(state, n) {
  if (!state.result || !Number.isInteger(n) || n < 0 || n >= state.result.phases.length) return false;
  if (state.stage === 'outcome') return true;
  if (n < state.phase) return true;
  return n === state.phase && (state.stage === 'reveal' || state.stage === 'checkpoint');
}

export function phaseScore(state, n) {
  const score = isRevealed(state, n) ? state.result.phases[n].score : 0;
  return Number.isFinite(score) ? score : 0;
}

export function controlScoreSoFar(state) {
  if (!state.result) return 0;
  return state.result.phases.reduce((total, _, n) => total + phaseScore(state, n), 0);
}

export function behaviourTotal(state) {
  return state.behaviourPoints.reduce((total, points) => total + points, 0);
}

export function finalTotal(state) {
  return controlScoreSoFar(state) + behaviourTotal(state);
}

export function bestPossiblePhaseScore(data, n) {
  validateData(data);
  if (!Number.isInteger(n) || n < 0 || n >= data.phases.length) {
    throw new RangeError('Phase index is out of range.');
  }

  const chosen = [];
  let bestIds = null;
  let bestPoints = -Infinity;
  const phaseScores = data.phases[n].scores;

  function search(index, spent, categories, points) {
    if (index === data.controls.length) {
      if (categories === 7 && points > bestPoints) {
        bestPoints = points;
        bestIds = [...chosen];
      }
      return;
    }

    search(index + 1, spent, categories, points);

    const control = data.controls[index];
    if (spent + control.cost > data.budget) return;
    chosen.push(control.id);
    search(index + 1, spent + control.cost,
      categories | CATEGORY_BITS[control.category], points + phaseScores[control.id]);
    chosen.pop();
  }

  search(0, 0, 0, 0);
  if (!bestIds) throw new Error('No valid selection fits the budget.');

  // Let the supplied scorer produce the score for the best valid basket.
  return scoreSelection(data, bestIds).phases[n].score;
}
