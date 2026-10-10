# Ghassan's checkpoint handoff

Import all required functions from `src/checkpoint/checkpoint.mjs`.
This module is pure: no DOM, networking, state mutation or internal clock reads.

## Shared config
Imports `POINTS_PER_SECURE_ANSWER` and `CHECKPOINT_SECONDS` from Tejas's `src/config.mjs`.
The current dev config uses 2 points and 120 seconds; the engine currently requests 2 questions.
This module supports the requested four-question sets without editing the engine or its config:

| Phase | Four-question selection |
| --- | --- |
| phase_1 | Q01, Q02, Q29, Q03 |
| phase_2 | Q09, Q10, Q37, Q11 |
| phase_3 | Q15, Q16, Q12, Q08 |
| phase_4 | Q22, Q30, Q32, Q31 |

Q31 is a general question permitted by the brief at any checkpoint.
With count 2 or 3, the picker mixes easier and harder tiers. Picks are deterministic even if the bank order differs.
Question wording, options, answers and explanations remain unchanged.

## API
- `pickQuestions(bank, phaseId, count)`: exactly count question objects. bank may be the bank object or its questions array. Invalid counts throw.
- `markAnswer(question, choice)`: exactly `{correct, points, explanation}`. Wrong/null/undefined choices score zero.
- `startTimer(now)`: `{startedAt: now, pausedAt: null, pausedMs: 0}`.
- `timeLeft(timer, now)`: milliseconds remaining, never negative.
- `pauseTimer(timer, now)` / `resumeTimer(timer, now)`: new objects, never change the original.
- `isExpired(timer, now)`: boolean, true at the exact deadline. Paused time does not count.
- `teamBehaviourPoints(answers, players)`: sum of per-question averages, preserving fractional points.

now is supplied by the engine/server in milliseconds; use the same clock throughout.

Answers follow TEAM_PLAN.md: `{phase, questionId, player, choice, correct}`.
Pass only the current phase's answers.
players is the eligible answering players, either IDs or objects with an id.
Missing player answers contribute zero when a roster is provided.
Without a roster, submitted answers are averaged per question, matching the current reducer stand-in.
Single-screen records use player:null. Duplicate submissions throw.
No roster means an entirely silent player cannot be inferred; multiplayer must pass its roster.

## Integration for Tejas
Replace the stand-ins in engine/state.mjs with imports from this file.
Leave phase transitions, answer locking, timeout handling and production UI in the engine.
When timeout occurs, use `markAnswer(question, null)` to obtain zero points and the unchanged explanation.
Call teamBehaviourPoints with the eligible roster so unanswered players count as zero.
To show four questions, change QUESTIONS_PER_CHECKPOINT to 4 in your config; Ghassan has not edited that owned file.
Four correct answers score 4 * POINTS_PER_SECURE_ANSWER.

## Tests and status
`npm test` includes `tests/checkpoint-contract.test.mjs`.
The tests cover deterministic count and difficulty, unchanged content, marking shape, config-driven values,
immutable timers, exact expiry, pause cycles, team averages and missing answers.

The Ghassan-br branch was not merged with dev because merge approval was declined.
It requires dev's src/config.mjs when integrated. Validation was run in a separate copy of dev with this module overlaid.

## AI use
Codex assisted with implementation, tests and this handoff. Team review is required before submission.
