# dev-test test audit

> **Status at hand-in (11 October 2026): all six defects below are fixed** (commit `9f0e538`, "Fix the defects found by the audit tests", and `412b7c5` for the `.git` leak). The audit tests stay in the suite as regression tests. The full suite on `main` now runs **323 tests: 323 passed, 0 failed, 0 skipped**. The report below is kept as it was written, as a record of what the audit found.

Date: 10 October 2026. Branch: `dev-test`. Source commit: `e18c25c1fc32a17b62029c663db11c86c3c1dd08`.
Environment: Windows, Node v26.6.0, Codex in-app browser.

## Result

The original suite passed all 168 tests. This audit adds 100 tests in six files. The expanded suite ran **268 tests: 261 passed, 7 failed, 0 skipped, 0 cancelled** in approximately 122 seconds. The seven failures expose six distinct defects. They remain enabled so fixes can be checked; no assertion was weakened to make the suite green.

Only test files and this report/log were added. No production source, configuration, dependencies, Git history, or remote branches were changed. Nothing was committed or pushed.

## Run it

```powershell
npm test
node --test --experimental-test-coverage
```

The real server expiry test intentionally waits about two minutes. Other tests use explicit timestamps or mocked clocks. HTTP integration tests start an isolated server on an OS-assigned port and stop it afterward. There are no new dependencies.

`audit-results.log` contains the full expanded-suite output, assertions, source locations and coverage table. Exit code 1 is expected until the reported defects are fixed. The first sandboxed attempt to run the baseline was blocked by Windows `spawn EPERM`; rerunning with process permission succeeded. That initial environment error is not counted as a product defect.

## New test files

| File | Tests | Pass | Fail | Scope |
|---|---:|---:|---:|---|
| audit-engine-helpers.test.mjs | 14 | 14 | 0 | Actions, selection, budget, categories, scores and phases |
| audit-checkpoint-flow.test.mjs | 15 | 15 | 0 | All 40 question answers, selection, timer boundaries, frozen inputs, complete game and reset |
| audit-load-data.test.mjs | 14 | 14 | 0 | Node/browser loader paths and malformed scenario/question data |
| audit-ui.test.mjs | 27 | 26 | 1 | Rendered text, permissions, personal answers, explanations, assets, score display and advice |
| audit-server.test.mjs | 16 | 11 | 5 | Room rules, HTTP, SSE, complete shared game, actual two-minute automatic timeout |
| audit-client.test.mjs | 14 | 13 | 1 | Seat persistence, storage failures, requests, reconnect and disconnect callbacks |

## Confirmed defects

### 1. High: the game server serves Git metadata

- Source: `src/server/server.mjs:113` (static-file handler); it binds all network interfaces at line 216.
- Reproduction: request `GET /.git/HEAD` from the local game server. It returns HTTP 200. The test checks the status and does not dump repository metadata.
- Expected: 403 or 404; only intended game assets should be served.
- Impact: anyone who can access the game server can request files under the Git directory. The path containment check prevents leaving the repository but does not distinguish public assets from private repository files.
- Test: `audit HTTP: Git internals must not be served to a game participant`.
- Suggested owner: Vansh (server). Restrict static serving to intended public files/directories and deny Git/dotfile paths.

### 2. High: missed multiplayer answers do not count as zero in team averages

- Sources: `src/checkpoint/checkpoint.mjs:56`, `src/engine/state.mjs:92`; the room layer owns the player roster.
- Reproduction: have three players join before a checkpoint. One player answers a question securely; the other two never answer. Expire the checkpoint.
- Actual: that question contributes **2 points**. Expected under the team's average-per-question and missed-answer-zero rule: **2/3 of a point**.
- Impact: abstaining can earn the team more points than attempting a question and getting it wrong. Behaviour-based wall strength also receives the inflated result.
- Test: `audit room: an unanswered player still counts in the team average at timeout`.
- Suggested owners: Ghassan + Tejas + Vansh. Define the eligible roster for each checkpoint (including the policy for late joiners/disconnections) and average over that roster.

### 3. Medium: the night report can recommend an invalid control plan

- Source: `src/ui/nightSummary.mjs:39`.
- Reproduction: choose `P2,D1,D5,R1,R2`, a valid plan with GBP50,000 remaining. Read the night report's swap suggestion.
- Actual: it recommends exchanging `P2` for `D4`. `P2` is the only Prevent control, so following the recommendation makes confirmation fail with `Missing: Prevent`.
- Expected: any recommended plan must fit the budget and retain Prevent, Detect and Respond.
- Test: `night report swap recommendation preserves the required control categories`.
- Suggested owner: Vansh, with Mo reviewing the advice. Validate the complete replacement basket before suggesting a swap.

### 4. Medium: null JSON request bodies return internal-server errors

- Sources: `src/server/server.mjs:147` and `:153`.
- Reproduction: POST JSON `null` to a known room's `/join` and `/actions` endpoints.
- Actual: both return HTTP 500 because the handler destructures a null value. Expected: a controlled HTTP 400 input-validation error.
- Tests: `audit HTTP: a null join body is a client error, not an internal server error`; equivalent null-actions test.
- Suggested owner: Vansh. Validate a non-null object before destructuring. Invalid JSON syntax and oversized requests already pass their tests.

### 5. Low: the join API accepts non-string player names

- Source: `src/server/rooms.mjs:31`.
- Reproduction: POST a join body containing `{"name":{"anything":true}}`.
- Actual: HTTP 200 and a seat named `[object Object]`. Expected: HTTP 400 without creating a seat.
- Test: `audit HTTP: a non-string player name is rejected before creating a seat`.
- Suggested owner: Vansh. Reject non-string names before trimming. The normal browser form sends strings, so this is API robustness rather than a normal-form blocker.

### 6. Low: a lost-seat callback can fire more than once

- Source: `src/net/client.mjs:67`; the once-only contract is documented at line 50.
- Reproduction: deliver repeated terminal SSE errors whose seat check returns 403.
- Actual: `onLost()` runs twice. Expected: once.
- Test: `audit client: a permanently lost seat is cleared and reports onLost once`.
- Suggested owner: Vansh. Mark the connection lost/closed before invoking the callback; guard concurrent or queued errors.

## Automated checks that passed

- Budget boundaries, duplicate/unknown/already-in-place controls, required categories, and locked selections.
- Every one of the 64 fixture baskets and independent optimum-score calculations.
- Selection order independence and supplied scenario scoring examples.
- All 40 questions tested against all four answer options; original explanations preserved.
- Four deterministic questions per phase, difficulty order and general-question fallback.
- Pause/resume cycles, exact expiry boundary, non-negative countdown, unchanged inputs and separate behaviour/control scores.
- Full reducer game: all four phases, 16 secure answers, debrief totals, outcome and reset.
- Loader validation: missing or malformed scenario and question data, bad options/correct answers/explanations and unknown phase mappings.
- Multiplayer roles, host-only actions, cross-room token isolation, token-free views and server-owned timestamps/player identity.
- Concurrent purchases: exactly one succeeds when the shared budget can afford only one.
- Complete real HTTP multiplayer game with three players and 48 answer records; correct averaging when all players answer; reset preserves seats.
- Live SSE synchronization and refresh recovery.
- Actual server expiry sweep ends a checkpoint after two minutes, with unanswered questions worth zero when nobody answers.
- Request-size limits, malformed JSON syntax, missing routes, methods and static MIME/HEAD behavior.
- UI personal-answer separation, host/phone permissions, correct/wrong/missed feedback, source explanations, literal text handling and configured asset existence.

## Browser verification

Browser checks used a separate local dev-test server at port 8189, not the older NightShift demo at 8080.

- Single-player home, blank-name validation, valid name and initial budget loaded successfully.
- Selected `P3,D3,R1`; category checklist, remaining budget and lock button updated correctly.
- Played through the four story/reveal/checkpoint phases; phase labels and cumulative control scores updated.
- Secure and wrong answers showed explanations and separate behaviour points. Pause held at the same remaining value across observations, and resume restarted the clock.
- Keyboard Enter dismissed the weak-defence explanation dialog.
- Phone-width spot check at 390 x 844 showed no horizontal document overflow. This is a limited responsive check, not a complete layout/accessibility audit.
- Multiplayer host plus three separate browser player tabs joined as Prevent, Detect and Respond. Purchases updated the host's budget live; only the host could lock the plan and advance the story.
- Reloading the Prevent player's tab restored its seat, selected control and current shared state.
- Answering on one player tab left the other player's question enabled. The host showed participation separately and could not answer for players.

- Let the final single-player checkpoint expire naturally: all four unanswered questions displayed `Not answered in time: 0 points`, with answers disabled and explanations available.
- Final single-player outcome displayed control score **14**, behaviour **2**, total **16**, matching the chosen controls and answers. The night report and phase debrief rendered.
- `Play again` restored the full GBP3m budget, empty basket, all three category requirements and a disabled lock button.
- No warning/error console entries were captured in the single-player, host or first-player tabs during these flows. This is not proof that every browser/error path is clean.

## Coverage and limits

Node's coverage table reports **79.45% lines, 82.92% branches, 69.02% functions for the files it measured**. This is not whole-project browser coverage: browser entry points and child-server execution are not comprehensively represented, and query-string-isolated client imports affect aggregation.

- Checkpoint module, action validation, loader, phases, scores, selection and supplied control scorer: 100% measured lines/branches/functions.
- Engine reducer: 99.33% lines, 98.63% branches, 100% functions.
- Room logic: 100% lines, 96.97% branches, 100% functions.
- Browser animation/bootstrap paths and some UI branches remain unmeasured by Node; the UI unit tests use a small DOM recorder and cannot prove pixel layout or screen-reader behavior.
- Not tested on physical phones, multiple browser engines, the actual venue network, long-duration load, or with a screen reader. There was no third-party security scan or exhaustive security audit.
- No claim that all possible combinations or defects are covered. Existing reported bugs must be fixed and this suite rerun before declaring a clean result.

## Other observations for hand-in

- `OUR_GAME.md` still names the old theme/game and claims multiplayer tests are skipped until an obsolete module exists. It needs updating to the current Zero Hour build and actual results.
- `src/main.mjs` still uses its own loader instead of the validated shared `loadGameData` helper. Passing helper tests do not establish that single-player startup validates every question field.
- The current question picker is the team's newer tier-based implementation, not the fixed-ID implementation from earlier in the chat. It is integrated and config is four questions; earlier reports saying integration was missing are stale.
- `src/theme/theme.mjs` is a placeholder; optional separate heist theme modules are absent. The current screens use their built-in fallback. No completed optional theme is claimed tested.

## Recommended next actions

Fix server file exposure and multiplayer scoring first, then invalid report advice and request validation. Fix the lost-seat callback, update hand-in notes, rerun the complete suite, then repeat the host-plus-phones demo on the actual presentation network. Keep the failing tests as regression checks.
