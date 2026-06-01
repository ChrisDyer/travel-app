import { NextResponse, type NextRequest } from 'next/server';

// Primary auth is Cloudflare Access (Google SSO) in front of the whole site. This is an
// optional defense-in-depth check: in production it also requires the identity header
// Cloudflare injects. Many Access setups don't forward that header to the origin, so set
// ALLOW_NO_ACCESS_HEADER=1 to disable this layer (same flag the other apps use) and rely
// on Cloudflare Access alone. Local dev (no Cloudflare) is always left open.
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_NO_ACCESS_HEADER !== '1') {
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
