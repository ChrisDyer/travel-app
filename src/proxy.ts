import { NextResponse, type NextRequest } from 'next/server';
import { parseAdminEmails } from './lib/admin-emails';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Paths that must be reachable with no Cloudflare Access identity and without the
// ALLOW_NO_ACCESS_HEADER escape hatch. Google Calendar's fetcher presents no cookies, no
// JWT and no header we control; the random token in the path is the whole credential.
//
// This is the ONLY hole in the app's auth, so be precise about what it can and cannot do:
//   - It is GET-only *by construction*. The route file at
//     src/app/api/calendar/feed/[token]/route.ts exports nothing but GET, so Next itself
//     answers 405 to POST/PUT/PATCH/DELETE. Skipping the block below therefore cannot open
//     a write path — there is no write path under this prefix to open.
//   - It grants no ambient authority. The handler resolves the token to exactly one feed row
//     and serves only that owner's trips; an unknown or malformed token is a bare 404.
//   - Feed MANAGEMENT lives at /api/calendar/config, deliberately NOT under this prefix, so
//     it stays behind Cloudflare Access and behind the ADMIN_EMAILS write gate below.
// Rotating the token is the only revocation mechanism (see src/lib/calendar/feeds.ts).
const PUBLIC_PATH_PREFIXES = ['/api/calendar/feed/'];

// Primary auth is Cloudflare Access (Google SSO) in front of the whole site. This is an
// optional defense-in-depth check: in production it also requires the identity header
// Cloudflare injects. Many Access setups don't forward that header to the origin, so set
// ALLOW_NO_ACCESS_HEADER=1 to disable this layer (same flag the other apps use) and rely
// on Cloudflare Access alone. Local dev (no Cloudflare) is always left open.
export function proxy(request: NextRequest) {
  // Hoisted out of the production block below so the allowlist can be evaluated first.
  // basePath-stripped: '/travel/api/...' arrives here as '/api/...'. See RUNBOOK.md.
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));

  if (process.env.NODE_ENV === 'production' && !isPublic) {
    const email = request.headers.get('cf-access-authenticated-user-email')?.toLowerCase() ?? null;
    // Allow same-VPS server-to-server calls (e.g. the homepage dashboard) that present
    // the shared internal token instead of going through Cloudflare Access.
    const token = process.env.INTERNAL_API_TOKEN;
    const internal = Boolean(token) && request.headers.get('x-internal-token') === token;
    if (!email && !internal && process.env.ALLOW_NO_ACCESS_HEADER !== '1') {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Per-user read-only role (see docs/plans/2026-07-per-user-read-only). Deliberately
    // NOT nested inside the ALLOW_NO_ACCESS_HEADER check above: production has
    // ALLOW_NO_ACCESS_HEADER=1 set (see RUNBOOK.md's env var table), and nesting here
    // would make ADMIN_EMAILS a silent no-op. Instead this mirrors the Express apps'
    // canonical pattern exactly — no email (missing header, ALLOW_NO_ACCESS_HEADER
    // bypass, or local dev) always resolves to admin, same fail-open guarantee as an
    // unset ADMIN_EMAILS.
    if (!SAFE_METHODS.has(request.method) && pathname.startsWith('/api') && !internal) {
      const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);
      if (email && adminEmails.length > 0 && !adminEmails.includes(email)) {
        return NextResponse.json(
          { error: 'read_only', message: 'This account is read-only.' },
          { status: 403 }
        );
      }
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
