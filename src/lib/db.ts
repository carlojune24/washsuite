import { localDate } from "./localDate";
import Database from "@tauri-apps/plugin-sql";

/**
 * Single shared handle to the app's SQLite database.
 * Migrations (see src-tauri/migrations/) run automatically on first load.
 */
let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load("sqlite:washsuite.db");
  }
  return dbInstance;
}

/**
 * Closes the connection pool and drops the cached handle, so the next getDb() call opens a
 * fresh one. Required before anything overwrites the database file on disk (e.g. restoring a
 * backup) -- otherwise the still-open connection's own WAL/cache keeps the old data alive
 * underneath the new file and can silently write it back out.
 */
export async function closeDb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

/** Run a write query (INSERT/UPDATE/DELETE). Returns rowsAffected + lastInsertId. */
export async function execute(query: string, params: unknown[] = []) {
  const db = await getDb();
  return db.execute(query, params);
}

/** Run a read query (SELECT). Returns typed rows. */
export async function select<T>(query: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  return db.select<T[]>(query, params);
}

/**
 * Combines a user-picked date (from a plain <input type="date">, e.g. for backdating an
 * expense) with the actual current time, and converts to the same UTC "YYYY-MM-DD HH:MM:SS"
 * format SQLite's own `datetime('now')` produces. Use this for `cashflow_entries.entry_date`
 * (and similar) instead of passing the bare date — a date-only string always sorts before any
 * same-day full timestamp (it's a string prefix), which silently breaks chronological ordering
 * — e.g. a running balance — for anything compared against `datetime('now')`-stamped rows.
 */
export function toEntryTimestamp(dateStr: string): string {
  const now = new Date();
  const [y, m, d] = dateStr.split("-").map(Number);
  const local = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
  return local.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Every timestamp this app stores (toEntryTimestamp() above, and SQLite's own
 * datetime('now') default) is UTC with no timezone marker. `new Date("YYYY-MM-DD HH:MM:SS")`
 * — i.e. without a trailing "Z" — gets parsed as *local* time by JS, which silently shifts
 * the displayed time by the viewer's UTC offset. Append "Z" before parsing so it's read back
 * as the UTC instant it actually is, then let toLocaleString et al. convert it to local for
 * display.
 */
function parseUtcTimestamp(dt: string): Date {
  return new Date(dt.replace(" ", "T") + "Z");
}

/** Local-calendar "YYYY-MM-DD" of a stored UTC timestamp (slice(0,10) would give the UTC date). */
export function utcToLocalDate(dt: string): string {
  const d = parseUtcTimestamp(dt);
  return isNaN(d.getTime()) ? dt.slice(0, 10) : localDate(d);
}

/** Formats a stored UTC timestamp in the viewer's local time, e.g. "Jul 21, 2:30 PM". */
export function formatDateTime(dt: string): string {
  const d = parseUtcTimestamp(dt);
  if (isNaN(d.getTime())) return dt;
  const datePart = d.toLocaleDateString([], { month: "short", day: "numeric" });
  const timePart = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}

/** Formats just the local time portion of a stored UTC timestamp, e.g. "2:30 PM". */
export function formatTime(dt: string): string {
  const d = parseUtcTimestamp(dt);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
