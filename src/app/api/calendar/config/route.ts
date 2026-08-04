/** Feed configuration. Deliberately NOT under /api/calendar/feed/, so it stays behind
 *  Cloudflare Access and behind the ADMIN_EMAILS write gate in src/proxy.ts — a read-only
 *  user gets 403 {"error":"read_only"} here for free, with no per-route auth code.
 *
 *  There is no GET: the Settings page is an async server component and reads the row
 *  directly, exactly as it does for gmail_tokens.
 */
import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api-helpers';
import { getUserId } from '@/lib/auth';
import { ensureFeed, updateFeed } from '@/lib/calendar/feeds';
import { parseFeedFilters, serializeFeedFilters } from '@/lib/calendar/filters';

const MAX_NAME = 100;

/** parseFeedFilters is THE validator — no Zod schema alongside it. Two validators for one
 *  shape drift apart, and it already drops unknown keys, defaults absent ones and never
 *  throws. Callers may send `filters` as a JSON string or as an object; normalise to the
 *  string form the parser expects. */
function toRawFilters(filters: unknown): string | null {
  if (typeof filters === 'string') return filters;
  if (filters === undefined || filters === null) return null;
  try {
    return JSON.stringify(filters);
  } catch {
    return null;
  }
}

export const PUT = withErrorHandling(async (request: Request) => {
  const userId = getUserId(request);
  const feed = ensureFeed(userId);
  const body = await request.json() as { name?: unknown; filters?: unknown };

  // Round-tripping through parse + serialize means whatever lands in the column is always
  // well-formed, however malformed the request was.
  const filters = serializeFeedFilters(parseFeedFilters(toRawFilters(body.filters)));

  const trimmed = typeof body.name === 'string' ? body.name.trim().slice(0, MAX_NAME) : '';
  const name = trimmed || feed.name; // an empty or absent name keeps the existing one

  updateFeed(feed.id, { name, filters });

  // The token is never returned here — it is shown only on the Settings page and by rotate.
  return NextResponse.json({
    name,
    slug: feed.slug,
    filters: JSON.parse(filters),
  });
});
