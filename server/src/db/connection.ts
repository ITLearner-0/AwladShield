import Database from "better-sqlite3";

export type DatabaseType = Database.Database;

export function openDb(path: string): DatabaseType {
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  return db;
}
