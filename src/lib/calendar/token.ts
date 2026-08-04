/** The feed's one credential, kept in its own module.
 *
 *  Separate from ./filters.ts on purpose: the Phase 3 client component imports the filter
 *  types, and a shared file would drag node:crypto into the browser bundle.
 */
import { randomBytes } from 'node:crypto';

/** 32 bytes → 43 base64url chars. No padding, no '+' or '/', safe in a path segment.
 *  randomBytes is NOT on the global `crypto` (that is WebCrypto), hence the node:crypto
 *  import — same as src/app/api/gmail/auth/route.ts. */
export function newFeedToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Deliberately wider than the 43 chars newFeedToken() produces, so an older or future
 *  token length still resolves. Its job is to keep junk out of SQL and the logs, not to
 *  authenticate — the database lookup does that. */
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

export function isValidTokenShape(t: string): boolean {
  return TOKEN_RE.test(t);
}

/** '<token>.ics' and '<token>' both resolve to '<token>', so a subscriber can paste either. */
export function stripIcsSuffix(seg: string): string {
  return seg.endsWith('.ics') ? seg.slice(0, -4) : seg;
}
