// Game feel: after each redraw, compare the state before and after and celebrate what changed:
// a pop and "−£350k" when a control is added, a fanfare when the plan is locked, confetti for a
// secure answer, a shake for a wrong one. It works the same in single player and multiplayer,
// because it only looks at the state. It never changes the state or a score.

import {bump, confetti, floatText} from './effects.mjs';
import {play} from './sfx.mjs';
import {shortMoney} from './fun.mjs';
import {POINTS_PER_SECURE_ANSWER} from '../config.mjs';
import {seatId} from './dom.mjs';

export function celebrate(root, prev, state, {data}, room) {
  if (!prev || prev === state) return;

  if (prev.stage === 'choose' && state.stage === 'choose') {
    const added = state.selected.filter(id => !prev.selected.includes(id));
    const removed = prev.selected.filter(id => !state.selected.includes(id));
    for (const id of added) {
      const card = root.querySelector(`[data-control="${id}"]`);
      bump(card, 'is-popped');
      floatText(card, `−${shortMoney(data.controls.find(c => c.id === id).cost)}`, 'is-spend');
      play('add');
    }
    if (removed.length) play('remove');
  }

  if (!prev.confirmed && state.confirmed) {
    play('lock');
    confetti(root.querySelector('.screen-title'), 40);
  }

  if (prev.stage !== 'reveal' && state.stage === 'reveal') play('reveal');

  // This player's new answers (single player answers have no player).
  const me = seatId(room);
  const mine = a => a.player === me && a.phase === state.phase;
  if (!room || !room.you.host) {
    const before = prev.answers.filter(mine).length;
    for (const answer of state.answers.filter(mine).slice(before)) {
      const option = root.querySelector(`[data-key="answer-${answer.questionId}-${answer.choice}"]`);
      if (answer.correct) {
        play('correct');
        confetti(option, 24);
        floatText(option, `+${POINTS_PER_SECURE_ANSWER}`, 'is-gain');
      } else {
        play('wrong');
        bump(option?.closest('.question'), 'is-shaking');
      }
    }
  }

  if (prev.stage !== 'outcome' && state.stage === 'outcome') {
    const stars = Number(root.querySelector('[data-stars]')?.dataset.stars ?? 0);
    setTimeout(() => {
      play(stars === 3 ? 'win' : stars === 2 ? 'draw' : 'lose');
      if (stars >= 2) confetti(root.querySelector('.stars'), stars === 3 ? 70 : 30);
    }, 700);
  }
}
