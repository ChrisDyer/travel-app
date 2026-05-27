import { NextResponse } from 'next/server';
import { db } from '@/db';
import { getUserId } from '@/lib/auth';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const returnTo = searchParams.get('state') ?? '/trips';

  if (!code) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}${returnTo}?gmailError=no_code`);
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
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}${returnTo}?gmailError=token_exchange_failed`);
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

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}${returnTo}?gmailConnected=1`);
}
