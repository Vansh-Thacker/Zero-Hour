/**
 * Scoring for the controls players choose. This is the only game logic we supply.
 *
 *   validateData(data)               checks a scenario file. Returns true, or throws an Error that says what is wrong.
 *   scoreSelection(data, selection)  checks the chosen controls against the rules and works out the points for each phase.
 *
 * Players choose all their controls once, before the attack starts. They can spend up to the budget; they do not have to spend it all.
 * `selection` is the list of chosen control IDs:
 *   ['P5', 'P6', 'P7', 'D1', 'R1', 'R2', 'R4']
 *
 * Every chosen control scores its points in every phase. Your game reveals the phases one at a time.
 * This module keeps no state, does not score the behaviour questions and knows nothing about themes.
 */

const CATEGORIES = ['Prevent', 'Detect', 'Respond'];
const PHASES = 4;

const pounds = amount => '£' + amount.toLocaleString('en-GB');
const isWholeNumber = value => Number.isSafeInteger(value) && value >= 0;
const isText = value => typeof value === 'string' && value.trim() !== '';

function check(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateData(data) {
  check(data && typeof data === 'object', 'The scenario must be an object.');
  check(isWholeNumber(data.budget) && data.budget > 0, 'budget must be a whole number of pounds above zero.');
  check(Array.isArray(data.controls) && data.controls.length > 0, 'controls must be a list with at least one control.');
  check(Array.isArray(data.phases) && data.phases.length === PHASES, `phases must be a list of exactly ${PHASES} phases.`);

  const controlIds = new Set();
  for (const control of data.controls) {
    check(control && typeof control.id === 'string' && control.id !== '', 'Every control needs an id.');
    check(!controlIds.has(control.id), `Two controls share the id "${control.id}".`);
    controlIds.add(control.id);
    check(typeof control.name === 'string' && control.name !== '', `Control "${control.id}" needs a name.`);
    check(CATEGORIES.includes(control.category), `Control "${control.id}" has the category "${control.category}". It must be Prevent, Detect or Respond.`);
    check(isWholeNumber(control.cost) && control.cost > 0, `Control "${control.id}" needs a cost that is a whole number of pounds above zero.`);
    check(control.cost <= data.budget, `Control "${control.id}" costs ${pounds(control.cost)}, which is more than the whole budget of ${pounds(data.budget)}.`);
  }
  for (const category of CATEGORIES) {
    check(data.controls.some(control => control.category === category), `There must be at least one ${category} control.`);
  }

  const phaseIds = new Set();
  for (const phase of data.phases) {
    check(phase && typeof phase.id === 'string' && phase.id !== '', 'Every phase needs an id.');
    check(!phaseIds.has(phase.id), `Two phases share the id "${phase.id}".`);
    phaseIds.add(phase.id);
    for (const field of ['title', 'story', 'local_time']) {
      check(isText(phase[field]), `Phase "${phase.id}" needs a ${field}.`);
    }
    check(phase.scores && typeof phase.scores === 'object' && !Array.isArray(phase.scores), `Phase "${phase.id}" needs a scores object.`);
    for (const id of controlIds) {
      check(isWholeNumber(phase.scores[id]), `Phase "${phase.id}" needs a score for control "${id}": a whole number, zero or above.`);
    }
    for (const id of Object.keys(phase.scores)) {
      check(controlIds.has(id), `Phase "${phase.id}" has a score for "${id}", which is not a control.`);
    }
  }
  return true;
}

export function scoreSelection(data, selection) {
  validateData(data);
  check(Array.isArray(selection), 'The selection must be a list of control IDs.');

  const controlsById = new Map(data.controls.map(control => [control.id, control]));
  const chosen = [];
  let spent = 0;
  for (const id of selection) {
    check(controlsById.has(id), `"${id}" is not a control.`);
    const control = controlsById.get(id);
    check(!chosen.includes(id), `${id} ${control.name} is chosen twice. Each control can only be chosen once.`);
    chosen.push(id);
    spent += control.cost;
  }

  check(spent <= data.budget, `Over budget: ${pounds(spent)} chosen, ${pounds(data.budget)} available.`);

  const missing = CATEGORIES.filter(category => !chosen.some(id => controlsById.get(id).category === category));
  check(missing.length === 0, `Choose at least one Prevent, one Detect and one Respond control. Missing: ${missing.join(', ')}.`);

  const phases = data.phases.map(phase => {
    const contributions = chosen.map(id => ({id, points: phase.scores[id]}));
    return {phaseId: phase.id, score: contributions.reduce((sum, item) => sum + item.points, 0), contributions};
  });

  return {
    chosen: [...chosen],
    budget: data.budget,
    spent,
    unspent: data.budget - spent,
    phases,
    total: phases.reduce((sum, phase) => sum + phase.score, 0),
  };
}
