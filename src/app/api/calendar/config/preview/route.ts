/** "How many events would these filters actually publish?" — the live counts the Phase 3
 *  settings UI shows beside the filter controls, without saving anything.
 *
 *  A POST despite being a read: a read-only user cannot edit filters at all (the whole control
 *  set is hidden client-side), so a 403 from the write gate is the consistent answer here, and
 *  it avoids stuffing a JSON filter blob into a query string.
 */
import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api-helpers';
import { getUserId } from '@/lib/auth';
import { parseFeedFilters, filterItems, countByKind } from '@/lib/calendar/filters';
import { buildCalendarItems } from '@/lib/calendar/items';
import { localToday } from '@/lib/trip-status';

function toRawFilters(filters: unknown): string | null {
  if (typeof filters === 'string') return filters;
  if (filters === undefined || filters === null) return null;
  try {
    return JSON.stringify(filters);
  } catch {
    return null;
  }
}

export const POST = withErrorHandling(async (request: Request) => {
  const userId = getUserId(request);
  // Not `.catch(() => ({}))`: swallowing a JSON syntax error would answer a broken request
  // with the counts for the DEFAULT filters, so the UI would cheerfully report "33 events
  // will publish" for a request that never parsed. Let withErrorHandling turn it into the
  // same 400 that PUT /api/calendar/config returns, so both endpoints behave alike.
  const body = await request.json() as { filters?: unknown };

  // The candidate filters are not stored — this previews them against the live data.
  const filters = parseFeedFilters(toRawFilters(body.filters));
  const items = buildCalendarItems({ userId });
  const kept = filterItems(items, filters, localToday());

  // Items with a wall time but no resolved timezone are published as all-day with the time moved
  // into the title (see buildVEvent). That degradation is deliberate and safe, but silent — so
  // the count is surfaced in Settings rather than left for someone to notice months later.
  const unresolvedTimezones = kept.filter((i) => i.start.time && !i.start.utcStamp).length;

  return NextResponse.json({ total: kept.length, byKind: countByKind(kept), unresolvedTimezones });
});
