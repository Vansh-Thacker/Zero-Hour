# Team plan

Who owns what, how the pieces fit, and how we use git. Read `BRIEF.html` for the rules.

## Roles

| Person          | Role                                  | Owns                                                  |
|-----------------|---------------------------------------|-------------------------------------------------------|
| Tejas & Rayyan  | Game engine, screens and integration  | `src/engine/`, `src/ui/`, `src/config.mjs`, `index.html`, `style.css` |
| Ghassan         | Checkpoints and questions             | `src/checkpoint/`                                     |
| Vansh           | Theme (Extend level)                  | `src/theme/`                                          |
| Mo              | Testing, debrief and hand-in          | `tests/`, `src/debrief/`, `OUR_GAME.md`, slides       |

- **Tejas & Rayyan:** the flow choose → confirm → 4 phases → outcome → reset, wired to
  `controls.mjs`; every screen (control picker with live budget and category check, story,
  score reveal, checkpoint, final outcome); readable text, feedback not by colour alone.
  Split the pair's work by feature, not by file, and pull from each other often.
- **Ghassan:** pick questions per phase, 2-minute pausable timer, unanswered = 0 points but
  still show the explanation, behaviour points kept separate from the control score.
- **Vansh:** Incident Room theme that reacts to the player's choices; reads state only,
  never changes scores; always shows each control's real name.
- **Mo:** debrief text (what happened and why), tests for budget, categories, phase scores
  and checkpoint points, `OUR_GAME.md` kept up to date, 8-minute pitch and demo walkthrough.

Only edit files you own. If you need a change in someone else's folder, ask them.

## How the pieces fit

- **Engine** (`src/engine/`) owns the game state. It is the only code that changes it.
  Scoring of controls always goes through the supplied `1-foundation/starter/controls.mjs`
  (`scoreSelection(data, ids)`).
- **Checkpoint** (`src/checkpoint/`) is pure functions: pick questions for a phase, mark an
  answer, work out behaviour points, run the 2-minute timer. The engine calls them.
- **UI** (`src/ui/`) reads the state and draws it. User actions are sent to the engine
  with `dispatch(action)`. It never changes state directly.
- **Theme** (`src/theme/`) also only reads the state. It never changes scores.
- **Config** (`src/config.mjs`) is the one place for the game name, business name and
  tunable numbers.

### State shape (agreed contract)

```js
{
  stage: 'choose' | 'story' | 'reveal' | 'checkpoint' | 'outcome',
  phase: 0,                 // 0-3, index into challenge.json phases
  selected: [],             // control IDs, e.g. ['P3', 'D3', 'R1']
  confirmed: false,         // true once the choice is locked
  result: null,             // output of scoreSelection() after confirm
  behaviourPoints: [0, 0, 0, 0],
  answers: [],              // { phase, questionId, choice, correct }
  error: null,              // readable message for the player
}
```

Change this only by agreement, and update this file when you do.

## Git workflow

- `main` holds the final hand-in. `dev` is where we combine work. Everyone works on their own branch.
- Pull `dev` into your branch often. Run `npm test` before every merge.
- Targets: Foundation end-to-end on `dev` by 17:00 Saturday, theme by 21:00.
  Sunday morning is fixes and the hand-in note only. Everything committed by 12:00 Sunday.
