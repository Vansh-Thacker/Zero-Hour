// The page frame and screen switching. render() reads state and draws it;
// player actions go back to the engine through dispatch(). Nothing here changes state.
// Multiplayer uses the same screens: pass `room` (the server's view for this seat) and
// dispatch() sends the action to the server instead. A room bar shows the code and the team.

import {GAME_NAME, BUSINESS_NAME} from '../config.mjs';
import {LOGO} from './assets.mjs';
import {el, money, points, budgetSummary} from './dom.mjs';
import {countUp} from './effects.mjs';
import {chooseScreen} from './chooseScreen.mjs';
import {storyScreen} from './storyScreen.mjs';
import {revealScreen} from './revealScreen.mjs';
import {checkpointScreen, updateTimer} from './checkpointScreen.mjs';
import {outcomeScreen} from './outcomeScreen.mjs';
import {openWeakWarning} from './battleDisplay.mjs';
import {roomBar} from './roomBar.mjs';

const SCREENS = {choose: chooseScreen, story: storyScreen, reveal: revealScreen, checkpoint: checkpointScreen, outcome: outcomeScreen};

// Vansh's heist theme is optional: if its files are there, the screens show heist names,
// the theme panel and the heist ending. If not, the game works the same without them.
export async function loadExtras() {
  const optional = path => import(path).catch(() => ({}));
  const [names, vault, theme] = await Promise.all([
    optional('../theme/heistNames.mjs'), optional('../theme/vault.mjs'), optional('../theme/theme.mjs')]);
  if (theme.renderTheme) {
    document.head.append(el('link', {rel: 'stylesheet', href: new URL('../theme/theme.css', import.meta.url).href}));
  }
  return {
    heistName: names.heistName,
    heistPhaseTitle: names.heistPhase && ((id, n) => names.heistPhase(id, n).title),
    roleName: names.roleFor && (cat => names.roleFor(cat)?.role),
    heistOutcome: vault.heistOutcome,
    renderTheme: theme.renderTheme,
  };
}

let lastScreenKey = null;

export function render(root, state, game, dispatch, extras, room = null) {
  const focusedKey = document.activeElement?.dataset?.key;
  const openSheet = root.querySelector('dialog.sheet[open]')?.id;
  const sheetScroll = root.querySelector('dialog.sheet[open]')?.scrollTop ?? 0;
  const screenKey = `${state.stage}-${state.phase}`;
  const entering = screenKey !== lastScreenKey;
  lastScreenKey = screenKey;

  const screen = el('main', {class: `screen${entering ? ' is-entering' : ''}`, id: 'screen'},
    SCREENS[state.stage](state, game, dispatch, extras, room));

  root.replaceChildren(el('div', {class: 'shell'},
    topbar(state, game.data),
    room ? roomBar(room) : null,
    state.confirmed ? phaseTrack(state, game.data) : null,
    screen,
    el('p', {class: 'footer-note'},
      `${BUSINESS_NAME} is fictional. A teaching game: controls, prices and points are simplified for learning, not advice on what to buy.`)));

  const slot = screen.querySelector('#theme-slot');
  if (slot && extras.renderTheme) extras.renderTheme(slot, state, game.data, {showOutcome: state.stage === 'outcome'});

  if (entering) {
    window.scrollTo({top: 0, behavior: 'instant'});
    countUp(screen);
  }
  if (state.stage === 'reveal') openWeakWarning(screen, state);
  const sheet = openSheet && !entering ? root.querySelector(`#${CSS.escape(openSheet)}`) : null;
  if (sheet) {
    sheet.classList.add('is-reopened');   // no opening animation when it was already open
    sheet.showModal();
    sheet.scrollTop = sheetScroll;
  }
  if (focusedKey) root.querySelector(`[data-key="${CSS.escape(focusedKey)}"]`)?.focus({preventScroll: true});
}

// Once a second during a checkpoint: update the countdown only, so focus and animations stay put.
export function tick(root, state) {
  const ring = root.querySelector('[data-timer]');
  if (ring && state.checkpoint) updateTimer(ring, state.checkpoint);
}

function topbar(state, data) {
  const chips = [];
  if (!state.confirmed) {
    chips.push(el('span', {class: 'chip'}, 'Budget left ', el('strong', {}, money(budgetSummary(data, state.selected).left))));
  } else {
    const revealedUpTo = state.stage === 'outcome' ? data.phases.length : state.stage === 'story' ? state.phase : state.phase + 1;
    const control = state.result.phases.slice(0, revealedUpTo).reduce((sum, p) => sum + p.score, 0);
    const behaviour = state.behaviourPoints.reduce((sum, p) => sum + p, 0);
    chips.push(
      el('span', {class: 'chip'}, 'Control ', el('strong', {}, String(control))),
      el('span', {class: 'chip'}, 'Behaviour ', el('strong', {}, points(behaviour))));
  }
  return brandBar(chips);
}

// The logo, game name and business line at the top of every screen, including the start screens.
export function brandBar(chips = []) {
  return el('header', {class: 'topbar'},
    el('div', {class: 'brand'},
      el('span', {class: 'brand-logo'}, el('img', {src: LOGO, alt: 'ScottishPower'})),
      el('span', {class: 'brand-name'},
        el('span', {class: 'wordmark'}, wordmark(GAME_NAME)),
        el('span', {class: 'brand-sub'}, `Protecting ${BUSINESS_NAME}`))),
    el('div', {class: 'chips'}, chips));
}

// "Zero Hour" -> "ZERO" + red "HOUR". Any other name is shown as it is.
function wordmark(name) {
  const [first, ...rest] = name.split(' ');
  return rest.length ? [first + ' ', el('span', {}, rest.join(' '))] : name;
}

export function phaseTrack(state, data) {
  return el('ol', {class: 'track', 'aria-label': 'The night of the attack'},
    data.phases.map((phase, n) => {
      const done = state.stage === 'outcome' || n < state.phase;
      const now = !done && n === state.phase;
      return el('li', {class: done ? 'is-done' : now ? 'is-now' : '', 'data-mark': done ? '✓' : String(n + 1),
        'aria-current': now ? 'step' : null},
      el('span', {class: 'time'}, phase.local_time), phase.title);
    }));
}
