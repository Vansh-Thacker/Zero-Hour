# Reactive questions

What the players choose to buy in each phase changes the type and difficulty of the question they face in that phase. The game says why.

## What you start with

In `1-foundation/data/questions.json` every question has a topic, a tier of difficulty, a story phase where it has one, and `related_controls`: the controls that deal with the same risk. Not every control links to a topic. You can also use the category of what was bought, how much was spent, or the round's control score.

## It counts when

- What the player buys in a round changes which question they get in that round: its topic, its difficulty, or both.
- The game says why it picked that question.
- Two players who buy differently face different questions.
- The same choices always lead to the same questions, so it can be shown and checked.
- It only uses questions from the bank, with their approved answers and explanations.

Reacting to earlier answers as well is welcome. For example, a wrong answer on phishing leads to another phishing question later.

## Examples

- The player bought email security. The filter stops the obvious emails, so the one that gets through is convincing: they get a harder phishing question.
- The player bought multi-factor authentication (a second check when signing in), so they get a question about an unexpected sign-in prompt. A player who did not buy it gets a password question instead.

This is the difference from Foundation (see `BRIEF.html` in the pack folder). In Foundation the questions are fixed or random. Here the game chooses them in response to the player.
