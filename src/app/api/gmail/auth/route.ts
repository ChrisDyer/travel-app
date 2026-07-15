import { NextResponse } from 'next/server';
import crypto from 'crypto';

const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';
const STATE_COOKIE = 'gmail_oauth_state';

// Only allow same-site relative paths as the post-auth destination, so a crafted
// `returnTo` can't turn the callback into an open redirect.
// Not basePath-prefixed — mirrors the callback route, which redirects the user through
// the legacy travel.zo-bot.com origin so nginx's 301 adds the /travel prefix (see there
// for why request.url can't be used to build this directly).
function sanitizeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/trips';
  return raw;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const returnTo = sanitizeReturnTo(searchParams.get('returnTo'));

  // CSRF: random nonce echoed via `state` and pinned in an httpOnly cookie. The callback
  // rejects any response whose state nonce doesn't match the cookie.
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = `${nonce}:${encodeURIComponent(returnTo)}`;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_GMAIL_CLIENT_ID!,
    // Deliberately unchanged (NEXT_PUBLIC_APP_URL, no basePath) so it still matches the
    // redirect URI already registered in Google Cloud Console — no Console change or
    // env update needed. NEXT_PUBLIC_APP_URL is the legacy travel.zo-bot.com origin,
    // which now permanently 301-redirects to zo-bot.com/travel; see the callback route
    // for why the post-auth redirect deliberately goes through that same hop.
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600, // 10 minutes to complete the OAuth round-trip
  });
  return res;
}
