/** Rotate the feed token.
 *
 *  This is the ONLY revocation mechanism, and it revokes EVERY existing subscription: the old
 *  URL starts returning 404 and each subscriber's calendar freezes at its last successful
 *  fetch. Google does not delete a subscribed calendar that stops resolving — it just stops
 *  updating, silently — so every subscriber must delete and re-add the calendar by hand.
 *  The Phase 3 confirmation copy has to say exactly that.
 *
 *  Behind Cloudflare Access and the ADMIN_EMAILS write gate: POST is an unsafe method under
 *  /api, so src/proxy.ts answers 403 {"error":"read_only"} to non-admins with no code here.
 */
import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api-helpers';
import { getUserId } from '@/lib/auth';
import { ensureFeed, rotateFeedToken } from '@/lib/calendar/feeds';

export const POST = withErrorHandling(async (request: Request) => {
  const userId = getUserId(request);
  const feed = ensureFeed(userId);
  const { token, tokenRotatedAt } = rotateFeedToken(feed.id);
  return NextResponse.json({ token, tokenRotatedAt });
});
