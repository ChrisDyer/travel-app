const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/**
 * Prefixes a root-relative path (fetch URL, <img>/<a> href) with the app's
 * basePath. Next.js only auto-prefixes next/link, next/router, and next/image;
 * everything else (raw fetch(), hand-written <a>/<img> hrefs) needs this.
 * Leaves non-root-relative values (blob:, data:, absolute http(s) URLs) untouched.
 */
export function apiUrl(path: string): string {
  return path.startsWith('/') ? `${BASE_PATH}${path}` : path;
}
