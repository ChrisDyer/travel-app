import Database from 'better-sqlite3';
import path from 'path';
import { runMigrations } from './migrations';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'local.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

runMigrations(db);

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function camelize<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [toCamelCase(k), v])
  ) as T;
}

export function camelizeAll<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map((row) => camelize<T>(row));
}
