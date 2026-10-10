// Motion: a 3D tilt that follows the pointer, and numbers that count up.
// Both are switched off for players who ask for reduced motion.

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Cards marked data-tilt lean towards the pointer. One listener for the whole page.
export function enableTilt() {
  document.addEventListener('pointermove', event => {
    if (reduceMotion() || event.pointerType !== 'mouse') return;
    const card = event.target.closest?.('[data-tilt]');
    for (const other of document.querySelectorAll('[data-tilt].is-tilted')) {
      if (other !== card) resetTilt(other);
    }
    if (!card) return;
    const box = card.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    card.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
    card.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
    card.style.setProperty('--glare-x', `${((x + 0.5) * 100).toFixed(0)}%`);
    card.style.setProperty('--glare-y', `${((y + 0.5) * 100).toFixed(0)}%`);
    card.classList.add('is-tilted');
  });
  document.addEventListener('pointerleave', () => document.querySelectorAll('[data-tilt].is-tilted').forEach(resetTilt));
}

function resetTilt(card) {
  card.style.removeProperty('--rx');
  card.style.removeProperty('--ry');
  card.classList.remove('is-tilted');
}

// Elements with data-count-to="38" count up from 0 when a screen first appears.
// The final number is always in the page, so nothing is lost if the animation is skipped.
export function countUp(root) {
  if (reduceMotion()) return;
  for (const node of root.querySelectorAll('[data-count-to]')) {
    const target = Number(node.dataset.countTo);
    const decimals = Number.isInteger(target) ? 0 : 1;
    const start = performance.now();
    const duration = 900;
    const step = now => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      node.textContent = (target * eased).toFixed(decimals);
      if (t < 1) requestAnimationFrame(step);
      else node.textContent = target.toFixed(decimals);
    };
    requestAnimationFrame(step);
  }
}

// A burst of confetti from the middle of an element. Decorative, and skipped under reduced motion.
export function confetti(target, count = 30) {
  if (reduceMotion() || !target?.isConnected) return;
  const box = target.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.left = `${box.left + box.width / 2}px`;
  layer.style.top = `${box.top + box.height / 2}px`;
  const colours = ['#26bf64', '#ffb536', '#3cc2ff', '#ff9c1a', '#f3f4f3'];
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('i');
    const angle = Math.random() * Math.PI * 2;
    const distance = 70 + Math.random() * 130;
    bit.style.setProperty('--x', `${(Math.cos(angle) * distance).toFixed(0)}px`);
    bit.style.setProperty('--y', `${(Math.sin(angle) * distance - 70).toFixed(0)}px`);
    bit.style.setProperty('--r', `${(Math.random() * 720 - 360).toFixed(0)}deg`);
    bit.style.background = colours[i % colours.length];
    bit.style.animationDelay = `${(Math.random() * 0.1).toFixed(2)}s`;
    layer.append(bit);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 1500);
}

// Text that floats up from an element and fades, like "+2" or "−£350k".
// The same news is always shown in words on the screen too, so this is extra.
export function floatText(target, text, kind = '') {
  if (!target?.isConnected) return;
  const box = target.getBoundingClientRect();
  const tag = document.createElement('span');
  tag.className = `float-text ${kind}`;
  tag.setAttribute('aria-hidden', 'true');
  tag.textContent = text;
  tag.style.left = `${box.left + box.width / 2}px`;
  tag.style.top = `${box.top + 12}px`;
  document.body.append(tag);
  setTimeout(() => tag.remove(), reduceMotion() ? 900 : 1300);
}

// Restart a one-off CSS animation on an element (a pop or a shake).
export function bump(target, className) {
  if (!target || reduceMotion()) return;
  target.classList.remove(className);
  void target.offsetWidth;
  target.classList.add(className);
}
