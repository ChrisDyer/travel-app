import { NextResponse, type NextRequest } from 'next/server';

// Auth disabled for local development — re-enable when deploying
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
