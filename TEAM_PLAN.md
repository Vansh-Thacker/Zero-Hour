# Team plan

Who works on what, how the pieces fit, and when things are due. Read `BRIEF.html` for the rules.

**The game:** *Zero Hour*, a heist-themed, multiplayer version of the challenge. The players
are the security team protecting a fictional energy company's data vault from a heist crew
led by "The Architect". Original theme, inspired by heist films: no names, characters,
costumes or music from any existing show.

## Roles at a glance

| Person  | Role                                   | Owns                                                        |
|---------|----------------------------------------|-------------------------------------------------------------|
| Tejas   | Game engine (reducer) and integration  | `src/engine/state.mjs`, `src/main.mjs`, `src/config.mjs`    |
| Rayyan  | Game engine (rules and helpers)        | `src/engine/actions.mjs`, `selection.mjs`, `scores.mjs`, `phases.mjs`, `loadData.mjs` |
| Ghassan | Checkpoints and questions              | `src/checkpoint/`                                           |
| Vansh   | Heist theme, multiplayer and screens   | `src/theme/`, `src/server/`, `src/net/`, `src/ui/`, `index.html` |
| Mo      | Tests, debrief and hand-in             | `tests/`, `src/debrief/`, `OUR_GAME.md`, slides             |

Only edit files you own. If you need a change in someone else's files, ask them.
Do not edit the root `style.css` (the brief and artwork pages use it) or anything in
`1-foundation/starter/`.

Everyone writes basic tests for their own module. Mo owns the overall test suite and keeps
`npm test` at `fail 0`.

---

## Tejas: game engine (reducer) and integration

**Goal:** the whole game runs end to end, driven by one state object, on one screen or many.

- [x] State shape, `createInitialState()`, actions `select`, `deselect`, `confirm`, `reset`
- [x] `next` action: story → reveal → checkpoint for each phase, then outcome
- [ ] `select` uses Rayyan's `canSelect()`, so over-budget and duplicate picks are rejected
      at once with a readable `state.error`
- [ ] `src/main.mjs`: load data with Rayyan's `loadGameData()`, `dispatch(action)` runs
      `reduce` then redraws. This is the **single-screen mode**
- [ ] Checkpoint actions `answer`, `pause`, `resume`, `timeout`, using Ghassan's functions.
      Answers record which `player` gave them (`null` in single-screen mode)
- [ ] Reject actions that are not allowed at this point by returning the state unchanged
- [ ] A test that plays a whole game through `reduce` alone
- [ ] Set `GAME_NAME = 'Zero Hour'` and the business name in `src/config.mjs`

**Done when:** a full game plays on one screen, and the server can drive the same engine.

## Rayyan: game engine (rules and helpers)

**Goal:** small pure functions that the reducer, server, screens and theme all share.
No page code (no `document`), so they work in the browser and on the server.
One commit per file, each with its own test file.

| # | File                       | What it does                                                   |
|---|----------------------------|----------------------------------------------------------------|
| 1 | `src/engine/actions.mjs`   | List of action types; `isValidAction(action)` checks shape, e.g. `select` has a string `id`. Actions may carry a `player` field, set by the server |
| 2 | `src/engine/selection.mjs` | `selectionSummary(data, selected)` → `{spent, left, categoriesCovered, missing, canConfirm}`; `canSelect(data, selected, id)` → `{ok, reason}`, rejecting unknown IDs, duplicates and **over budget straight away** |
| 3 | `src/engine/scores.mjs`    | `controlScoreSoFar(state)` (revealed phases only), `phaseScore(state, n)`, `bestPossiblePhaseScore(data, n)` for the vault meter, `behaviourTotal(state)`, `finalTotal(state)` |
| 4 | `src/engine/phases.mjs`    | `currentPhase(data, state)` → title, time, story; `isLastPhase(data, state)`; `phaseLabel(state)` → "Phase 2 of 4" |
| 5 | `src/engine/loadData.mjs`  | `loadGameData()` loads and checks `challenge.json` and `questions.json`, with a readable error. Works in the browser and in Node |

Do 1 and 2 first: Tejas's `select` and Vansh's server need them.
After these, help Vansh with the phone screens.

**Done when:** each file has passing tests and Tejas and Vansh are using them.

## Ghassan: checkpoints and questions

**Goal:** a behaviour checkpoint after every phase that follows the brief's rules.

Pure functions only: no page code, and the time is passed in (never `Date.now()` inside),
so the same code runs the shared timer on the server.

- [ ] `pickQuestions(bank, phaseId, count)`: questions for the phase, using `phase_id` and
      the brief's table (phase 1: Q01–Q04, Q29 …). Every player gets the same questions
- [ ] `markAnswer(question, choice)` → `{correct, points, explanation}`
- [ ] Timer: `startTimer(now)`, `timeLeft(timer, now)`, `pauseTimer(timer, now)`,
      `resumeTimer(timer, now)`, `isExpired(timer, now)`. Never more than 120 seconds;
      the host can pause
- [ ] Time runs out: unanswered questions score 0, explanation still shown
- [ ] `teamBehaviourPoints(answers, players)`: the **team average** per question (see decisions)
- [ ] Never change a question's wording, correct answer or explanation

**Done when:** Tejas can call these and the checkpoint tests pass.

## Vansh: heist theme, multiplayer and screens

**Goal:** *Zero Hour* playable by a host screen plus phones, built in stages.
The theme only reads state and never changes scores. Check the theme with the organisers
at the Saturday desk visit (the brief asks us to, because it is our own theme).

| Stage | What                                                                         |
|-------|------------------------------------------------------------------------------|
| 1     | `src/server/server.mjs`: serves the game files, creates a room (code like `VAULT-42`), players join and get a role. Host shows the code and who joined. `npm start` runs it |
| 2     | Shared choosing: Gatekeeper = Prevent, Watcher = Detect, Responder = Respond. The **server** checks the role, then calls the engine's `reduce`. Budget updates live (Server-Sent Events). Host confirms |
| 3     | Host screen heist: blueprint floor plan, crew route, defences light up when they score, vault integrity meter, heist clock (Mon 16:40 → Tue 06:30), messages from The Architect |
| 4     | Checkpoints on phones, using Ghassan's functions; shared timer the host can pause |
| 5     | Ending ("Heist foiled" / "The crew got away"), scores shown separately, Mo's debrief, reset |
| 6     | Multiplayer tests in `tests/multiplayer.test.mjs` (with Mo)                  |

Rules: real control name always next to the heist name, e.g. "Vault door seal (Email
security)". No flashing; respect `prefers-reduced-motion`. Feedback not by colour alone.
No npm packages; nothing online while the game runs.

Hard cases the server must handle: two players over budget at once (first wins, second gets
a clear message); same control twice; control outside the player's role; phone or host
refresh (state comes back); joining after confirm (can watch and answer, cannot choose);
wrong room code (clear error).

**Done when:** host plus two phones (or three browser tabs) play a full game together.

## Mo: tests, debrief and hand-in

- [ ] `buildDebrief(data, bank, state)`: for each phase, what helped (chosen controls that
      scored), what was missed (the best unchosen control), and the questions with explanations
- [ ] Tests for the rules: budget, categories, duplicates, already-in-place controls, phase
      scores match `scoreSelection` exactly
- [ ] Tests for checkpoints: right, wrong, timeout, pause, team average
- [ ] With Vansh: multiplayer tests (simultaneous picks, roles, rejoining)
- [ ] `OUR_GAME.md` kept up to date, including where AI tools helped
- [ ] 8-minute pitch and a demo walkthrough tested on the real build

---

## Decisions

| Question                              | Decision                                                      |
|---------------------------------------|---------------------------------------------------------------|
| Theme                                 | *Zero Hour* heist (our own). Confirm with organisers on Saturday |
| Who confirms the controls             | The host                                                      |
| Who answers checkpoint questions      | Every player, on their own phone                              |
| Behaviour points with many players    | Team average per question, so team size doesn't change the score. Each phone shows that player's own result |
| Player roles                          | Checked by the server, not the engine, so single-screen mode needs no roles |
| Vault integrity meter                 | Phase score ÷ best possible score for that phase              |
| Heist foiled or crew got away         | Rule to be set by Vansh and Mo, written in `OUR_GAME.md` and explained in the debrief. Detecting is not the same as stopping |
| Fallback                              | Single-screen mode must always work. If multiplayer isn't solid by **Sunday 10:00**, demo single-screen |

## How the pieces fit

```
challenge.json, questions.json
          │  loadGameData()
          ▼
 phones / host ── action ──► src/server/server.mjs ── role check ──► engine/state.mjs reduce()
     ▲                                                              │ uses
     │                                                              ├─ starter/controls.mjs
     │                                                              ├─ engine helpers (Rayyan)
     │                                                              └─ checkpoint/ (Ghassan)
     └──────── new state (Server-Sent Events) ◄─────────────────────┘
          theme/ and ui/ draw it (read only)       debrief/ explains it
```

Single-screen mode is the same picture without the server: `src/main.mjs` calls `reduce`
directly.

### Engine state shape (agreed contract)

```js
{
  stage: 'choose' | 'story' | 'reveal' | 'checkpoint' | 'outcome',
  phase: 0,                 // 0-3, index into challenge.json phases
  selected: [],             // control IDs, e.g. ['P3', 'D3', 'R1']
  confirmed: false,         // true once the host confirms
  result: null,             // output of scoreSelection() after confirm
  checkpoint: null,         // { questions, timer } during a checkpoint
  behaviourPoints: [0, 0, 0, 0],
  answers: [],              // { phase, questionId, player, choice, correct }
  error: null,              // readable message for the player
}
```

Rooms and players (code, names, roles, connections) live in `src/server/`, not in this
state. Change this shape only by agreement, and update this file when you do.

## Timeline

| When            | What                                                                      |
|-----------------|---------------------------------------------------------------------------|
| Sat afternoon   | Desk visit: check the *Zero Hour* theme with the organisers               |
| Sat 14:00–17:00 | Engine helpers and reducer; checkpoint functions; server stage 1          |
| **Sat 17:00**   | **Single-screen game works end to end**                                   |
| Sat 17:00–21:00 | Multiplayer stages 2–3; debrief; tests filled out                         |
| Sun 09:00–10:00 | Multiplayer stages 4–5. **10:00: go/no-go on multiplayer for the demo**   |
| Sun 10:00–11:30 | Fixes, `OUR_GAME.md` final, rehearse the pitch twice                      |
| **Sun 11:30**   | **Code freeze**                                                           |
| **Sun 12:00**   | **Everything committed**                                                  |

## Git workflow

- Branch from `dev`, work on your own branch, open a pull request into `dev`.
- Before a pull request: pull the latest `dev` into your branch and run `npm test`.
- Keep pull requests small and inside your own files.
- `dev` goes into `main` for the final hand-in only.
