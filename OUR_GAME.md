# Our game

Fill this in and commit it with your code by 12:00 on Sunday. Short answers are fine.

There is a Word version, `OUR_GAME.docx`, if you prefer. Fill in one or the other, not both.

> **Draft, kept up to date by Mo.** Lines marked **TODO** are not settled yet. Every TODO must be gone by Sun 11:30.

## Team

- Team name: Team 20
- Team members: Tejas (engine and integration), Rayyan (screens and accessibility), Ghassan (checkpoints and questions), Vansh (Incident Room theme and multiplayer), Mo (tests, debrief and hand-in)
- Name of our game: **Zero Hour** (set once, as `GAME_NAME` in `src/config.mjs`)
- Name of our fictional business: **Lochside Energy** (set once, as `BUSINESS_NAME` in `src/config.mjs`)
- Where each name is set, so it can be changed (file and line): `src/config.mjs`, line 3 (`GAME_NAME`) and line 4 (`BUSINESS_NAME`). Nothing else in the code holds either name; the page reads them from there.

## What we built

- Level reached (Foundation, Extend or Stretch): **TODO** (aiming for Stretch)
- Theme (Incident Room, Endurance Race, Map Room, our own, or none): Incident Room
- Stretch capability, if any: Multiplayer (**TODO**: confirm it works before claiming it)

## How to run it

The exact steps from a fresh copy of the repository, including anything that needs installing.

1. Install Node.js version 20 or later from nodejs.org. Nothing else needs installing: no packages, no account, no key.
2. Open a terminal in the repository folder (the one with `package.json`).
3. Run `npm test`. It should finish with `fail 0`.
4. Run `npm start` and open http://127.0.0.1:8080/index.html. Press Ctrl+C in the terminal to stop.

On Windows PowerShell, if `npm` is blocked with "running scripts is disabled", use `npm.cmd test` and `npm.cmd start` instead. To use another port in PowerShell: `$env:PORT=3000; npm.cmd start`.

**TODO** (Vansh): add the steps for multiplayer, such as how to start the shared server and open a second window.

## A walkthrough that works

One route through the game that we know works, step by step. We will follow it.

**TODO**: write this against the finished build on Saturday evening and play it through twice before handing in.

1.
2.

## How it is built

- How the code is organised: one folder per job.
  - `1-foundation/starter/controls.mjs` is the supplied scoring module. We have not changed it.
  - `src/engine/state.mjs` holds the game state and the only function that changes it, `reduce(data, state, action)`.
  - `src/checkpoint/` picks questions, marks answers and runs the timer. These are pure functions, and the time is passed in.
  - `src/debrief/debrief.mjs` builds the end-of-game review from the final state.
  - `src/ui/` draws the screens and `src/theme/` draws the Incident Room. Both only read state and send actions.
  - `src/config.mjs` is the one place for names and tunable numbers.
- Where the game's state is kept (the budget, what is owned, the answers given): in one state object, made by `createInitialState()` in `src/engine/state.mjs`. It holds `stage`, `phase`, `selected`, `confirmed`, `result` (the scoring module's output), `checkpoint`, `behaviourPoints` (one number per phase) and `answers`. Every action goes through `reduce`, which returns a new state and never changes the old one.
- How the theme is kept separate from the scoring: the theme is given the state and draws it. It never calls the scoring module and never changes state. Scores come only from `scoreSelection` in the supplied module. A test checks that the debrief's scores always equal the engine's.
- One design decision we made, what else we considered, and why we chose it: **TODO**. Candidate: a single pure `reduce` function for all state changes, rather than letting each screen change state itself. It means the whole game can be played in a test without a browser, and invalid actions (answering outside a checkpoint, changing the choice after Confirm) can be refused in one place.

## How the questions change the game

**TODO** (Ghassan): which questions appear in each phase and why.

- At the end of each of the four phases there is a behaviour checkpoint lasting at most 2 minutes (`CHECKPOINT_SECONDS` in `src/config.mjs`). The facilitator can pause the timer.
- A secure (correct) answer earns `POINTS_PER_SECURE_ANSWER` points (2, in `src/config.mjs`). A wrong answer earns nothing. When time runs out, unanswered questions earn nothing, but their explanation is still shown.
- After each answer the game shows the explanation, word for word from `questions.json`.
- Behaviour points are shown separately from the control score. After phase 4 the two are added together for the final outcome.

## Tests

- What our tests cover: see the test map below. Every rule in the brief has at least one test.
- How to run them: `npm test` (or `npm.cmd test` in Windows PowerShell). The multiplayer tests are skipped until `src/multiplayer/room.mjs` exists, and then run on their own.
- One test we are glad we wrote, and why: "two picks that spend the last of the budget at once: only the first goes through" (`tests/multiplayer.test.mjs`). It catches the bug that is easiest to miss in a shared game: two devices each checking the budget before either purchase is saved, so the team ends up over budget. We broke the budget rule on purpose to check the test fails. **TODO**: swap for another if the team prefers.

### Test map: which test covers which rule

| Rule from the brief | Test file | Test |
|---|---|---|
| Budget of £3m, cannot go over | `1-foundation/tests/controls.test.mjs` | rejects a selection that is over budget; allows a selection that spends the budget exactly |
| At least one Prevent, Detect and Respond | `1-foundation/tests/controls.test.mjs`, `tests/engine.test.mjs` | rejects a selection without all three categories; confirming without a Respond control shows an error and stays unlocked |
| Each control chosen once | `1-foundation/tests/controls.test.mjs`, `tests/engine.test.mjs` | rejects a control chosen twice; selecting the same control twice keeps it once |
| Can change the choice until Confirm, then fixed | `tests/engine.test.mjs` | the choice cannot change after confirming |
| Already-in-place controls score nothing | `tests/debrief.test.mjs` | the three controls already in place are listed with the reason they score nothing |
| Every chosen control scores in every phase | `1-foundation/tests/controls.test.mjs` | every chosen control scores in every phase |
| Phase scores shown match the scoring module | `tests/debrief.test.mjs` | each phase shows the same control points as the engine; the points shown for each chosen control match the engine |
| Behaviour points kept separate, then added | `tests/debrief.test.mjs` | behaviour points are kept separate and then added to make the total |
| Explanations kept exactly as written | `tests/debrief.test.mjs` | each question is shown with its explanation word for word from questions.json |
| Unanswered questions score nothing | `tests/debrief.test.mjs` | an unanswered question is shown as unanswered, not as wrong |
| Debrief: what helped and what was missed | `tests/debrief.test.mjs` | "missed" is never a control the player chose; "missed" is the highest-scoring control not chosen in that phase |
| Reset starts a new game | `tests/engine.test.mjs` | reset starts a new game |
| Checkpoint: right answer earns points, wrong earns 0, timeout earns 0, pause stops the clock | `tests/checkpoint.test.mjs` | **TODO** (Ghassan) |
| A whole game can be played through `reduce` | `tests/engine.test.mjs` | **TODO** (Tejas/Mo, once `next` is built) |
| Multiplayer: wrong room code, rejoining, joining after Confirm | `tests/multiplayer.test.mjs` | a wrong room code is refused; a player who drops out and rejoins sees the game as it is now; someone joining after Confirm sees the locked choice |
| Multiplayer: two picks at once stay within budget | `tests/multiplayer.test.mjs` | two picks that spend the last of the budget at once: only the first goes through |
| Multiplayer: picks limited to the player's role | `tests/multiplayer.test.mjs` | a player cannot pick a control outside their role |
| Multiplayer: every purchase still checked by the scoring rules | `tests/multiplayer.test.mjs` | confirm is refused while a category is missing; a confirmed shared game scores exactly what the scoring module gives |

## What does not work yet

Known problems and anything unfinished.

**TODO**: update this every evening. As of Saturday afternoon:

- Moving through the phases (`next`) and the checkpoints are not wired into the engine yet.
- The screens, the Incident Room theme and the multiplayer server are in progress.
- The game and business names are still placeholders.

## Where AI tools helped

Which tools we used and for what. What we checked or changed ourselves.

- Claude (Anthropic): helped explain the brief, plan the work split and write the debrief module and its tests, the multiplayer tests and this hand-in note. We ran every test ourselves against the real data and the supplied scoring module, and checked that the multiplayer tests fail when the budget and role rules are broken.
- **TODO**: each team member adds their own line: which tool, for what, and what they checked or changed.

## Credits

Artwork, libraries and anything else we did not make.

- The scoring module, scenario, questions and test fixture: supplied by ScottishPower in the challenge pack.
- **TODO** (Vansh): any artwork used from `2-extend/artwork/`, and its licence from `2-extend/licences/`.
