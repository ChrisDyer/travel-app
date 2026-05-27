import { NextResponse } from 'next/server';

const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get('returnTo') ?? '/trips';

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_GMAIL_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: returnTo,
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
