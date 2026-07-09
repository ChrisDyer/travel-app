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
