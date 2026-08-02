import { NextResponse } from 'next/server';
import { db } from '@/db';
import { withErrorHandling } from '@/lib/api-helpers';
import { getUserId } from '@/lib/auth';

export const DELETE = withErrorHandling(async (request: Request) => {
  const userId = getUserId(request);
  db.prepare('DELETE FROM gmail_tokens WHERE user_id = ?').run(userId);
  return new NextResponse(null, { status: 204 });
});
