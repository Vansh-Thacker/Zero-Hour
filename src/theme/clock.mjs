/**
 * clock.mjs
 * ----------
 * The heist clock: each phase's local time (Mon 16:40 -> Tue 02:00 -> 03:30 -> 06:30)
 * and how far through the night it is, from 0 (first phase) to 1 (last phase).
 */

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MINUTES_PER_DAY = 24 * 60;

/**
 * Reads a time like "Monday 16:40", "Tue 02:00" or just "03:30".
 * @returns {{ day: number | null, minutes: number } | null} minutes since midnight
 */
function parseLocalTime(text) {
  const match = String(text ?? '').toLowerCase().match(/(?:([a-z]{3})[a-z]*\s+)?(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const [, dayWord, hours, minutes] = match;
  const day = dayWord && DAYS.includes(dayWord) ? DAYS.indexOf(dayWord) : null;
  return { day, minutes: Number(hours) * 60 + Number(minutes) };
}

/**
 * Minutes since the start of the night for every phase, in order.
 * If a phase has no day ("03:30"), it carries on from the phase before,
 * moving to the next day if the clock has gone past midnight.
 */
function phaseMinutes(data) {
  const result = [];
  let dayOffset = 0;
  let previous = null;
  let firstDay = null;

  for (const phase of data.phases) {
    const time = parseLocalTime(phase.local_time);
    if (!time) return null; // unreadable: callers fall back to even spacing

    if (time.day !== null) {
      if (firstDay === null) firstDay = time.day;
      dayOffset = (time.day - firstDay + 7) % 7;
    }
    let total = dayOffset * MINUTES_PER_DAY + time.minutes;
    if (previous !== null && total < previous) {
      dayOffset += 1;
      total += MINUTES_PER_DAY;
    }
    result.push(total);
    previous = total;
  }
  return result;
}

/**
 * The clock for phase n.
 * @returns {{ label: string, progress: number }} label like "Tuesday 02:00", progress 0..1
 */
export function heistClock(data, n) {
  const label = data.phases[n]?.local_time ?? '';
  const last = data.phases.length - 1;
  if (last <= 0) return { label, progress: 1 };

  const minutes = phaseMinutes(data);
  if (!minutes || minutes[last] === minutes[0]) {
    return { label, progress: n / last }; // even spacing if times can't be read
  }

  const progress = (minutes[n] - minutes[0]) / (minutes[last] - minutes[0]);
  return { label, progress: Math.min(1, Math.max(0, progress)) };
}
