import { randomBytes } from "node:crypto";
import type { DatabaseType } from "../db/connection.js";

export const SESSION_COOKIE = "awlad_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createSession(db: DatabaseType, parentId: string): string {
  const id = randomBytes(32).toString("hex");
  const now = Date.now();
  db.prepare("INSERT INTO sessions (id, parent_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    id,
    parentId,
    new Date(now).toISOString(),
    new Date(now + SESSION_TTL_MS).toISOString(),
  );
  return id;
}

export function getSessionParent(db: DatabaseType, sessionId: string): string | null {
  const row = db.prepare("SELECT parent_id, expires_at FROM sessions WHERE id = ?").get(sessionId) as
    | { parent_id: string; expires_at: string }
    | undefined;
  if (!row) return null;
  if (row.expires_at <= new Date().toISOString()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return null;
  }
  return row.parent_id;
}

export function deleteSession(db: DatabaseType, sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}
