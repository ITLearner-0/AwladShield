import { expect, test } from "vitest";
import { openDb } from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrate.js";

test("runMigrations crée la table _migrations et est idempotent", () => {
  const db = openDb(":memory:");
  runMigrations(db);
  runMigrations(db);
  const row = db.prepare("SELECT count(*) c FROM _migrations").get() as { c: number };
  expect(row.c).toBeGreaterThan(0);
});
