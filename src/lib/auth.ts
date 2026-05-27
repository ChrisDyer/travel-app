import { headers } from 'next/headers';

// For API route handlers — pass the request object
export function getUserId(request: Request): string {
  return request.headers.get('cf-access-authenticated-user-email') ?? 'local';
}

// For server components — uses next/headers (async in Next.js 15+)
export async function getServerUserId(): Promise<string> {
  const h = await headers();
  return h.get('cf-access-authenticated-user-email') ?? 'local';
}
