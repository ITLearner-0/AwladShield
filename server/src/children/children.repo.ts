import { randomUUID } from "node:crypto";
import type { DatabaseType } from "../db/connection.js";

export type AgeBand = "7-10" | "11-14" | "15-17";

export interface Child {
  id: string;
  displayName: string;
  ageBand: AgeBand;
}

export function createChild(db: DatabaseType, input: { displayName: string; ageBand: AgeBand }): string {
  const id = randomUUID();
  db.prepare("INSERT INTO children (id, display_name, age_band) VALUES (?, ?, ?)")
    .run(id, input.displayName, input.ageBand);
  return id;
}

export function listChildren(db: DatabaseType): Child[] {
  return db
    .prepare("SELECT id, display_name AS displayName, age_band AS ageBand FROM children ORDER BY created_at, rowid")
    .all() as Child[];
}
