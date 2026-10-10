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
