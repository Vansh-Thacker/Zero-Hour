# Scenario studio

A way for our Cyber team to update the game later without writing code: new controls, prices, stories and points.

## What you start with

The scenario format in `1-foundation/data/challenge.json`, described in the README. `validateData` (in `1-foundation/starter/controls.mjs`) checks a scenario and gives a readable error. `1-foundation/data/fixture.json` is a second, smaller scenario to test with.

## It counts when

- Someone who cannot code can change controls (name, category, price, description), phase titles and stories, the points for each control in each phase, the money released each round and whether unspent money carries forward.
- Every change is checked, and errors are shown in plain words next to the thing that is wrong.
- The scenario can be saved to a file and loaded again.
- Your game plays the saved scenario with no change to the code.

Limits to keep: four phases, the three categories, and the scoring rule itself. Editing the questions as well is welcome but not required.
