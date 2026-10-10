# Zero Hour

A cyber security awareness game for ScottishPower's StrathHack 2026 challenge.

A crew is planning to break into a fictional energy company overnight. You have £3,000,000 to put cyber defences in place before they strike at Monday 16:40. Then the attack plays out in four phases until 06:30 on Tuesday. After each phase you see how your defences did, and you answer behaviour questions against the clock.

The rules of the challenge are in `BRIEF.html`. Our hand-in note is `OUR_GAME.md`.

## Run it

You need Node.js 20 or later. Nothing else needs installing: no packages, no account, no internet.

Open a terminal in this folder and run:

```
npm start
```

Then open **http://127.0.0.1:8080** in your browser. It opens Zero Hour (`/index.html`). The same server runs single player and multiplayer, so players on the same Wi-Fi can join from their phones. Press Ctrl+C in the terminal to stop the server.

If port 8080 is in use, choose another: `set PORT=3000 && npm start` (Windows) or `PORT=3000 npm start` (macOS, Linux), then open http://127.0.0.1:3000.

To run the tests:

```
npm test
```

It should finish with `fail 0`.

## How to play

1. **Plan.** Pick defences from the 18 controls. You need at least one Prevent, one Detect and one Respond control, and you can spend up to £3,000,000. Three controls (firewall, vulnerability scanning, penetration testing) are already in place and score nothing.
2. **Lock the plan.** Once locked, it cannot change for the rest of the night.
3. **Each of the four phases:**
   - **Story:** what the attacker does, and when.
   - **Reveal:** each chosen control shows the points it scored in this phase.
   - **Behaviour checkpoint:** 2 questions in 2 minutes. A secure answer earns 2 points; a wrong or missed answer earns none, and the explanation is always shown. The facilitator can pause the timer.
4. **Outcome.** The control score, behaviour points and total are shown separately, followed by a debrief of each phase: what helped, what was worth considering, and the questions answered.

## How it is built

The game state lives in one place, the engine. Screens only read it and send actions back. The theme only reads it and never changes scores.

| Folder or file | What it does | Owner |
|---|---|---|
| `src/config.mjs` | The one place for the game name, business name and tunable numbers | Tejas |
| `src/engine/state.mjs` | The game state and every action that changes it: picking, confirming, phases, answers, the checkpoint timer | Tejas |
| `src/engine/selection.mjs` | Budget and category helpers for a selection | Rayyan |
| `src/checkpoint/` | Choosing and marking behaviour questions | Ghassan |
| `src/debrief/debrief.mjs` | The end-of-game debrief | Mo |
| `src/ui/` | The screens: choose, story, reveal, checkpoint, outcome | Tejas |
| `src/theme/` | The heist theme (loaded only if present) | Vansh |
| `src/main.mjs` | Single-screen mode: loads the data and connects the engine to the screens | Tejas |
| `index.html` | The game's page | Tejas |
| `tests/` | Our tests | Mo and everyone |
| `TEAM_PLAN.md` | Who does what, the agreed state shape, and the timeline | |

**Changing the names.** The game name and the business name are set in `src/config.mjs` (`GAME_NAME`, `BUSINESS_NAME`). Change them there and nowhere else.

**Multiplayer** (Stretch) is in progress: a host screen and phones sharing one game. Its tests are in `tests/multiplayer.test.mjs` and are skipped until `src/multiplayer/room.mjs` exists.

## The scoring module

`1-foundation/starter/controls.mjs` is supplied by ScottishPower and we do not change it. Every control score in the game comes from it.

```js
import {validateData, scoreSelection} from './1-foundation/starter/controls.mjs';

const data = await (await fetch('./1-foundation/data/challenge.json')).json();
const result = scoreSelection(data, ['P3', 'D3', 'R1']);
// result.phases.map(p => p.score)  ->  [2, 5, 4, 3]
// result.total                     ->  14
// result.spent                     ->  350000
```

- **`validateData(data)`** checks a scenario file. It returns `true` or throws an error with a readable message.
- **`scoreSelection(data, ids)`** takes the list of chosen control IDs and returns `chosen`, `budget`, `spent`, `unspent`, `phases` (each with `phaseId`, `score` and `contributions`, the points each control earned) and `total`. It throws a readable error if the selection is over budget, chooses a control twice, uses an unknown ID, or misses a category. The game shows that message to the player as it is.

## The data files

`1-foundation/data/challenge.json`: the scenario.

| Field | Meaning |
|---|---|
| `budget` | £3,000,000 to spend on controls, once, before the attack |
| `controls` | 18 controls. Each has `id`, `name`, `category` (Prevent, Detect or Respond), `cost`, and `description`, `use_case` and `limitation` for players |
| `already_in_place` | Three controls the business already has. Shown, cannot be chosen, score nothing |
| `phases` | Four phases, each with `id`, `title`, `local_time`, `story` and `scores` (the points for every control in that phase) |

`1-foundation/data/questions.json`: 40 behaviour questions written by ScottishPower's Cyber team. Each has an `id` (Q01 to Q40), a `category`, a `tier` from 1 (Spot the Risk) to 4 (Pressure Test), the `question`, four `options`, the `correct` letter and an `explanation`. 16 have a `phase_id` that matches a phase of the story. The game shows every question, answer and explanation exactly as written.

## Tests

`npm test` runs every file ending `.test.mjs`.

| File | What it covers |
|---|---|
| `1-foundation/tests/` | The supplied scoring module and data files |
| `tests/engine.test.mjs` | Picking rules, confirming, the four phases, checkpoints, the timer, team-average points, and a full game checked against the scoring module |
| `tests/debrief.test.mjs` | The debrief |
| `tests/multiplayer.test.mjs` | Shared games: joining, roles, one shared budget, two picks at once, rejoining (skipped until multiplayer is built) |

## Artwork and credits

All artwork is from the ScottishPower challenge pack: the ScottishPower logo and brand colours (`1-foundation/artwork/brand/`), the 3D control and scenery renders (`2-extend/previews/`), and the incident and map artwork (`2-extend/artwork/`). Browse it all at http://127.0.0.1:8080/2-extend/artwork.html while the server runs. Licence notices are in `2-extend/licences/`.

The business, its systems and its people are fictional. The controls, prices and points are simplified for learning, and are not advice on what to buy.

## Team

Tejas, Rayyan, Ghassan, Vansh and Mo (team 20).
