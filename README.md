# Cyber Awareness challenge: technical start

Read `BRIEF.html` first. It says what to build and how it is judged. This file covers how to run the pack and what is in it.

## Run it

You need Node.js version 20 or later. Nothing else needs installing: no packages, no account, no key.

Open a terminal in this folder and run:

```
npm test
npm start
```

Run both from the pack folder, the one that holds this file. `npm test` should finish with `fail 0`. `npm start` runs a small local web server. Open http://127.0.0.1:8080 to see the demo page. If it shows a control score of 23, everything is working. Press Ctrl+C in the terminal to stop the server.

If port 8080 is in use, choose another: `PORT=3000 npm start` (macOS, Linux) or `set PORT=3000 && npm start` (Windows).

## What is in the pack

The pack is arranged by level. Each level folder has its own short README listing its files. Every guide written in Markdown (files ending `.md`) has a Word version next to it with the same name, ending `.docx`. They say the same thing.

| Folder or file | What it is |
|---|---|
| `BRIEF.html` | The challenge, the rules, the three levels and the judging |
| `OUR_GAME.md` | The note you fill in and hand in with your game. `OUR_GAME.docx` is the same note in Word, if you prefer |
| `1-foundation/` | The core game: demo page, scoring code and tests, scenario, questions, control icons and everyday pictures |
| `2-extend/` | Themes: a guide and starting file for each, the rest of the artwork, 3D models and scenes, and the artwork viewer |
| `3-stretch/` | A guide for each of the four capabilities |
| `package.json` | Tells Node.js how to run `npm start` and `npm test` |

The demo page is the quickest way to see how the pieces fit together. Its code, at the bottom of `1-foundation/demo.html`, is a worked example of loading each file.

We supply scoring for control purchases and nothing else. There is no finished game, no question scoring, no theme logic and none of the stretch capabilities. Those are yours.

## The scoring module

```js
import {validateData, evaluatePurchases} from './1-foundation/starter/controls.mjs';

const data = await (await fetch('./1-foundation/data/challenge.json')).json();
const result = evaluatePurchases(data, [['P3', 'D3', 'R1'], ['D4'], [], []]);
// result.rounds.map(r => r.score)  ->  [2, 8, 7, 6]
// result.total                     ->  23
```

It runs in the browser and in Node.

**`validateData(data)`** checks a scenario file. It returns `true` or throws an error with a readable message.

**`evaluatePurchases(data, purchases)`** takes the scenario and the locked rounds so far. `purchases` is a list of zero to four lists. Each inner list holds the IDs of the controls newly bought in that round. It returns:

- `rounds`: one entry per locked round, each with `phaseId`, `purchased`, `owned`, `available`, `spent`, `unspent`, `carryForward`, `score` and `contributions` (the points each owned control earned that round)
- `total`: the control score so far
- `complete`: `true` once four rounds are locked

It throws an error if a round breaks a rule: over budget, a control bought twice, an unknown ID, or a round ending without at least one Prevent, one Detect and one Respond control owned. The message says which round, which control and how much, for example `Round 2 is over budget: £1,300,000 spent, £1,150,000 available.` You can show it to the player as it is.

Things to know:

- It keeps no state. It works everything out again from the history you pass in, and never changes what you pass in. Your game holds the history.
- To test a basket before locking it, call the function with the history plus that basket. If it throws, show the message. If it does not, the basket is valid.
- Locking, moving between rounds, results screens and reset are yours to build.
- If you change or replace this module, your game must give exactly the same control scores, and your tests should show that it does. Keep the control score visible on its own if you add other scoring.

## The scenario file

`1-foundation/data/challenge.json` is the only file the scoring module needs.

| Field | Meaning |
|---|---|
| `round_budget` | Pounds released at the start of each round (750000) |
| `carryover` | `true` means unspent money moves to the next round |
| `controls` | Each has `id`, `name`, `category` (Prevent, Detect or Respond) and `cost` in pounds. `description`, `use_case` and `limitation` are text for players |
| `already_in_place` | Three controls the business already has. Show them. They cannot be bought and score nothing |
| `phases` | Exactly four. Each has `id`, `title`, `local_time`, `story` and `scores`: the points for every control in that phase |

Every phase must give a score for every control. A missing or extra score is an error.

## The question file

`1-foundation/data/questions.json` holds 40 questions. Each has:

| Field | Meaning |
|---|---|
| `id` | Q01 to Q40 |
| `category` | One of 10 topics |
| `tier`, `tier_label` | Difficulty from 1 (Spot the Risk) to 4 (Pressure Test) |
| `question`, `options`, `correct` | The scenario, four options A to D, and the letter of the one correct answer |
| `explanation` | Show this after the answer. Keep it as written |
| `secure_behaviour`, `difficulty_driver` | The behaviour being taught, and what makes the question hard |
| `phase_id` | For 16 questions, the phase of the story it matches. `null` means a general question for any round |
| `related_controls` | IDs of controls that deal with the same risk. P5 (Training and awareness) is on every question |

The demo page lists the story questions for each phase.

## Artwork

Open `2-extend/artwork.html` to browse all the artwork in the pack. It opens by double-click. If you open it through `npm start` instead (http://127.0.0.1:8080/2-extend/artwork.html), it always shows what is in the folders now, and you can spin the 3D models. You can use the artwork, change it or ignore it and make your own.

## Tests

`npm test` runs every file ending `.test.mjs`, wherever it is in the pack. The supplied tests cover the scoring module and the data files. They do not test your game. Add your own tests next to them, and use these as a pattern: one behaviour per test, a name that says what should happen, and data set up inside the test.
