import { headers } from 'next/headers';
import { parseAdminEmails } from './admin-emails';

export function getUserId(_request: Request): string {
  return 'local';
}

export async function getServerUserId(): Promise<string> {
  await headers(); // opts page out of static pre-rendering
  return 'local';
}

export interface AccessInfo {
  email: string | null;
  readOnly: boolean;
}

// No Access header (dev, or a stray direct hit that got past proxy.ts) => admin.
// Dev is never read-only, matching the program-wide rule.
export async function getAccessInfo(): Promise<AccessInfo> {
  const hdrs = await headers();
  const email = hdrs.get('cf-access-authenticated-user-email')?.toLowerCase() || null;
  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);
  const readOnly = Boolean(email) && adminEmails.length > 0 && !adminEmails.includes(email!);
  return { email, readOnly };
}
