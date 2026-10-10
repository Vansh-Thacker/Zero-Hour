// Checkpoint screen: a quick quiz against the clock, one question at a time, quiz-show style.
// Questions, answers and explanations are shown exactly as written in questions.json.
// Multiplayer: each phone answers for itself; the host sees how many have answered and runs the clock.
// When time is up (or on the host screen) every question is shown at once, with its answer.

import {CHECKPOINT_SECONDS, POINTS_PER_SECURE_ANSWER} from '../config.mjs';
import {timeLeft} from '../engine/state.mjs';
import {el, points, hostOnly, runsGame, answersQuestions, seatId} from './dom.mjs';

// Each answer has a shape as well as a colour, so it never relies on colour alone.
const SHAPES = {A: '▲', B: '◆', C: '●', D: '■'};

// Which question this device is looking at. It only moves on when the player presses Next,
// so they can read the explanation first. Kept between redraws, reset for a new checkpoint.
let viewing = {key: null, index: 0};

export function checkpointScreen(state, {data, bank}, dispatch, extras, room) {
  const {checkpoint} = state;
  const paused = checkpoint.timer.pausedAt !== null;
  const last = state.phase === data.phases.length - 1;
  const questions = checkpoint.questionIds.map(id => bank.questions.find(q => q.id === id));
  const me = seatId(room);
  const mineFor = q => state.answers.find(a => a.phase === state.phase && a.questionId === q.id && a.player === me);
  const nextPhase = last ? null : state.phase + 2;

  const head = el('section', {class: 'cp-head'},
    el('div', {},
      el('span', {class: 'eyebrow'}, `❓ Quiz time · after attack ${state.phase + 1}`),
      el('h1', {class: 'screen-title'}, 'What would you do?'),
      el('ul', {class: 'quiz-pills', 'aria-label': 'Quiz rules'},
        el('li', {}, `❓ ${questions.length} questions`),
        el('li', {}, `⏱ ${CHECKPOINT_SECONDS / 60} minutes`),
        el('li', {}, `✓ +${POINTS_PER_SECURE_ANSWER} each`),
        el('li', {}, last ? '🏁 Last quiz of the night' : `🧱 Patches your wall for attack ${nextPhase}`))),
    el('div', {class: 'timer'},
      timerRing(checkpoint),
      checkpoint.expired || !runsGame(room) ? null : el('button', {class: 'btn btn-ghost', type: 'button', 'data-key': 'pause',
        onclick: () => dispatch({type: paused ? 'resume' : 'pause'})}, paused ? '▶ Resume' : '❚❚ Pause')));

  const quizMode = answersQuestions(room) && !checkpoint.expired;
  const body = quizMode
    ? quiz(state, questions, mineFor, dispatch, nextPhase)
    : el('div', {class: 'questions'}, questions.map(q => questionCard(q, state, dispatch, nextPhase, room, mineFor(q))));

  return [
    head,
    state.error ? el('p', {class: 'alert', role: 'alert'}, state.error) : null,
    body,
    el('div', {class: 'actions'},
      el('span', {class: 'chip'}, '🧠 Points this quiz ', el('strong', {}, points(state.behaviourPoints[state.phase]))),
      hostOnly(room,
        el('button', {class: 'btn btn-primary', type: 'button', 'data-key': 'next', onclick: () => dispatch({type: 'next'})},
          last ? '🏁 See how the night ended' : '🌙 On with the night'),
        'The host moves the night on when everyone has answered.')),
  ];
}

// One question at a time, with dots showing progress, then a results card.
function quiz(state, questions, mineFor, dispatch, nextPhase) {
  const firstOpen = questions.findIndex(q => !mineFor(q));
  const open = firstOpen === -1 ? questions.length : firstOpen;
  const key = `${state.phase}:${state.checkpoint.questionIds.join()}`;
  const index = viewing.key === key ? Math.min(viewing.index, open) : open;
  viewing = {key, index};

  const given = questions.map(mineFor);
  let streak = 0;
  for (const answer of given.filter(Boolean).reverse()) { if (!answer.correct) break; streak++; }

  const goTo = (from, to) => {
    viewing = {key, index: to};
    const box = from.closest('.quiz');
    box.querySelectorAll('.quiz-slide').forEach((slide, i) => { slide.hidden = i !== to; });
    box.querySelectorAll('.quiz-dots li').forEach((dot, i) => dot.classList.toggle('is-current', i === to));
    box.querySelectorAll('.quiz-slide')[to]?.querySelector('h3, h2')?.focus();
  };

  const dots = el('ol', {class: 'quiz-dots', 'aria-label': 'Your progress'},
    questions.map((q, i) => el('li', {class: `${given[i] ? (given[i].correct ? 'is-right' : 'is-wrong') : ''}${i === index ? ' is-current' : ''}`},
      given[i] ? (given[i].correct ? '✓' : '✗') : String(i + 1),
      el('span', {class: 'visually-hidden'}, given[i] ? (given[i].correct ? ' secure' : ' not secure') : ' not answered yet'))),
    streak >= 2 ? el('li', {class: 'streak'}, `🔥 ${streak} in a row!`) : null);

  const slides = questions.map((q, i) => {
    const card = questionCard(q, state, dispatch, nextPhase, null, given[i]);
    card.classList.add('quiz-slide');
    card.hidden = i !== index;
    if (given[i]) {
      card.append(el('div', {class: 'actions'},
        el('button', {class: 'btn btn-primary', type: 'button', 'data-key': `after-${q.id}`, onclick: event => goTo(event.currentTarget, i + 1)},
          i + 1 < questions.length ? 'Next question →' : '🎉 See my score')));
    }
    return card;
  });

  const right = given.filter(a => a?.correct).length;
  const done = el('article', {class: 'panel question quiz-slide quiz-done'},
    el('h2', {tabindex: '-1'}, right === questions.length ? '🏆 Perfect quiz!' : right > 0 ? '🎉 Quiz done!' : '📚 Quiz done'),
    el('p', {class: 'quiz-score'}, el('strong', {}, `${right} of ${questions.length}`), ' secure answers · ',
      el('strong', {}, `+${right * POINTS_PER_SECURE_ANSWER} points`)),
    el('p', {class: 'quiz-row', 'aria-hidden': 'true'}, given.map(a => (a?.correct ? '✅' : '❌')).join(' ')),
    el('p', {class: 'wall-effect is-secure'}, nextPhase === null
      ? 'That was the last quiz. Your answers count towards the final result.'
      : right > 0 ? `🧱 Your secure answers patch the wall for attack ${nextPhase}.` : `No patches this time: attack ${nextPhase} will hit harder.`));
  done.hidden = index !== questions.length;

  return el('section', {class: 'quiz', 'aria-label': 'Quiz'}, dots, slides, done);
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

// `given` is this device's answer, if any. With a room on the host screen, it shows the team's progress instead.
function questionCard(q, state, dispatch, nextPhase, room, given) {
  const thisQuestion = state.answers.filter(a => a.phase === state.phase && a.questionId === q.id);
  const closed = Boolean(given) || state.checkpoint.expired;
  const watching = room && !answersQuestions(room);   // the host screen shows the questions, not buttons to answer

  const options = Object.entries(q.options).map(([letter, text]) => {
    const isCorrect = closed && letter === q.correct;
    const pickedWrong = given && given.choice === letter && !given.correct;
    return el('button', {
      class: `option${isCorrect ? ' is-correct' : ''}${pickedWrong ? ' is-picked-wrong' : ''}`, 'data-letter': letter,
      type: 'button', disabled: closed || watching, 'data-key': `answer-${q.id}-${letter}`,
      onclick: () => dispatch({type: 'answer', questionId: q.id, choice: letter}),
    },
    el('span', {class: 'letter', 'aria-hidden': 'true'}, SHAPES[letter]),
    el('span', {class: 'visually-hidden'}, `${letter}: `),
    el('span', {}, text),
    isCorrect ? el('span', {class: 'option-note'}, '✓ Secure answer') : null,
    pickedWrong ? el('span', {class: 'option-note'}, '✗ Your answer') : null);
  });

  let verdict = null;
  if (watching) {
    const secure = thisQuestion.filter(a => a.correct).length;
    verdict = [
      el('p', {class: 'verdict-line is-team', role: 'status'},
        `👥 ${thisQuestion.length} of ${room.players.length} answered`,
        closed ? ` · ✓ ${secure} secure` : ''),
      closed ? el('p', {class: 'explain'}, el('span', {class: 'explain-label'}, '💡 Why'), q.explanation) : null,
    ];
  } else if (closed) {
    const [kind, words] = !given ? ['is-missed', '⏱ Out of time: 0 points']
      : given.correct ? ['is-secure', `🎉 Nailed it! +${POINTS_PER_SECURE_ANSWER} points`]
        : ['is-wrong', '😬 Not quite: 0 points'];
    const wallEffect = nextPhase === null ? null
      : given?.correct ? `🧱 This patches your wall for attack ${nextPhase}.`
        : `This leaves a gap in your wall for attack ${nextPhase}.`;
    verdict = [
      el('p', {class: `verdict-line ${kind}`, role: 'status'}, words),
      wallEffect ? el('p', {class: `wall-effect ${given?.correct ? 'is-secure' : 'is-gap'}`}, wallEffect) : null,
      el('p', {class: 'explain'}, el('span', {class: 'explain-label'}, '💡 Why'), q.explanation),
    ];
  }

  return el('article', {class: 'panel question'},
    el('div', {class: 'q-meta'}, el('span', {}, q.category), el('span', {}, `Level ${q.tier}: ${q.tier_label}`)),
    el('h3', {tabindex: '-1'}, q.question),
    el('div', {class: 'options'}, options),
    verdict);
}
