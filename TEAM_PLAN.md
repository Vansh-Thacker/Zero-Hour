# Team plan

Who works on what, how the pieces fit, and when things are due. Read `BRIEF.html` for the rules.

## Roles at a glance

| Person  | Role                         | Owns                                                  |
|---------|------------------------------|-------------------------------------------------------|
| Tejas   | Game engine and integration  | `src/engine/`, `src/main.mjs`, `src/config.mjs`       |
| Rayyan  | Screens and accessibility    | `src/ui/`, `index.html`, `style.css`                  |
| Ghassan | Checkpoints and questions    | `src/checkpoint/`                                     |
| Vansh   | Incident Room theme          | `src/theme/`                                          |
| Mo      | Tests, debrief and hand-in   | `tests/`, `src/debrief/`, `OUR_GAME.md`, slides       |

Tejas and Rayyan share the engine and screens as a pair: Tejas leads the engine, Rayyan
leads the screens, and both can change either. Everyone else only edits files they own;
if you need a change in someone else's folder, ask them.

Everyone writes basic tests for their own module. Mo owns the overall test suite, writes
the edge-case and end-to-end tests, and keeps `npm test` at `fail 0`.

---

## Tejas: game engine and integration

**Goal:** the whole game runs end to end, driven by one state object.

Files: `src/engine/state.mjs`, `src/main.mjs` (new), `src/config.mjs`.

- [x] State shape, `createInitialState()`, actions `select`, `deselect`, `confirm`, `reset`
- [ ] Load `challenge.json` and `questions.json` in `src/main.mjs`, run `validateData`,
      show a readable error if loading fails
- [ ] `next` action: `story` → `reveal` → `checkpoint` → next phase's `story` …
      → after phase 4's checkpoint → `outcome`
- [ ] On entering `checkpoint`, call Ghassan's `pickQuestions()` and store the questions
      in state (`state.checkpoint = {questions, index, timer}`)
- [ ] Actions `answer`, `timeout`, `pause`, `resume`: call Ghassan's functions, record
      each answer in `state.answers`, add points to `state.behaviourPoints[phase]`
- [ ] Reject invalid actions safely (e.g. `answer` outside a checkpoint, `next` before
      confirm) by returning the state unchanged
- [ ] `dispatch(action)` in `main.mjs`: run `reduce`, then call Rayyan's `render(state)`
      and Vansh's `renderTheme(state)`
- [ ] Combine everyone's pull requests, run `npm test` after each one

**Done when:** a full game can be played in the browser with no theme, and a test plays
a whole game through `reduce` alone.

## Rayyan: screens and accessibility

**Goal:** every stage of the game has a clear, readable screen.

Files: `src/ui/*.mjs` (one file per screen), `index.html`, `style.css`.

- [ ] `render(state, data)` in `src/ui/app.mjs` picks the screen for `state.stage`
- [ ] **Choose screen:** all 18 controls grouped by Prevent / Detect / Respond with icon
      (`1-foundation/artwork/icons/`), name, cost and description; live budget left;
      a tick for each category covered; the 3 controls already in place shown separately
      as "already in place, scores nothing"; a Confirm button; `state.error` shown clearly
- [ ] **Story screen:** phase title, `local_time` and `story` from `challenge.json`
- [ ] **Reveal screen:** each chosen control and the points it scored this phase
      (`state.result.phases[n].contributions`), phase total, running control score
- [ ] **Checkpoint screen:** question, four options, time left, Pause/Resume button for
      the facilitator; after answering show correct/wrong **in words and an icon**, plus
      the explanation
- [ ] **Outcome screen:** control score, behaviour points, total, Mo's debrief, Reset button
- [ ] Accessibility: real `<button>`s, keyboard works, visible focus, text at least 16px,
      good contrast, nothing told by colour alone
- [ ] Game and business names come from `src/config.mjs` only

**Done when:** someone who has never seen the game can play it without help.

## Ghassan: checkpoints and questions

**Goal:** a behaviour checkpoint after every phase that follows the brief's rules.

Files: `src/checkpoint/checkpoint.mjs`, `tests/checkpoint.test.mjs`.

Pure functions only: no DOM, no `Date.now()` inside (the time is passed in), so they can be
tested.

- [ ] `pickQuestions(bank, phaseId, count)`: choose questions for the phase, using the
      questions' `phase_id` and the brief's table (phase 1: Q01–Q04, Q29 …). Decide
      fixed or random and write the rule down for Mo
- [ ] `markAnswer(question, choice)` → `{correct, points, explanation}`;
      `POINTS_PER_SECURE_ANSWER` from config, 0 if wrong
- [ ] Timer: `startTimer(now)`, `timeLeft(timer, now)`, `pauseTimer(timer, now)`,
      `resumeTimer(timer, now)`, `isExpired(timer, now)`. A checkpoint never takes more
      than `CHECKPOINT_SECONDS` (120)
- [ ] When time runs out, unanswered questions score 0, but their explanation is still
      shown
- [ ] Never change a question's wording, correct answer or explanation
- [ ] Optional, only if time allows: the harder-question-on-the-same-topic idea from the brief

**Done when:** Tejas can call these from the engine and the checkpoint tests pass.

## Vansh: Incident Room theme

**Goal:** the attack feels live, and what the room shows changes with the player's choices.

Files: `src/theme/theme.mjs`, `src/theme/*.css`. Read
`2-extend/themes/incident-room/README.md` and `reference.json` first.

- [ ] `renderTheme(state, data, element)`: reads state only, never changes scores
- [ ] One "channel" per phase: inbox (phase 1), incident chat (phase 2), call to the night
      desk (phase 3), morning update (phase 4), using `reference.json`
- [ ] Messages change with the choices: for each phase, look at which chosen controls
      scored points (`state.result.phases[n].contributions`) and show a matching message
      ("Email security quarantined 3 copies" vs "No email filtering: the message
      reached 40 inboxes")
- [ ] A status panel (e.g. systems OK / at risk / encrypted) that changes each phase
- [ ] Always show each control's real name next to any theme wording
- [ ] Use `2-extend/artwork/incident/` artwork if it helps; list it for Mo's credits
- [ ] Keep detection and prevention accurate: detecting something is not stopping it

**Done when:** two different control choices give visibly different incident rooms.

## Mo: tests, debrief and hand-in

**Goal:** the game is provably correct, the debrief teaches, and the hand-in is ready.

Files: `tests/*.test.mjs`, `src/debrief/debrief.mjs`, `OUR_GAME.md`, slides.

- [ ] `buildDebrief(data, bank, state)` → control score, behaviour points, total, and for
      each phase: what helped (chosen controls that scored), what was missed (the best
      unchosen control that phase), and the questions answered with their explanations
- [ ] Tests for the rules: over budget, missing a category, choosing twice, an
      already-in-place control can't be chosen, phase scores match `scoreSelection`
- [ ] Tests for checkpoints: right answer earns points, wrong earns 0, timeout earns 0,
      pause stops the clock, behaviour points kept separate from the control score
- [ ] One end-to-end test that plays a whole game through `reduce`
- [ ] Fill in `OUR_GAME.md` as features land (names and where they're set, how to run,
      walkthrough, design, tests, what doesn't work, AI use, credits)
- [ ] 8-minute pitch and a demo walkthrough that has been tested on the real build

**Done when:** `npm test` covers every rule in the brief and `OUR_GAME.md` is complete.

---

## How the pieces fit

```
challenge.json, questions.json
          │
     src/main.mjs ── dispatch(action) ──► engine/state.mjs (reduce)
          │                                   │ calls
          │                                   ├─ starter/controls.mjs (scoreSelection)
          │                                   └─ checkpoint/checkpoint.mjs
          ▼ new state
   ui/app.mjs render()   theme/theme.mjs renderTheme()   debrief/debrief.mjs
          (all three only read state)
```

- **Engine** owns the state and is the only code that changes it.
- **Checkpoint** and **debrief** are pure functions the engine and UI call.
- **UI** and **theme** read state and send actions with `dispatch(action)`.
- **Config** (`src/config.mjs`) is the one place for names and tunable numbers.

### State shape (agreed contract)

```js
{
  stage: 'choose' | 'story' | 'reveal' | 'checkpoint' | 'outcome',
  phase: 0,                 // 0-3, index into challenge.json phases
  selected: [],             // control IDs, e.g. ['P3', 'D3', 'R1']
  confirmed: false,         // true once the choice is locked
  result: null,             // output of scoreSelection() after confirm
  checkpoint: null,         // { questions, index, timer } during a checkpoint
  behaviourPoints: [0, 0, 0, 0],
  answers: [],              // { phase, questionId, choice, correct }
  error: null,              // readable message for the player
}
```

Change this only by agreement, and update this file when you do.

## Timeline

| When            | What                                                                    |
|-----------------|-------------------------------------------------------------------------|
| Sat 13:30–14:00 | Everyone: read this plan, agree the state shape and function names      |
| Sat 14:00–17:00 | Build own module. Tejas/Rayyan: choose → confirm → story → reveal on screen |
| **Sat 17:00**   | **Foundation end to end:** checkpoints wired in, outcome screen, reset  |
| Sat 17:00–19:00 | Theme wired in, debrief on outcome screen, tests filled out             |
| Sat 19:00–21:00 | Bug fixing, playtests swapping roles; be ready to show code to experts  |
| Sun 09:00–11:00 | Fixes from feedback, `OUR_GAME.md` final, rehearse pitch twice          |
| **Sun 11:30**   | **Code freeze.** Only fixes to the hand-in note after this              |
| **Sun 12:00**   | **Everything committed**                                                |

## Git workflow

- Everyone works on their own branch and opens a pull request into `main`.
- Before opening a pull request: pull the latest `main` into your branch, run `npm test`,
  and check the game still loads.
- Keep pull requests small and inside your own folder. Tejas merges them.
