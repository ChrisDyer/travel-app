// Shared between src/proxy.ts (edge runtime, must stay dependency-free) and
// src/lib/auth.ts's getAccessInfo(). Comma-separated, case-insensitive,
// whitespace-trimmed. Unset/empty => role feature off, everyone is admin.
export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}
