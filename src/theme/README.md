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
| 8 | `tests/theme.test.mjs` | 22 tests for the theme (see below). |
| + | `artwork.mjs` | Every piece of pack artwork the theme uses, in one place. Works out image paths from its own location, so images load on any page. |
| + | `preview.html` | Try the theme on its own with the real data: open `/src/theme/preview.html` after `npm start`. Not part of the game. |

## Artwork

We used every piece of 2D pack artwork that fits the heist, and left out what does not. `artwork.mjs` lists each file, and a test checks every one of them really exists.

| Artwork | Where it appears in the heist |
|---|---|
| `1-foundation/artwork/icons/` (all 21 control icons) | Next to each chosen control in "Your defences", and the 3 `IP_` icons in "Already in place" |
| `1-foundation/artwork/everyday/email`, `laptop`, `phone` | The picture in rooms 1 to 3: the phishing email, the infected laptop, the fake IT call |
| `1-foundation/artwork/everyday/usb_stick` | The crew's marker on the blueprint (their malicious device) |
| `2-extend/artwork/incident/chat` | Room 4: the ransom demand message |
| `2-extend/artwork/incident/call` | The Architect "is calling" |
| `2-extend/artwork/incident/recovery` and `email` | The ending: vault holds, or the ransom email arrives |
| `2-extend/artwork/map/outside_node`, `system_node`, `platform` | The street, rooms not reached yet, and the data vault |
| `2-extend/artwork/map/marker_reduces`, `marker_sees`, `marker_recovers` | The Prevent, Detect and Respond layer marks in each room, and in the key |
| `2-extend/artwork/scenery/office` | The company's building in the header |

**What we did not use, and why:**
- **ScottishPower logo and brand mark.** The business in the game is fictional. Putting the real logo on a company being robbed could suggest ScottishPower itself is being hacked.
- **3D models (`.glb`).** The theme is 2D on purpose: it loads fast, works on any screen, and the brief says simple 2D is fine.
- **Race artwork** belongs to the Endurance Race theme, so it does not fit a heist.
- **Other scenery** (pylons, turbines, solar, trees) and `map/attacker_route`, `marker_coordinates`: our blueprint is the inside of one building, so outdoor scenery and the city map pieces did not fit. The crew's route is drawn in SVG so it can move with each phase.
- Every image sits on a light badge, so dark artwork stays visible on the dark blueprint. Images have empty alt text because the words next to them already say the same thing.

## The rules we decided

**The yardstick: the best choice that fits £3m.** `bestAffordableChoice()` finds the set of controls that earns the most points across all four phases while costing no more than £3m and covering Prevent, Detect and Respond. In the real scenario it scores **54 points**. With 18 controls there are only 262,144 possible sets, so it simply checks them all: quick, runs once, and easy to trust.

**Vault integrity.** After each phase, integrity is *the team's points so far* as a share of *the best affordable choice's points so far*. A team that makes the best affordable choice keeps the vault at 100%. Measuring against a choice a team could really make (not every control at once, which nobody can afford) keeps the score fair and shows the real trade-off.

**Did a room hold? (`ROOM_HOLDS_AT = 0.5`)** A room holds if the team earned at least half of the best affordable choice's points in that phase. Covering a layer with a weak control is often not enough. That is the game's lesson: the right defence for the right moment.

**Foiled or escaped (`FOILED_THRESHOLD = 50`).** After phase 4, the heist is foiled if vault integrity is 50% or more, meaning the team earned at least half the points of the best £3m choice. Otherwise the crew escapes with the data. The reason text tells players their score against the 54-point best.

**Detecting is not stopping.** The Architect's wording follows the category, as the brief requires:
- Prevent: "*…blocked us. We'll need another way in.*"
- Detect: "*…spotted us. Being seen doesn't end a heist, but now your team knows where we are.*" (never "blocked" or "stopped", and a test checks this)
- Respond: "*…contained us. You planned for the worst.*"
- Respond, for backups and digital forensics: "*…means you recovered what we took.*" These help you recover afterwards rather than contain the crew, so the wording says so.

**Gaps teach the lesson, without contradictions.** The Architect only says "*Nobody was watching*", "*Nothing stood in our way*" or "*Nobody answered*" when **no** chosen control in that layer scored in this phase. Then he names the best control that would have, with its real name. For example, at 02:00 a 9-to-5 response team scores nothing, so he points out a round-the-clock unit would have answered. If a Detect control did spot him, he never claims nobody was watching. This matches the ✓/✗ marks on the blueprint.

## Accessibility

- Every state has a **symbol and a word**, not just a colour: ✓ HELD, ✗ BREACHED, ? AHEAD, and the vault meter says *Holding*, *Under pressure* or *Critical*.
- The vault meter is a real `role="meter"` with its value. The blueprint has a text description for screen readers. The Architect's messages are announced with `aria-live`.
- **No flashing.** The only animation is a gentle fade on the crew marker, and it switches off under `prefers-reduced-motion`.
- Text from the data is escaped before it goes into the page.

## Tests

Run with `npm test`. Each test checks one behaviour:

- Every control label includes its real name, and every control has its own heist name.
- **Every real control in `challenge.json` has a heist name.** If the Cyber team adds a control, this test names what to add.
- The theme reads the engine's state names, `selected` and `phase`.
- The best affordable choice fits £3m and covers all three layers, and picks the right set in a worked example. **In the real scenario it scores 54.**
- Vault integrity always stays between 0 and 100. The best affordable choice gives 100. The cheapest valid choice gives less.
- **All 18 heist names are different.**
- The Architect never says "nobody was watching" after a Detect control scored, and backups and forensics say "recovered", not "contained".
- The outcome is the same for the same choices, and always has a reason. At or above the threshold is foiled, below is escaped.
- A Detect control is never said to have "blocked" or "stopped" the crew.
- The Architect names a real gap, and always ends with a summary line.
- The clock runs from 0 to 1 and puts 02:00 at the right point in the night (560 of 830 minutes).
- **The theme never changes the state or the data** (both frozen with `Object.freeze`).
- Text from the data is escaped.
- Every chosen control shows its icon, and the controls already in place get theirs by name.
- **Every artwork file the theme uses exists in the pack**, so no broken images.

## Demo script (about 90 seconds of the 8-minute pitch)

1. **Set up:** "You're the security team. Tonight, a crew led by The Architect is coming for the data vault."
2. **Show phase 1 with a strong choice:** the Front desk shows ✓ HELD, the meter is high, and The Architect says the mailroom scanner blocked them.
3. **Show phase 2 at 02:00:** point at the 9-to-5 response unit scoring 0 and The Architect's line about nobody answering. *"Same control, different moment, different result. That's the lesson."*
4. **Show the ending:** "Heist foiled" or "The crew got away", with the reason in words.
5. **Architecture line:** "The theme only reads the game state. Delete the folder and the game still works, and a test proves it never changes the state."

## Likely judge questions

- **"How do the player's choices change the theme?"** Each room's ✓/✗, the crew's route, the vault meter, The Architect's lines and the ending all come from the controls chosen and their points in that phase.
- **"How do you keep the theme separate from the scoring?"** It only reads state, it is in its own folder, and a frozen-state test proves it changes nothing. All reads of the engine's state are in one place.
- **"Why 50% for foiled?"** It means your defences earned at least half the points of the best choice that fits £3m (27 of 54). It is a clear rule players can understand, and it is one constant to change if playtesting says it is too easy or too hard.
- **"Why measure against the best £3m choice and not every control?"** Nobody can afford every control, so measuring against that would make 100% impossible. The best affordable choice is a target a team can really hit.
- **"What if the Cyber team adds a new control?"** It gets a fallback heist name based on its category, so nothing breaks, and a test tells us to give it a proper name.
- **"Is it original?"** Yes. The names, the crew and The Architect are ours. Nothing from any TV show.

## Not done yet / limits

- The theme reads the engine's state through two functions at the top of `vault.mjs` (`selected`, `phase`). If the engine renames them, that is the only place to change.
- No sound.
- The 3D models and outdoor scenery are not used (see Artwork for why).
