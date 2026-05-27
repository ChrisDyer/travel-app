export function getUserId(_request: Request): string {
  return 'local';
}

export async function getServerUserId(): Promise<string> {
  return 'local';
}
