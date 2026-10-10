// Start screens, shown before the game: pick single player or multiplayer, then enter a name.
// Multiplayer has one extra step first: host a room on this screen, or join one.
// They only choose where to go next; main.mjs starts the game or opens the multiplayer page.

import {GAME_NAME, BUSINESS_NAME} from '../config.mjs';
import {SCENE} from './assets.mjs';
import {el, img} from './dom.mjs';
import {brandBar} from './app.mjs';
import {SQUADS} from './fun.mjs';

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

// Multiplayer: host a room on this screen, or join one on a phone. Only players need a name;
// the host screen (host.html) just creates the room and shows the code.
const ROOM_CHOICES = {
  host: {
    title: 'Host a room',
    tag: 'Main screen',
    blurb: 'Put this screen where the team can see it. Create the room, share the code, and run the night for everyone.',
    art: SCENE.office,
  },
  join: {
    title: 'Join a room',
    tag: 'Your phone',
    blurb: 'Enter the room code from the host screen. You will look after Prevent, Detect or Respond for your team.',
    art: SCENE.operator,
  },
};

export function multiScreen({host, join, back}) {
  const actions = {host, join};
  const cards = Object.entries(ROOM_CHOICES).map(([choice, info]) =>
    el('button', {class: 'mode-card', type: 'button', 'data-key': `room-${choice}`, 'data-tilt': true,
      'aria-label': `${info.title}: ${info.blurb}`, onclick: actions[choice]},
    el('span', {class: 'mode-art', 'aria-hidden': 'true'}, img(info.art)),
    el('span', {class: 'mode-body'},
      el('span', {class: 'crew-tag'}, info.tag),
      el('span', {class: 'mode-title'}, info.title),
      el('span', {class: 'mode-blurb'}, info.blurb),
      el('span', {class: 'mode-go'}, 'Choose →'))));

  return page(
    el('section', {class: 'name-head'},
      el('span', {class: 'eyebrow'}, 'Multiplayer · Step 2 of 3'),
      el('h1', {class: 'screen-title'}, 'Host or join?'),
      el('p', {class: 'lead'}, 'One screen hosts the room. Everyone else joins on their phone with the room code.')),
    el('div', {class: 'modes'}, cards),
    el('div', {class: 'actions'},
      el('button', {class: 'btn btn-ghost', type: 'button', 'data-key': 'back', onclick: back}, '← Back')));
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
      el('span', {class: 'eyebrow'}, mode === 'multi' ? 'Multiplayer · Join · Step 3 of 3' : `${MODES[mode].title} · Step 2 of 2`),
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

// --- Multiplayer pages (play.html and host.html), in the same look as the start screens. ---

// Phone: room code and username. join(code, name) tries to join; `error` is a readable message.
export function joinScreen({code = '', name = '', error = null, busy = false}, join) {
  const codeInput = el('input', {id: 'room-code', class: 'field field-code', name: 'code', value: code, autocomplete: 'off',
    autocapitalize: 'characters', spellcheck: 'false', required: true, placeholder: 'VAULT-00', 'data-key': 'code'});
  const nameInput = el('input', {id: 'player-name', class: 'field', name: 'name', value: name, maxlength: NAME_LIMIT,
    autocomplete: 'nickname', required: true, placeholder: 'e.g. Sam', 'data-key': 'name'});

  const form = el('form', {class: 'panel name-form join-form', novalidate: true, onsubmit: event => {
    event.preventDefault();
    join(codeInput.value.trim(), nameInput.value.trim());
  }},
  el('label', {for: 'room-code'}, '🔑 Room code'),
  codeInput,
  el('label', {for: 'player-name'}, '😎 Your name'),
  nameInput,
  error ? el('p', {class: 'alert', role: 'alert'}, error) : null,
  el('div', {class: 'actions'},
    el('a', {class: 'btn btn-ghost', href: '/index.html', 'data-key': 'back'}, '← Home'),
    el('button', {class: 'btn btn-primary btn-big', type: 'submit', 'data-key': 'go', disabled: busy}, busy ? 'Joining…' : '🚀 Join the team')));

  return page(
    el('section', {class: 'name-head'},
      el('span', {class: 'eyebrow'}, '📱 Multiplayer · Join'),
      el('h1', {class: 'screen-title'}, 'Join the defence team'),
      el('p', {class: 'lead'}, 'Type the code from the big screen. You’ll get a squad:'),
      squadStrip()),
    form);
}

const squadStrip = () => el('ul', {class: 'squad-strip', 'aria-label': 'The three squads'},
  Object.entries(SQUADS).map(([cat, s]) => el('li', {'data-cat': cat},
    el('span', {class: 'squad-icon', 'aria-hidden': 'true'}, s.icon), el('strong', {}, s.name), el('span', {}, s.job))));

// Host: one button to open the room. create() asks the server for a room code.
export function hostStartScreen({error = null, busy = false}, create) {
  const step = (icon, title, line) => el('li', {}, el('span', {class: 'host-step-icon', 'aria-hidden': 'true'}, icon), el('strong', {}, title), el('span', {}, line));
  return page(
    el('section', {class: 'brief home-hero'},
      el('div', {},
        el('span', {class: 'eyebrow'}, '🖥️ Multiplayer · Host'),
        el('h1', {class: 'screen-title'}, 'Run the night'),
        el('p', {class: 'lead'}, 'Put this screen where everyone can see it.'),
        el('ol', {class: 'host-steps'},
          step('🔓', 'Open a room', 'Get a code'),
          step('📱', 'Team joins', 'On their phones'),
          step('🎮', 'Play together', 'You run the night')),
        error ? el('p', {class: 'alert', role: 'alert'}, error) : null,
        el('div', {class: 'actions start-actions'},
          el('a', {class: 'btn btn-ghost', href: '/index.html', 'data-key': 'back'}, '← Home'),
          el('button', {class: `btn btn-primary btn-big${busy ? '' : ' is-ready'}`, type: 'button', 'data-key': 'create', disabled: busy, onclick: create},
            busy ? 'Opening…' : '🔓 Open a room'))),
      el('div', {class: 'brief-art', 'aria-hidden': 'true'}, img(SCENE.office, 'a'), img(SCENE.operator, 'b'))));
}
