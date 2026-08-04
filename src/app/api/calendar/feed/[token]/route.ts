/** The public, subscribe-able ICS feed.
 *
 *  Public URL: https://zo-bot.com/travel/api/calendar/feed/<token>.ics
 *
 *  This is the ONE route in the app reachable without a Cloudflare Access identity — see the
 *  PUBLIC_PATH_PREFIXES allowlist in src/proxy.ts. Google Calendar's fetcher presents no
 *  cookies, no JWT and no header we control, so the random token in the path is the whole
 *  credential.
 *
 *  It lives under `feed/` rather than at /api/calendar/[token] so the proxy allowlist and the
 *  Cloudflare Access bypass are both exact prefix matches, instead of having to distinguish
 *  the public feed from the management routes by exclusion.
 *
 *  Only GET is exported. Next answers 405 to every other method, and that is precisely what
 *  makes the proxy bypass safe: skipping the auth block cannot open a write path.
 *
 *  No `export const dynamic`: Route Handlers are uncached by default and the route segment
 *  config is removed under Cache Components in v16. Do not add one as "future-proofing".
 */
import { getFeedByToken, recordFetch } from '@/lib/calendar/feeds';
import { isValidTokenShape, stripIcsSuffix } from '@/lib/calendar/token';
import { parseFeedFilters, prepareItems } from '@/lib/calendar/filters';
import { buildCalendarItems } from '@/lib/calendar/items';
import { buildCalendar, buildVEvent } from '@/lib/calendar/ics';
import { localToday } from '@/lib/trip-status';

/** Every failure returns this identical bare 404 — a malformed token, a well-formed token with
 *  no row, and a deleted feed are indistinguishable. Never 403: that would confirm the
 *  resource exists. Never distinguish "wrong token" from "no such feed".
 *
 *  There is deliberately no constant-time compare. The unique index makes the lookup a B-tree
 *  probe on a 256-bit secret; timingSafeEqual would require SELECT-ing every feed and comparing
 *  in JS, which removes the index and adds nothing. Every failure path returns this same
 *  response, so there is no early-exit oracle. */
function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  // '<token>.ics' and '<token>' both resolve to the same feed.
  const raw = stripIcsSuffix((await ctx.params).token);

  // A cheap shape check, not authentication: it keeps junk out of SQL and the logs.
  if (!isValidTokenShape(raw)) return notFound();

  const feed = getFeedByToken(raw);
  if (!feed) return notFound();

  const filters = parseFeedFilters(feed.filters);
  // No tripId: a feed spans every trip its owner has. buildCalendarItems scopes by user_id,
  // so a feed can never see another user's data.
  const items = buildCalendarItems({ userId: feed.userId });
  // prepareItems, not filterItems: it also drops DESCRIPTION unless the feed opts into
  // booking details. This is a public URL — do not swap it for the bare predicate.
  const kept = prepareItems(items, filters, localToday());

  const body = buildCalendar(
    feed.name,
    kept.map((item) => buildVEvent(item)).filter((v): v is string => v !== null)
  );

  recordFetch(feed.id, request.headers.get('user-agent'));

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      // A stale copy cached behind Cloudflare would persist for up to a day and be
      // indistinguishable from Google simply being slow to poll.
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      // Defence in depth if the URL ever leaks somewhere crawlable.
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      // Content-Disposition is deliberately OMITTED. 'attachment' makes some clients download
      // the file instead of subscribing to it. The per-trip export route keeps its own.
    },
  });
}
