import { NextResponse, type NextRequest } from 'next/server';

// Primary auth is Cloudflare Access (Google SSO) in front of the whole site. This is a
// defense-in-depth check: in production, every request must carry the identity header
// Cloudflare injects. If it's absent, Cloudflare was bypassed or misconfigured, so we
// refuse rather than serve. Local dev (no Cloudflare) is left open.
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const email = request.headers.get('cf-access-authenticated-user-email');
    // Allow same-VPS server-to-server calls (e.g. the homepage dashboard) that present
    // the shared internal token instead of going through Cloudflare Access.
    const token = process.env.INTERNAL_API_TOKEN;
    const internal = token && request.headers.get('x-internal-token') === token;
    if (!email && !internal) {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
