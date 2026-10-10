// Checkpoint screen: behaviour questions against the clock.
// Questions, answers and explanations are shown exactly as written in questions.json.

import {CHECKPOINT_SECONDS, POINTS_PER_SECURE_ANSWER} from '../config.mjs';
import {timeLeft} from '../engine/state.mjs';
import {el, points} from './dom.mjs';

export function checkpointScreen(state, {data, bank}, dispatch) {
  const {checkpoint} = state;
  const paused = checkpoint.timer.pausedAt !== null;
  const last = state.phase === data.phases.length - 1;
  const questions = checkpoint.questionIds.map(id => bank.questions.find(q => q.id === id));

  const head = el('section', {class: 'cp-head'},
    el('div', {},
      el('span', {class: 'eyebrow'}, `Behaviour checkpoint · Phase ${state.phase + 1}`),
      el('h1', {class: 'screen-title'}, 'What would you do?'),
      el('p', {class: 'cp-rule'},
        `${questions.length} questions · ${CHECKPOINT_SECONDS / 60} minutes · a secure answer earns ${POINTS_PER_SECURE_ANSWER} points, `
        + 'a wrong or missed answer earns none. These points are separate from your control score.')),
    el('div', {class: 'timer'},
      timerRing(checkpoint),
      checkpoint.expired ? null : el('button', {class: 'btn btn-ghost', type: 'button', 'data-key': 'pause',
        onclick: () => dispatch({type: paused ? 'resume' : 'pause'})}, paused ? '▶ Resume' : '❚❚ Pause')));

  const cards = questions.map(q => questionCard(q, state, dispatch));

  return [
    head,
    state.error ? el('p', {class: 'alert', role: 'alert'}, state.error) : null,
    el('div', {class: 'questions'}, cards),
    el('div', {class: 'actions'},
      el('span', {class: 'chip'}, 'Behaviour points this phase ', el('strong', {}, points(state.behaviourPoints[state.phase]))),
      el('button', {class: 'btn btn-primary', type: 'button', 'data-key': 'next', onclick: () => dispatch({type: 'next'})},
        last ? 'See how the night ended →' : 'Continue the night →')),
  ];
}

// The countdown. updateTimer() refreshes it once a second without redrawing the screen.
function timerRing(checkpoint) {
  const ring = el('div', {class: 'ring', 'data-timer': true, role: 'timer', 'aria-label': 'Time left'}, el('span'));
  updateTimer(ring, checkpoint);
  return ring;
}

export function updateTimer(ring, checkpoint) {
  const ms = checkpoint.expired ? 0 : timeLeft(checkpoint.timer, Date.now());
  const seconds = Math.ceil(ms / 1000);
  const paused = checkpoint.timer.pausedAt !== null;
  ring.style.setProperty('--p', String((ms / (CHECKPOINT_SECONDS * 1000)) * 100));
  ring.classList.toggle('is-low', seconds <= 20);
  ring.firstChild.textContent = checkpoint.expired ? '0' : paused ? '❚❚' : String(seconds);
  ring.setAttribute('aria-label', checkpoint.expired ? 'Time is up' : `${seconds} seconds left${paused ? ', paused' : ''}`);
}

function questionCard(q, state, dispatch) {
  const given = state.answers.find(a => a.phase === state.phase && a.questionId === q.id);
  const closed = Boolean(given) || state.checkpoint.expired;

  const options = Object.entries(q.options).map(([letter, text]) => {
    const isCorrect = closed && letter === q.correct;
    const pickedWrong = given && given.choice === letter && !given.correct;
    return el('button', {
      class: `option${isCorrect ? ' is-correct' : ''}${pickedWrong ? ' is-picked-wrong' : ''}`,
      type: 'button', disabled: closed, 'data-key': `answer-${q.id}-${letter}`,
      onclick: () => dispatch({type: 'answer', questionId: q.id, choice: letter}),
    },
    el('span', {class: 'letter'}, letter), el('span', {}, text),
    isCorrect ? el('span', {class: 'option-note'}, '✓ Secure answer') : null,
    pickedWrong ? el('span', {class: 'option-note'}, '✗ Your answer') : null);
  });

  let verdict = null;
  if (closed) {
    const [kind, words] = !given ? ['is-missed', '⏱ Not answered in time: 0 points']
      : given.correct ? ['is-secure', `✓ Secure answer: +${POINTS_PER_SECURE_ANSWER} points`]
        : ['is-wrong', '✗ Not the secure answer: 0 points'];
    verdict = [
      el('p', {class: `verdict-line ${kind}`, role: 'status'}, words),
      el('p', {class: 'explain'}, el('span', {class: 'explain-label'}, 'Why'), q.explanation),
    ];
  }

  return el('article', {class: 'panel question'},
    el('div', {class: 'q-meta'}, el('span', {}, q.category), el('span', {}, `Tier ${q.tier}: ${q.tier_label}`)),
    el('h3', {}, q.question),
    el('div', {class: 'options'}, options),
    verdict);
}
