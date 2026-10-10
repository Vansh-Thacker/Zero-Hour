# Our game: Zero Hour

## Team

- **Team:** Team 20 — Tejas, Rayyan, Ghassan, Vansh and Mo.
- **Game:** Zero Hour. **Fictional business:** Fictional Energy Co. Both names are set in `src/config.mjs`.
- **Level:** Foundation game with the multiplayer Stretch capability and an incident-room-inspired heist presentation.

## What we built

Players have £3,000,000 to protect a fictional energy business before a four-phase overnight cyber attack. They buy Prevent, Detect and Respond controls, see what each control contributes during each phase, and answer behaviour questions under a two-minute checkpoint timer. The outcome separates control points from behaviour points and includes a debrief. The three controls already in place are explained but cannot be bought and add no points.

The same application supports a single-player game and a live team battle. A host creates one room code; players join teams from their phones or separate browser tabs. Each team has its **own** £3,000,000 budget, plan, answers and score. The host starts and advances one shared night, so all teams face the same phases and checkpoint clock. The host sees standings and a final podium. A room supports up to 15 teams, with at least two players per team before the host can confirm. In a two-player team, the first player covers Prevent and Respond and the second covers Detect. With more players, roles rotate Prevent, Detect, Respond.

**Rules differ by mode:** single player must buy at least one control in each category before confirming. In team battle a team may leave categories uncovered; the resulting weakness is part of the comparison. The budget limit, duplicate checks and phase scoring still apply to every team.

## How to run it

**Live deployment:** [Replace this with the deployed game link](https://REPLACE-WITH-YOUR-DEPLOYED-URL.example/).

1. For a local run, install Node.js 20 or later. There are no npm dependencies, accounts or online services required for local play.
2. In this repository, run `npm start` and open `http://127.0.0.1:8080/` (the `index.html` home screen). This **one server** runs both modes.
3. Choose **Single player** to play alone, or **Multiplayer → Host** to open a room. Players choose **Multiplayer → Join**, then enter the code, their name and a team name. The host screen also shows a phone join address. Two or more browser tabs on one laptop work for a demo.
4. Run `npm test` to run the tests. Stop the server with Ctrl+C.

On PowerShell, use `npm.cmd start` and `npm.cmd test` if the `npm` script is blocked. To change the port, set `PORT` before starting the server (for example, `$env:PORT=3000; npm.cmd start` in PowerShell). For a local multiplayer run, phones need the laptop's network address and must be able to reach it on the same Wi-Fi or hotspot.

## Walkthrough for the demo

1. Start at `/index.html`, choose **Multiplayer → Host**, and create a room. Keep the room code visible on the host tab.
2. Open four separate player tabs at `/play.html` (or use phones). Join the first two as **Red** and the next two as **Blue**, using the same room code. The host should show both teams and four players without a reload.
3. For a valid shared purchase, Red's first player buys **P3** (£200,000) and **R1** (£50,000); Red's second player buys **D3** (£100,000). Both Red players and the host should see Red's updated plan and £2,650,000 remaining. Blue's budget remains £3,000,000.
4. For an invalid move, Red's Detect player tries a Prevent control. The server refuses it because that player does not own that role. To show the shared budget rule instead, let Red spend close to £3,000,000 and try a control that costs more than the remaining amount; the purchase is refused and the basket stays valid.
5. Give Blue a different plan, such as **P2** (£1,000,000), **D4** (£1,000,000) and **R4** (£400,000), bought by the players assigned those categories. Both teams are now distinct and under budget.
6. On the host screen, **Confirm**. Both plans lock together. The host then advances through **story → reveal → checkpoint**. Every player sees their own team's results; the host sees the teams side by side and the standings.
7. Have both Red players answer one checkpoint question differently. The team receives the average behaviour points for that question. The host can pause and resume the shared two-minute timer. Continue through all four phases to the outcome and final podium.

For a shorter presentation, use just two teams of two, one valid purchase, one rejected purchase, the first reveal and one checkpoint answer. The full night is available for questions afterward.

## How it is built

- `1-foundation/starter/controls.mjs` and the challenge data are supplied. The supplied module remains unchanged; its `scoreSelection` scores valid single-player plans. `src/engine/scores.mjs` also provides `scorePlan` for team battles that leave categories empty, using the same phase score data.
- `src/engine/state.mjs` contains `createInitialState()` and the pure `reduce(game, state, action)` transition. It holds the stage, phase, selected control IDs, confirmation and scoring result, checkpoint, answers and behaviour points. The engine enforces the budget, lock, answer and timer rules. `src/engine/actions.mjs` checks action shapes; `selection.mjs`, `scores.mjs` and `loadData.mjs` provide focused helpers.
- `src/checkpoint/checkpoint.mjs` deterministically picks four questions per phase, prioritising story-linked questions and then suitable topics. Questions progress through the difficulty tiers. A secure answer earns 2 points; a wrong or missed answer earns 0. In a team, points are averaged across all members, including anyone who did not answer. The timer runs for at most 120 seconds and the host may pause it.
- `src/server/server.mjs` is the **single** Node server for static files and room APIs. `src/server/competition.mjs` manages the teams in a room. `src/server/rooms.mjs` applies role and host permissions to one team's actions before calling the engine. The server assigns the acting player and time; it does not trust those values from a phone. Requests are processed one at a time, so the second simultaneous purchase checks the budget left after the first.
- `src/net/client.mjs` sends actions and keeps each tab's seat for refresh. Server-Sent Events push a fresh view after changes; reconnection receives the current state. `src/main.mjs` runs single player locally. `src/host.mjs` and `src/play.mjs` connect the host and players to the server. `src/ui/` draws the incident-room-style screens, defence wall, standings and debrief. Screens read state and dispatch actions; they do not calculate scores.

We chose one reducer and one server-owned state per team instead of allowing each screen to change a local copy. This keeps the phone and host views consistent, makes concurrent budget checks safe, and lets tests exercise the rules without a browser. Teams share only the host's phase and clock; their baskets, answers and scores remain separate.

## How the questions change the game

After each phase's story and reveal, a 120-second checkpoint asks four questions selected from `questions.json`. Story-linked questions appear first; topic-matched questions fill any gaps. Each player answers on their own screen and sees the supplied explanation. Correct answers add behaviour points separately from the defence-control score. At the outcome, both parts contribute to the total. The host can pause the clock, and missing answers earn zero when time expires.

## Tests

Run `npm test` (`npm.cmd test` in PowerShell). The suite covers supplied scoring and question data, engine transitions, budget and category rules, phase scores, checkpoint selection and timing, team averages, debrief, standings, role and host permissions, independent team budgets, room/API errors, Server-Sent Events, reconnection, and simultaneous purchases. See `tests/` and `1-foundation/tests/` for the cases.

A useful regression case sends two purchases against the last of a shared team budget. Only the first can succeed; the second must see the updated balance. This directly checks the multiplayer rule most likely to fail if devices kept their own copies of state.

## Known limits

- Rooms and seats live in server memory. Restarting the server ends every room; there is no saved game database.
- When running locally, phones must be able to reach the host laptop over the network. Some venue Wi-Fi networks isolate devices; a hotspot or separate tabs on one laptop works for a local demo.
- Room codes and per-seat tokens are sufficient for a local demo, but this is not an account or authentication system for a public internet deployment.
- The incident-room look is implemented in `src/ui/`. The separate optional `src/theme/` module is still a placeholder; the game does not depend on it.

## Where AI tools helped

We used Claude and Codex to help interpret the brief, plan the engine and multiplayer work, generate and review code and tests, and draft documentation. We checked the resulting rules against the supplied challenge data and scoring module and used the test suite and browser demos to verify behaviour. The team made the final design and demo choices.

## Credits

ScottishPower supplied the challenge brief, scenario, controls, questions, scoring module, brand mark and artwork pack. The artwork used by the game is in `1-foundation/artwork/` and `2-extend/artwork/`; supplied licence notices are in `2-extend/licences/`. The business and incident are fictional, and the prices and scores are simplified for learning.
