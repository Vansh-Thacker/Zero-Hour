// Start screens, shown before the game: pick single player or multiplayer, then enter a name.
// They only choose where to go next; main.mjs starts the game or opens the multiplayer page.

import {GAME_NAME, BUSINESS_NAME} from '../config.mjs';
import {SCENE} from './assets.mjs';
import {el, img} from './dom.mjs';
import {brandBar} from './app.mjs';

const MODES = {
  single: {
    title: 'Single player',
    tag: 'One screen',
    blurb: 'Play on this screen, alone or with your team around it. Choose your defences, live through the night and answer the checkpoints together.',
    art: SCENE.office,
  },
  multi: {
    title: 'Multiplayer',
    tag: 'Phones',
    blurb: 'One screen hosts the room; everyone joins on their phone with a room code. Each player looks after Prevent, Detect or Respond.',
    art: SCENE.operator,
  },
};

const NAME_LIMIT = 24;

function page(...content) {
  return el('div', {class: 'shell'},
    brandBar(),
    el('main', {class: 'screen is-entering', id: 'screen'}, content),
    el('p', {class: 'footer-note'},
      `${BUSINESS_NAME} is fictional. A teaching game: controls, prices and points are simplified for learning, not advice on what to buy.`));
}

// Home: two big mode cards. pick('single' | 'multi') moves on to the name screen.
export function homeScreen(pick) {
  const cards = Object.entries(MODES).map(([mode, info]) =>
    el('button', {class: 'mode-card', type: 'button', 'data-key': `mode-${mode}`, 'data-tilt': true,
      'aria-label': `${info.title}: ${info.blurb}`, onclick: () => pick(mode)},
    el('span', {class: 'mode-art', 'aria-hidden': 'true'}, img(info.art)),
    el('span', {class: 'mode-body'},
      el('span', {class: 'crew-tag'}, info.tag),
      el('span', {class: 'mode-title'}, info.title),
      el('span', {class: 'mode-blurb'}, info.blurb),
      el('span', {class: 'mode-go'}, 'Choose →'))));

  return page(
    el('section', {class: 'brief home-hero'},
      el('div', {},
        el('span', {class: 'eyebrow'}, 'Tonight’s job'),
        el('h1', {class: 'screen-title'}, GAME_NAME),
        el('p', {class: 'lead'},
          `A crew plans to break into ${BUSINESS_NAME} overnight. You run the security team: `,
          'spend the budget on defences, watch the attack unfold hour by hour, and make the right calls under pressure.')),
      el('div', {class: 'brief-art', 'aria-hidden': 'true'}, img(SCENE.substation, 'a'), img(SCENE.turbine, 'b'))),
    el('h2', {class: 'mode-heading'}, 'How are you playing?'),
    el('div', {class: 'modes'}, cards));
}

// Name screen. go(name) moves on; `error` is a readable message to show.
export function nameScreen({mode, name = '', error = null}, {back, go}) {
  const nameInput = el('input', {id: 'player-name', class: 'field', name: 'name', value: name, maxlength: NAME_LIMIT,
    autocomplete: 'nickname', required: true, placeholder: 'e.g. Sam', 'data-key': 'name'});

  const form = el('form', {class: 'panel name-form', novalidate: true, onsubmit: event => {
    event.preventDefault();
    go(nameInput.value.trim());
  }},
  el('label', {for: 'player-name'}, 'Your username'),
  nameInput,
  error ? el('p', {class: 'alert', role: 'alert'}, error) : null,
  el('div', {class: 'actions'},
    el('button', {class: 'btn btn-ghost', type: 'button', 'data-key': 'back', onclick: back}, '← Back'),
    el('button', {class: 'btn btn-primary', type: 'submit', 'data-key': 'go'}, 'Continue →')));

  return page(
    el('section', {class: 'name-head'},
      el('span', {class: 'eyebrow'}, `${MODES[mode].title} · Step 2 of 2`),
      el('h1', {class: 'screen-title'}, 'Who’s on shift tonight?'),
      el('p', {class: 'lead'}, 'Enter your username to sign in to the security desk.')),
    form);
}

// Readable check shared by every route. Returns a message, or null if the name is fine.
export function nameProblem(name) {
  if (!name) return 'Enter a username to continue.';
  if (name.length > NAME_LIMIT) return `Keep your username to ${NAME_LIMIT} characters or fewer.`;
  return null;
}
