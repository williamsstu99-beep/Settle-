/**
 * Commute times are compared at a fixed, honest moment: the next weekday
 * morning peak in the user's time zone. That keeps every comparison
 * like-for-like and lets results be cached.
 */

const WEEKDAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: string };

function partsIn(date: Date, timeZone: string): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    weekday: p.weekday,
  };
}

/** Offset of `timeZone` from UTC at `date`, in milliseconds. */
function offsetMs(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(date.getTime() / 60000) * 60000;
}

/** The UTC instant for a wall-clock time in `timeZone`. Handles DST shifts. */
export function zonedTime(year: number, month: number, day: number, hour: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour);
  let t = guess - offsetMs(new Date(guess), timeZone);
  t = guess - offsetMs(new Date(t), timeZone);
  return new Date(t);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Next weekday at `hour`:00 local time that is still in the future. */
export function nextPeakDeparture(timeZone: string, now: Date = new Date(), hour = 8): Date {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const today = partsIn(now, tz);
  for (let i = 0; i < 8; i++) {
    // Walk calendar days in the target zone via a noon anchor (safe across DST).
    const noon = zonedTime(today.year, today.month, today.day, 12, tz);
    const d = partsIn(new Date(noon.getTime() + i * 86400000), tz);
    if (!WEEKDAYS.has(d.weekday)) continue;
    const t = zonedTime(d.year, d.month, d.day, hour, tz);
    if (t.getTime() > now.getTime() + 60000) return t;
  }
  throw new Error("unreachable: no weekday found in 8 days");
}
