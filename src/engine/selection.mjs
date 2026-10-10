import {scoreSelection} from '../../1-foundation/starter/controls.mjs';

const CATEGORIES = ['Prevent', 'Detect', 'Respond'];

// Summarise a basket of purchasable control IDs without changing it.
export function selectionSummary(data, selected) {
  const controlsById = new Map(data.controls.map(control => [control.id, control]));
  const counts = {Prevent: 0, Detect: 0, Respond: 0};
  let spent = 0;

  for (const id of selected) {
    const control = controlsById.get(id);
    if (!control) continue;
    spent += control.cost;
    counts[control.category] += 1;
  }

  const missing = CATEGORIES.filter(category => counts[category] === 0);
  let canConfirm = false;
  if (missing.length === 0) {
    try {
      // The supplied scorer is the final authority on a confirmable basket.
      scoreSelection(data, selected);
      canConfirm = true;
    } catch {
      canConfirm = false;
    }
  }

  return {spent, left: data.budget - spent, counts, missing, canConfirm};
}

// Check one proposed purchase against the current basket.
export function canSelect(data, selected, id) {
  const control = data.controls.find(item => item.id === id);
  if (!control) return {ok: false, reason: 'UNKNOWN_CONTROL'};
  if (selected.includes(id)) return {ok: false, reason: 'ALREADY_SELECTED'};
  if (control.cost > selectionSummary(data, selected).left) {
    return {ok: false, reason: 'OVER_BUDGET'};
  }
  return {ok: true, reason: null};
}
