// Small helpers for building the screens. Text always goes in as text, never as HTML,
// so nothing from the data can break the page.

// el('button', {class: 'btn', onclick: fn, 'aria-pressed': 'true'}, 'Label', childNode)
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// Decorative pictures get an empty alt text, so screen readers skip them.
export const img = (src, className, alt = '') => src ? el('img', {src, class: className, alt, loading: 'lazy', draggable: 'false'}) : null;

export const money = n => '£' + n.toLocaleString('en-GB');

// Behaviour points can be a team average, so show at most one decimal place.
export const points = n => Number.isInteger(n) ? String(n) : n.toFixed(1);

export const CATEGORIES = ['Prevent', 'Detect', 'Respond'];

// What the player has chosen so far: spent, left, and which categories are covered.
export function budgetSummary(data, selected) {
  const chosen = selected.map(id => data.controls.find(c => c.id === id)).filter(Boolean);
  const spent = chosen.reduce((sum, c) => sum + c.cost, 0);
  const covered = Object.fromEntries(CATEGORIES.map(cat => [cat, chosen.some(c => c.category === cat)]));
  return {spent, left: data.budget - spent, covered, ready: CATEGORIES.every(cat => covered[cat])};
}
