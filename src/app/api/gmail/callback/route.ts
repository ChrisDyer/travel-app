import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { getUserId } from '@/lib/auth';

const STATE_COOKIE = 'gmail_oauth_state';

function sanitizeReturnTo(raw: string): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/trips';
  return raw;
}

// Parse the `nonce:encodedReturnTo` state produced by /api/gmail/auth.
function parseState(state: string): { nonce: string; returnTo: string } {
  const sep = state.indexOf(':');
  if (sep < 0) return { nonce: '', returnTo: '/trips' };
  const nonce = state.slice(0, sep);
  let returnTo = '/trips';
  try {
    returnTo = sanitizeReturnTo(decodeURIComponent(state.slice(sep + 1)));
  } catch {
    returnTo = '/trips';
  }
  return { nonce, returnTo };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const { nonce: stateNonce, returnTo } = parseState(searchParams.get('state') ?? '');
  const base = process.env.NEXT_PUBLIC_APP_URL;

  const cookieStore = await cookies();
  const cookieNonce = cookieStore.get(STATE_COOKIE)?.value;

  // Always clear the one-time CSRF cookie, whatever the outcome.
  const redirectTo = (url: string) => {
    const res = NextResponse.redirect(url);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  // CSRF: state nonce must match the cookie set when the flow began.
  if (!stateNonce || !cookieNonce || stateNonce !== cookieNonce) {
    return redirectTo(`${base}${returnTo}?gmailError=state_mismatch`);
  }

  if (!code) {
    return redirectTo(`${base}${returnTo}?gmailError=no_code`);
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_GMAIL_CLIENT_ID!,
      client_secret: process.env.GOOGLE_GMAIL_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    return redirectTo(`${base}${returnTo}?gmailError=token_exchange_failed`);
  }

  const tokenData = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  const userId = getUserId(request);
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
  const now = new Date().toISOString();

  // Upsert token for this user
  db.prepare(`
    INSERT INTO gmail_tokens (id, user_id, access_token, refresh_token, expires_at, scope, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, gmail_tokens.refresh_token),
      expires_at = excluded.expires_at,
      scope = excluded.scope,
      updated_at = excluded.updated_at
  `).run(
    crypto.randomUUID(), userId, tokenData.access_token,
    tokenData.refresh_token ?? null, expiresAt, tokenData.scope, now, now
  );

  return redirectTo(`${base}${returnTo}?gmailConnected=1`);
}
