// Little sounds made in the browser (no audio files): a blip when you add a control,
// a chime for a secure answer, a buzz for a wrong one, a fanfare at the end.
// The 🔊 button in the header turns them off, and the choice is remembered on this device.

const KEY = 'zero-hour-muted';
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
let ctx = null;

export const isMuted = () => muted;

export function setMuted(on) {
  muted = on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* not remembered: fine */ }
}

// [frequency in Hz, length in seconds] for each note, played one after another.
const TUNES = {
  add: [[660, 0.06], [990, 0.1]],
  remove: [[520, 0.06], [390, 0.1]],
  lock: [[523, 0.09], [659, 0.09], [784, 0.18]],
  reveal: [[330, 0.08], [494, 0.12]],
  correct: [[784, 0.08], [1047, 0.2]],
  wrong: [[262, 0.12], [196, 0.22]],
  win: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.32]],
  draw: [[523, 0.12], [659, 0.12], [587, 0.24]],
  lose: [[392, 0.16], [330, 0.16], [262, 0.34]],
};

export function play(name) {
  if (muted || !TUNES[name]) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    let at = ctx.currentTime + 0.01;
    for (const [freq, length] of TUNES[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = name === 'wrong' || name === 'lose' ? 'sawtooth' : 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(name === 'wrong' ? 0.05 : 0.11, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + length + 0.02);
      at += length * 0.85;
    }
  } catch { /* no sound on this browser: the game works the same */ }
}
