# Rewind and compare

After a game, the player goes back to an earlier decision, changes it, and sees the two outcomes side by side. In the race theme this could be a ghost car.

## What you start with

`evaluatePurchases` (in `1-foundation/starter/controls.mjs`) works out a whole game from its history. Give it two histories and compare the results.

## It counts when

- It is offered after the game ends. During a game, locked rounds stay locked.
- The player can pick any round and change what was bought, or how a question was answered, from that point on.
- The changed game follows all the rules.
- Both outcomes are shown round by round, and the game explains what made the difference.
- The original game is kept.
