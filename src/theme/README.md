# Zero Hour: the heist theme

**Owner:** Vansh · **Level:** Extend (the theme) · **Folder:** `src/theme/`

## The idea in one paragraph

The players are the **security team** of a fictional energy company. Overnight, a heist crew led by a mastermind called **The Architect** tries to break into the company's **data vault**. The four phases of the cyber attack become the four stages of the heist. The controls the players choose become the building's defences, drawn on a blueprint. As each phase plays out, the crew moves one room closer to the vault, and the players see which defences held them back and which gaps let them through. The heist is original: nothing is taken from Money Heist or any other show.

## How the attack maps to the heist

| Phase | Real attack (challenge.json) | Heist stage | Room on the blueprint |
|---|---|---|---|
| 1 · Mon 16:40 | Phishing email, someone clicks | The Way In | Front desk |
| 2 · Tue 02:00 | Attacker explores the network | Casing the Vault | Corridors |
| 3 · Tue 03:30 | Fake "IT" call asks for a sign-in code | The Inside Call | Night desk |
| 4 · Tue 06:30 | Files encrypted, ransom demanded | Lockdown | Vault door |

| Category | Heist role | What it means in the heist |
|---|---|---|
| Prevent | 🔒 Gatekeeper | Keeps the crew out |
| Detect | 🎥 Watcher | Spots the crew moving |
| Respond | 🚨 Responder | Fights back and recovers |

Every control has a heist name, **always shown with its real name**, e.g. *Mailroom scanner (Email Security)*, *Laser tripwires (Intrusion Detection & Prevention)*, *Round-the-clock response unit (Incident Response Team 24×7)*. This follows the brief's rule that the cyber learning must not be lost.

## How it fits into the game (the architecture)

```
challenge.json ──► engine (Tejas) ──► game state ──► theme (read only) ──► host screen
                   rules + scores                    src/theme/
```

- **The engine owns the rules and the scores.** The theme only reads the game state and the scenario data.
- **The theme never changes anything.** A test freezes the state and data, then runs the whole theme. If the theme tried to change anything, the test would fail.
- **The theme never invents its own scores.** It uses the engine's phase score when it is there, otherwise the scenario's own phase scores, which are the same numbers the scoring module uses.
- **You can delete `src/theme/` and the game still works.** That is how we know the theme is separate from the rules.
- **All the places the theme reads the engine's state are in one section of `vault.mjs`** (`chosenControlIds`, `currentPhaseIndex`). If the engine renames something, it is a one-line change.

### Using it from the host screen

```js
import { renderTheme } from './theme/theme.mjs';
// in the page: <link rel="stylesheet" href="src/theme/theme.css">

renderTheme(document.getElementById('heist'), state, data);                        // during the phases
renderTheme(document.getElementById('heist'), state, data, { showOutcome: true }); // final screen
```

## The files

| # | File | What it does |
|---|---|---|
| 1 | `heistNames.mjs` | All heist names in one place: controls, phases, roles. `heistLabel(control)` gives "heist name (real name)". Controls are matched by words in their real name, so it still works if IDs change. |
| 2 | `vault.mjs` | `vaultIntegrity(data, state)` gives 0 to 100. `heistOutcome(data, state)` gives `'foiled'` or `'escaped'` with a reason in words. Also the only place that reads the engine's state. |
| 3 | `architect.mjs` | `architectMessages(data, state)` gives The Architect's lines: which chosen controls worked this phase and which gaps were left. |
| 4 | `clock.mjs` | `heistClock(data, n)` gives the phase's time label and how far through the night it is (0 to 1). |
| 5 | `theme.css` | The blueprint look. Scoped under `.heist`. No flashing. Motion off for reduced-motion users. |
| 6 | `blueprint.mjs` | Draws the floor plan as SVG: four rooms and the vault, the crew's route, and ✓ or ✗ for each defence layer in each room. |
| 7 | `theme.mjs` | `renderTheme(root, state, data)` puts it all together. `buildThemeHtml` returns a string so it can be tested without a browser. |
| 8 | `tests/theme.test.mjs` | 18 tests for the theme (see below). |

## The rules we decided

**Vault integrity.** After each phase, integrity is *the team's points so far* as a share of *the best possible points so far*. "Best possible" means every control that scores in that phase (ignoring budget), so 100% is the perfect yardstick. A perfect choice gives 100. Any real choice within £3m gives less, which shows the trade-off the game is about.

**Did a room hold?** A room holds if the team earned at least half of the best possible points in that phase. With the game's 3/2/1 scoring, picking the top control in each of the three layers is exactly half, so "the best defence in every layer" holds the room. Covering a layer with a weak control is not enough. That is the game's lesson: the right defence for the right moment.

**Foiled or escaped (`FOILED_THRESHOLD = 50`).** After phase 4, the heist is foiled if vault integrity is 50% or more. Otherwise the crew escapes with the data. The rule is shown to players in the reason text.

**Detecting is not stopping.** The Architect's wording follows the category, as the brief requires:
- Prevent: "*…blocked us. We'll need another way in.*"
- Detect: "*…spotted us. Being seen doesn't end a heist, but now your team knows where we are.*" (never "blocked" or "stopped", and a test checks this)
- Respond: "*…contained us. You planned for the worst.*"

**Gaps teach the lesson.** For each layer, The Architect names the best control the team did not choose that would have scored in this phase, with its real name. For example, at 02:00 a 9-to-5 response team scores nothing, and The Architect points out there was no round-the-clock unit.

## Accessibility

- Every state has a **symbol and a word**, not just a colour: ✓ HELD, ✗ BREACHED, ? AHEAD, and the vault meter says *Holding*, *Under pressure* or *Critical*.
- The vault meter is a real `role="meter"` with its value. The blueprint has a text description for screen readers. The Architect's messages are announced with `aria-live`.
- **No flashing.** The only animation is a gentle fade on the crew marker, and it switches off under `prefers-reduced-motion`.
- Text from the data is escaped before it goes into the page.

## Tests

Run with `npm test`. Each test checks one behaviour:

- Every control label includes its real name, and every control has its own heist name.
- **Every real control in `challenge.json` has a heist name.** If the Cyber team adds a control, this test names what to add.
- Vault integrity always stays between 0 and 100. A perfect choice gives 100. The cheapest valid choice gives less.
- The engine's own phase score is used when it is there.
- The outcome is the same for the same choices, and always has a reason. At or above the threshold is foiled, below is escaped.
- A Detect control is never said to have "blocked" or "stopped" the crew.
- The Architect names a real gap, and always ends with a summary line.
- The clock runs from 0 to 1 and puts 02:00 at the right point in the night (560 of 830 minutes).
- **The theme never changes the state or the data** (both frozen with `Object.freeze`).
- Text from the data is escaped.

## Demo script (about 90 seconds of the 8-minute pitch)

1. **Set up:** "You're the security team. Tonight, a crew led by The Architect is coming for the data vault."
2. **Show phase 1 with a strong choice:** the Front desk shows ✓ HELD, the meter is high, and The Architect says the mailroom scanner blocked them.
3. **Show phase 2 at 02:00:** point at the 9-to-5 response unit scoring 0 and The Architect's line about nobody answering. *"Same control, different moment, different result. That's the lesson."*
4. **Show the ending:** "Heist foiled" or "The crew got away", with the reason in words.
5. **Architecture line:** "The theme only reads the game state. Delete the folder and the game still works, and a test proves it never changes the state."

## Likely judge questions

- **"How do the player's choices change the theme?"** Each room's ✓/✗, the crew's route, the vault meter, The Architect's lines and the ending all come from the controls chosen and their points in that phase.
- **"How do you keep the theme separate from the scoring?"** It only reads state, it is in its own folder, and a frozen-state test proves it changes nothing. All reads of the engine's state are in one place.
- **"Why 50% for foiled?"** It means your defences earned at least half of what a perfect set could. It also matches the 3/2/1 scoring: the best control in each layer is exactly half of a phase's points.
- **"What if the Cyber team adds a new control?"** It gets a fallback heist name based on its category, so nothing breaks, and a test tells us to give it a proper name.
- **"Is it original?"** Yes. The names, the crew and The Architect are ours. Nothing from any TV show.

## Not done yet / limits

- Built against the agreed plan for the engine's state (`chosen`, `phaseIndex`, `result.phases`). If the engine uses other names, update the two functions at the top of `vault.mjs`.
- No sound.
- Artwork from `2-extend/artwork/` is not used yet. The blueprint is drawn in SVG.
