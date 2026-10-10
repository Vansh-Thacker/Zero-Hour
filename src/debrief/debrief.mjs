// Debrief: explains the final outcome of a game, phase by phase. Owner: Mo.
//
// buildDebrief(game, state)
//   game  = { challenge, questions }   the loaded challenge.json and questions.json
//   state = the final game state (see TEAM_PLAN.md "State shape")
//
// Pure function: no DOM, no randomness, never changes its inputs. The outcome screen and the
// theme only read what it returns. Scores are taken from the scoring module's result
// (state.result), never worked out again here, so the debrief always matches the engine.

const sum = list => list.reduce((total, n) => total + (Number(n) || 0), 0);

/** Accept the data under the names the team might use. */
function unpack(game) {
  const challenge = game?.challenge ?? game?.data ?? game?.scenario;
  const bank = game?.questions ?? game?.bank;
  if (!challenge?.phases || !challenge?.controls) throw new Error('buildDebrief needs game.challenge (the loaded challenge.json).');
  const questions = Array.isArray(bank) ? bank : bank?.questions ?? [];
  return { challenge, questions };
}

/** The engine gives contributions as [{id, points}]. Turn them into {id: points}. */
const contributionMap = phaseResult =>
  Object.fromEntries((phaseResult?.contributions ?? []).map(c => [c.id, c.points]));

function answerStatus(answer) {
  if (answer.choice == null) return 'unanswered';
  return answer.correct ? 'secure' : 'not secure';
}

function phaseSummary({ controlPoints, helped, missed }) {
  const parts = [`Your controls scored ${controlPoints} point${controlPoints === 1 ? '' : 's'} in this phase.`];
  if (helped.length) parts.push(`${helped[0].name} did the most (${helped[0].points}).`);
  else parts.push('None of your controls helped here.');
  if (missed) parts.push(`${missed.name}, which you did not choose, would have added ${missed.points}.`);
  return parts.join(' ');
}

export function buildDebrief(game, state) {
  const { challenge, questions } = unpack(game);
  const questionById = new Map(questions.map(q => [q.id, q]));
  const controlById = new Map(challenge.controls.map(c => [c.id, c]));
  const chosen = state.result?.chosen ?? state.selected ?? [];
  const chosenSet = new Set(chosen);
  const phaseResults = state.result?.phases ?? [];
  const behaviour = state.behaviourPoints ?? [];

  const phases = challenge.phases.map((phase, i) => {
    const earned = contributionMap(phaseResults[i]);
    const named = id => ({ id, name: controlById.get(id)?.name ?? id, points: earned[id] ?? phase.scores[id] ?? 0 });

    const helped = chosen.map(named).filter(c => c.points > 0)
      .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
    const scoredNothing = chosen.map(named).filter(c => c.points <= 0);

    // The best control the player could have chosen but did not. Ties go to the lowest ID.
    const best = Object.entries(phase.scores)
      .filter(([id, points]) => points > 0 && !chosenSet.has(id) && controlById.has(id))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const missed = best ? { id: best[0], name: controlById.get(best[0]).name, points: best[1] } : null;

    const answers = (state.answers ?? []).filter(a => a.phase === i).map(a => {
      const q = questionById.get(a.questionId);
      return {
        questionId: a.questionId,
        question: q?.question ?? '',
        choice: a.choice ?? null,
        correctAnswer: q?.correct ?? null,
        correctText: q?.options?.[q.correct] ?? '',
        status: answerStatus(a),            // 'secure' | 'not secure' | 'unanswered'
        explanation: q?.explanation ?? '',  // word for word from questions.json
      };
    });

    const controlPoints = phaseResults[i]?.score ?? sum(helped.map(c => c.points));
    return {
      phaseId: phase.id,
      title: phase.title,
      localTime: phase.local_time,
      story: phase.story,                   // what happened
      controlPoints,
      behaviourPoints: behaviour[i] ?? 0,
      helped,
      scoredNothing,
      missed,
      answers,
      summary: phaseSummary({ controlPoints, helped, missed }),
    };
  });

  const controlScore = state.result?.total ?? sum(phases.map(p => p.controlPoints));
  const behaviourPoints = sum(behaviour);

  return {
    controlScore,
    behaviourPoints,
    total: controlScore + behaviourPoints,
    spent: state.result?.spent ?? null,
    unspent: state.result?.unspent ?? null,
    alreadyInPlace: (challenge.already_in_place ?? []).map(c => ({ name: c.name, why: c.why_no_score ?? '' })),
    phases,
  };
}
