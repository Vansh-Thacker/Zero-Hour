// Shared pieces of the host and phone screens. They only read the view the server sends;
// every rule lives in the engine and src/server/rooms.mjs.

export const CATEGORIES = ['Prevent', 'Detect', 'Respond'];
export const ROLE_NAMES = {Prevent: 'Gatekeeper', Detect: 'Watcher', Respond: 'Responder'};
export const pounds = amount => '£' + amount.toLocaleString('en-GB');

/** Build an element. Text is always added as text, never as HTML, so player names are safe. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

/** Redraw, keeping keyboard focus on the same control (matched by id) after live updates. */
export function redraw(root, ...nodes) {
  const focusedId = document.activeElement?.id;
  root.replaceChildren(...nodes.flat().filter(n => n != null && n !== false));
  if (focusedId) document.getElementById(focusedId)?.focus();
}

const costOf = (data, ids) => ids.reduce((sum, id) => sum + (data.controls.find(c => c.id === id)?.cost ?? 0), 0);
export const spent = (data, state) => costOf(data, state.selected);

/** The shared budget, with a tick per category in words as well as colour. */
export function budgetPanel(data, state) {
  const used = spent(data, state);
  const parts = CATEGORIES.map(category => {
    const ids = state.selected.filter(id => data.controls.find(c => c.id === id)?.category === category);
    return {category, amount: costOf(data, ids), covered: ids.length > 0};
  });
  return h('section', {class: 'card', 'aria-label': 'Shared budget'},
    h('p', {class: 'spread'}, h('b', {}, 'Shared budget'),
      h('span', {}, h('b', {}, pounds(used)), ` of ${pounds(data.budget)} spent · `, h('b', {}, `${pounds(data.budget - used)} left`))),
    h('div', {class: 'bar', role: 'img', 'aria-label': `${Math.round(100 * used / data.budget)}% of the budget spent`},
      ...parts.map(p => h('span', {class: `fill ${p.category}`, style: `width:${100 * p.amount / data.budget}%`}))),
    h('p', {class: 'ticks'}, ...parts.map(p => h('span', {class: p.covered ? 'tick ok' : 'tick'},
      p.covered ? `✓ ${p.category} covered` : `○ ${p.category} needed`))));
}

/** What the team has bought, grouped by category, with who owns each category. */
export function basketPanel(data, state, players) {
  return h('section', {class: 'card'},
    h('h2', {}, 'Team basket'),
    ...CATEGORIES.map(category => {
      const owners = players.filter(p => p.category === category).map(p => p.name);
      const chosen = state.selected.map(id => data.controls.find(c => c.id === id)).filter(c => c?.category === category);
      return h('div', {},
        h('p', {class: `label ${category}`}, `${ROLE_NAMES[category]} (${category}) · ${owners.join(', ') || 'nobody yet'}`),
        chosen.length
          ? h('ul', {}, ...chosen.map(c => h('li', {}, `${c.id} ${c.name} · ${pounds(c.cost)}`)))
          : h('p', {class: 'quiet'}, 'Nothing chosen yet.'));
    }));
}

export function logPanel(log) {
  return h('section', {class: 'card'},
    h('h2', {}, 'Live activity'),
    log.length
      ? h('ul', {class: 'log'}, ...log.slice(0, 8).map(entry =>
          h('li', {class: entry.ok ? '' : 'refused'}, h('b', {}, entry.ok ? '✓ ' : '✕ Refused: '), entry.text)))
      : h('p', {class: 'quiet'}, 'Nothing has happened yet.'));
}

/** Seconds left on the shared checkpoint clock, worked out from the server's timer. */
export function secondsLeft(checkpoint, limitSeconds, skewMs = 0) {
  if (!checkpoint) return 0;
  const {timer} = checkpoint;
  const now = Date.now() + skewMs;
  const pausedFor = timer.pausedMs + (timer.pausedAt === null ? 0 : now - timer.pausedAt);
  return Math.max(0, Math.ceil((limitSeconds * 1000 - (now - timer.startedAt - pausedFor)) / 1000));
}

export const clock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** The story or result for the current stage, the same on every screen. */
export function stagePanel(data, state) {
  if (!state.confirmed) return null;
  const phase = data.phases[state.phase];
  if (state.stage === 'outcome') {
    const behaviour = state.behaviourPoints.reduce((a, b) => a + b, 0);
    return h('section', {class: 'card stage'},
      h('p', {class: 'eyebrow'}, 'FINAL OUTCOME'),
      h('p', {class: 'scores'},
        h('span', {}, 'Control score ', h('b', {}, String(state.result.total))),
        h('span', {}, 'Behaviour points ', h('b', {}, String(Math.round(behaviour * 10) / 10))),
        h('span', {}, 'Total ', h('b', {}, String(Math.round((state.result.total + behaviour) * 10) / 10)))));
  }
  const phaseResult = state.result.phases[state.phase];
  return h('section', {class: 'card stage'},
    h('p', {class: 'eyebrow'}, `PHASE ${state.phase + 1} OF 4 · ${phase.local_time}`),
    h('h2', {}, phase.title),
    state.stage === 'story' ? h('p', {}, phase.story) : null,
    state.stage !== 'story'
      ? h('div', {},
          h('p', {}, `Your controls scored `, h('b', {}, String(phaseResult.score)), ' points in this phase.'),
          h('ul', {}, ...phaseResult.contributions.map(c => {
            const control = data.controls.find(x => x.id === c.id);
            return h('li', {}, `${c.id} ${control.name}: ${c.points > 0 ? '+' + c.points : '0'}`);
          })))
      : null);
}
