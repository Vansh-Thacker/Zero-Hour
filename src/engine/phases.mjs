// Phase numbers in game state are zero-based.
export function currentPhase(data, state) {
  return data.phases[state.phase] ?? null;
}

export function isLastPhase(data, state) {
  return state.phase === data.phases.length - 1;
}

export function phaseLabel(state) {
  return `Phase ${state.phase + 1} of 4`;
}
