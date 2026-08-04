import { db } from '@/db';
import { getUserId } from '@/lib/auth';
import { buildCalendarItems } from '@/lib/calendar/items';
import { EXPORT_PRESET, prepareItems } from '@/lib/calendar/filters';
import { buildCalendar, buildVEvent } from '@/lib/calendar/ics';
import { localToday } from '@/lib/trip-status';

// The iCalendar helpers that used to live here now sit in src/lib/calendar/, shared with the
// subscribe-able feed. This route is one of two callers of the same normalizer + predicate;
// it differs only in scoping to a single trip and in downloading as an attachment.
//
// No `export const dynamic`: Route Handlers are uncached by default and the route segment
// config is removed under Cache Components in v16. Do not add one as "future-proofing".

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = getUserId(request);

  const tripRow = db.prepare('SELECT title FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId) as { title: string } | undefined;
  if (!tripRow) return new Response('Not found', { status: 404 });

  // EXPORT_PRESET filters nothing — the download keeps showing everything, as it always has,
  // descriptions included: this is an authenticated download of one trip to your own machine,
  // not a public URL. It still runs the predicate so hide_from_calendar is honoured here too.
  const items = buildCalendarItems({ userId, tripId });
  const kept = prepareItems(items, EXPORT_PRESET, localToday());
  const calendar = buildCalendar(
    tripRow.title,
    kept.map((item) => buildVEvent(item)).filter((v): v is string => v !== null)
  );

  const safeName = (tripRow.title || 'trip').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'trip';

  return new Response(calendar, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeName}.ics"`,
    },
  });
}
