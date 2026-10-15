# Zero Hour

> 🥈 **2nd place at Strath Hack 2026** in the ScottishPower "Defend Your Network" cyber security challenge.

Zero Hour is Team 20's cyber security game for the ScottishPower StrathHack challenge. Protect a fictional energy company with a £3,000,000 defence budget, watch an overnight attack unfold across four phases, then answer behaviour questions before the clock runs out.

The game runs in **single-player** mode or as a live **team battle**. One host runs the night; players join with a room code and build separate plans for their teams. See [OUR_GAME.md](OUR_GAME.md) for the hand-in notes, architecture, limits and a demo walkthrough.

**Live deployment:** The current version is deployed [here](https://team-20-1.onrender.com/).

## Run

For a local run, install Node.js 20 or later. There are no npm packages to install, and local play does not need internet access.

```sh
npm start
```

Open **http://127.0.0.1:8080/** in a browser. This opens `index.html`, the home screen for both modes. The same server serves the game and the multiplayer room API. Press Ctrl+C to stop it.

Run the tests with `npm test`. On Windows PowerShell, use `npm.cmd start` and `npm.cmd test` if PowerShell blocks npm's script. The server uses port 8080 by default; set `PORT` before starting it to choose another port.

## Play

**Single player:** Choose Single player on the home screen. Buy controls within £3,000,000, including at least one Prevent, one Detect and one Respond control, then confirm. Your plan stays locked through the four story, reveal and checkpoint rounds. Each checkpoint has four questions and a two-minute timer. At the end, see the control score, behaviour points and debrief.

**Team battle:** Choose Multiplayer → Host to create a room. The host screen shows the room code and an address for phones. Players choose Multiplayer → Join and enter the code, their name and a team name. To try it on one laptop, use one host tab and at least two player tabs per team.

Each team has its own £3,000,000 budget, selected controls, answers and score. Teams share the attack timeline and checkpoint clock. A room supports up to 15 teams and needs at least two players on **every** team before the host can confirm. In a two-player team, the first player buys Prevent and Respond controls; the second buys Detect controls. With more players, those roles rotate in join order. Players can only buy controls for their assigned categories. In team battle, leaving a category empty is allowed, but can leave a weakness in the team's defence.

The host confirms every team's plan at once, advances the story, and can pause or resume checkpoints. Phones answer the questions; the team earns the average points across its players, with unanswered questions worth zero. The host sees live standings and a final podium. Three supplied controls are already in place: they are shown for context, cannot be bought and score nothing.

## How it works

- `src/engine/state.mjs` changes game state through `reduce()`; `src/engine/scores.mjs` calculates phase and team-battle scores from the supplied scenario data.
- `src/checkpoint/checkpoint.mjs` selects four story-relevant questions per phase, marks answers and handles the timer. A correct answer is worth 2 points.
- `src/server/server.mjs` serves the site and the room API. `src/server/competition.mjs` keeps teams separate within a room; `src/server/rooms.mjs` checks player roles and host permissions before applying actions.
- `src/net/client.mjs` sends actions and receives live Server-Sent Events. `src/main.mjs` runs single player, while `src/host.mjs` and `src/play.mjs` connect host and player screens. `src/ui/` renders the screens, defence wall, standings and outcome.
- `1-foundation/starter/controls.mjs` is the supplied scoring module. The supplied challenge and question files are in `1-foundation/data/`. `src/config.mjs` holds the game name, fictional business name and checkpoint settings.

The server owns each room's state and checks purchases in order, so two devices cannot spend the same remaining budget. It assigns the player and timestamp for every action. Room state is kept in memory: restarting the server ends existing games. For a local run, phones need to reach the host laptop on the same network; some venue Wi-Fi networks block this, so a hotspot or separate laptop tabs can be used for a demo.

## Tests and credits

`npm test` runs the supplied tests and our engine, checkpoint, debrief, UI and multiplayer tests, including the shared-budget race and room API. The challenge brief is in `BRIEF.html`.

ScottishPower supplied the challenge scenario, scoring module, questions, brand assets and artwork. Assets and licence notices are in `1-foundation/artwork/`, `2-extend/artwork/` and `2-extend/licences/`. The business and attack are fictional; controls, prices and points are simplified for learning.
