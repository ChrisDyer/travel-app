/** The `calendar_feeds` data layer: the one place that reads or writes the feed row.
 *
 *  This module owns the token lifecycle, so it imports node:crypto (via ./token) and must never
 *  be pulled into a client component — the Phase 3 UI imports types from ./filters instead.
 */
import { db, camelize } from '@/db';
import { newFeedToken } from './token';
import { DEFAULT_FILTERS, serializeFeedFilters } from './filters';

export interface CalendarFeedRow {
  id: string;
  userId: string;
  slug: string;
  name: string;
  token: string;
  filters: string;
  lastFetchedAt: string | null;
  lastFetchedUserAgent: string | null;
  tokenRotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Today there is exactly one feed per user. The (user_id, slug) unique index means a second
 *  one needs no migration, only a new row with a different slug. */
const SHARED_SLUG = 'shared';

/** A user agent is attacker-controlled text that lands in the DB and later on the Settings
 *  page, so it is capped before it is stored rather than at render time. */
const MAX_USER_AGENT = 200;

/** The feed name is shown to subscribers as the calendar's title. */
const MAX_NAME = 100;

/** Returns the shared feed, creating it on first call. Idempotent.
 *
 *  INSERT ... ON CONFLICT DO NOTHING then SELECT, rather than SELECT-then-INSERT: two
 *  concurrent first page loads would otherwise race and either create two rows or throw on
 *  the unique index. */
export function ensureFeed(userId: string): CalendarFeedRow {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO calendar_feeds (id, user_id, slug, name, token, filters, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, slug) DO NOTHING
  `).run(
    crypto.randomUUID(), userId, SHARED_SLUG, 'Zo Travel',
    newFeedToken(), serializeFeedFilters(DEFAULT_FILTERS), now, now
  );

  const row = db.prepare('SELECT * FROM calendar_feeds WHERE user_id = ? AND slug = ?')
    .get(userId, SHARED_SLUG) as Record<string, unknown>;
  return camelize<CalendarFeedRow>(row);
}

/** The token is the whole credential; the unique index makes this a B-tree probe. */
export function getFeedByToken(token: string): CalendarFeedRow | null {
  const row = db.prepare('SELECT * FROM calendar_feeds WHERE token = ?')
    .get(token) as Record<string, unknown> | undefined;
  return row ? camelize<CalendarFeedRow>(row) : null;
}

/** `filters` is required because the caller has already run it through parseFeedFilters +
 *  serializeFeedFilters — this layer stores what it is given and does not validate. */
export function updateFeed(id: string, patch: { name?: string; filters: string }): void {
  const now = new Date().toISOString();
  if (patch.name !== undefined) {
    db.prepare('UPDATE calendar_feeds SET name = ?, filters = ?, updated_at = ? WHERE id = ?')
      .run(patch.name.slice(0, MAX_NAME), patch.filters, now, id);
    return;
  }
  db.prepare('UPDATE calendar_feeds SET filters = ?, updated_at = ? WHERE id = ?')
    .run(patch.filters, now, id);
}

/** Rotation is the ONLY revocation mechanism, and it revokes every existing subscription:
 *  the old URL 404s and each subscriber's calendar freezes at its last successful fetch.
 *  Google does not delete a subscribed calendar that stops resolving, it just stops updating,
 *  so everyone must delete and re-add. */
export function rotateFeedToken(id: string): { token: string; tokenRotatedAt: string } {
  const token = newFeedToken();
  const now = new Date().toISOString();
  db.prepare('UPDATE calendar_feeds SET token = ?, token_rotated_at = ?, updated_at = ? WHERE id = ?')
    .run(token, now, now, id);
  return { token, tokenRotatedAt: now };
}

/** Fetch telemetry for the Settings page: "Google last collected this N hours ago" is the
 *  only way to tell a working subscription from a silently broken one. */
export function recordFetch(id: string, userAgent: string | null): void {
  db.prepare('UPDATE calendar_feeds SET last_fetched_at = ?, last_fetched_user_agent = ? WHERE id = ?')
    .run(new Date().toISOString(), userAgent ? userAgent.slice(0, MAX_USER_AGENT) : null, id);
}
