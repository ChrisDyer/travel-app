import { NextResponse, type NextRequest } from 'next/server';
import { parseAdminEmails } from './lib/admin-emails';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Primary auth is Cloudflare Access (Google SSO) in front of the whole site. This is an
// optional defense-in-depth check: in production it also requires the identity header
// Cloudflare injects. Many Access setups don't forward that header to the origin, so set
// ALLOW_NO_ACCESS_HEADER=1 to disable this layer (same flag the other apps use) and rely
// on Cloudflare Access alone. Local dev (no Cloudflare) is always left open.
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
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
    const { pathname } = request.nextUrl;
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
