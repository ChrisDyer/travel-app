/** Date-only helpers for 'YYYY-MM-DD' strings. Never use `new Date(str)` + toISOString()
 *  for date-only values: parsing at local midnight then converting to UTC shifts the day
 *  on any server west of UTC. Anchoring at NOON UTC is immune to offsets and DST. */

export function nextDay(date: string): string {
  const dt = new Date(date + 'T12:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = nextDay(d)) out.push(d);
  return out;
}

/** 'HH:MM' → '3:05 PM'. Returns null for null/empty input. */
export function fmt12(time: string | null | undefined): string | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** 'YYYY-MM-DD' → 'Sat, Aug 8'. Returns null for null/empty input. */
export function fmtShortDate(date: string | null | undefined): string | null {
  if (!date) return null;
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** 'YYYY-MM-DD' → { weekday: 'Saturday', date: 'August 8' } (DaySection header parts). */
export function fmtWeekdayParts(date: string): { weekday: string; date: string } {
  const d = new Date(date + 'T00:00:00');
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'long' }),
    date: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
  };
}

/** Date range for headers/cards.
 *  style 'short' → 'Aug 8 – Aug 15, 2026' (trips list)
 *  style 'long'  → 'August 8 – August 15, 2026' (trip page header) */
export function formatDateRange(start: string, end: string, style: 'short' | 'long' = 'short'): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const monthFormat = style === 'long' ? 'long' : 'short';
  return `${s.toLocaleDateString('en-US', { month: monthFormat, day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: monthFormat, day: 'numeric', year: 'numeric' })}`;
}
