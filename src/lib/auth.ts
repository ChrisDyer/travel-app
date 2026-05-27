import { headers } from 'next/headers';

export function getUserId(_request: Request): string {
  return 'local';
}

export async function getServerUserId(): Promise<string> {
  await headers(); // opts page out of static pre-rendering
  return 'local';
}
