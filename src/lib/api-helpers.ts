import { NextResponse } from 'next/server';

/** Returns a 400 response if any required field is missing/empty, else null. */
export function requireFields(body: Record<string, unknown>, fields: string[]): NextResponse | null {
  for (const f of fields) {
    const v = body[f];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      return NextResponse.json({ error: `Missing required field: ${f}` }, { status: 400 });
    }
  }
  return null;
}

/** Wraps a route handler: malformed JSON / DB errors become clean JSON responses. */
export function withErrorHandling<A extends unknown[]>(
  handler: (...args: A) => Promise<NextResponse | Response>
) {
  return async (...args: A): Promise<NextResponse | Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof SyntaxError) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
      console.error('[api]', err);
      return NextResponse.json({ error: 'Something went wrong on the server.' }, { status: 500 });
    }
  };
}
