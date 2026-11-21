import { beforeEach, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { authenticator } from "otplib";
import { buildApp } from "../src/app.js";
import { openDb, type DatabaseType } from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrate.js";
import { createParent, getParentByEmail } from "../src/parents/parents.repo.js";

let db: DatabaseType;
let app: FastifyInstance;
const email = "p1@x.fr";
const password = "s3cret-pass!";

beforeEach(async () => {
  db = openDb(":memory:");
  runMigrations(db);
  app = buildApp(db);
  await createParent(db, { email, displayName: "Parent 1", password });
});

const authed = async (method: "GET" | "POST", url: string, payload?: Record<string, unknown>) => {
  const totp = authenticator.generate(getParentByEmail(db, email)!.totp_secret);
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password, totp } });
  const cookie = `awlad_session=${res.cookies.find((c) => c.name === "awlad_session")!.value}`;
  return app.inject({ method, url, payload, headers: { cookie } });
};

test("créer puis lister un enfant", async () => {
  const c = await authed("POST", "/api/children", { displayName: "Sara", ageBand: "11-14" });
  expect(c.statusCode).toBe(201);
  expect(c.json().id).toMatch(/^[0-9a-f-]{36}$/);
  const list = await authed("GET", "/api/children");
  expect(list.json()).toContainEqual({ id: c.json().id, displayName: "Sara", ageBand: "11-14" });
});

test("age_band invalide refusé (400)", async () => {
  for (const ageBand of ["5-6", "", 11, undefined]) {
    const r = await authed("POST", "/api/children", { displayName: "X", ageBand } as never);
    expect(r.statusCode).toBe(400);
  }
});

test("displayName vide refusé (400)", async () => {
  const r = await authed("POST", "/api/children", { displayName: "", ageBand: "7-10" });
  expect(r.statusCode).toBe(400);
});

test("GET /api/children sans session → 401", async () => {
  expect((await app.inject({ method: "GET", url: "/api/children" })).statusCode).toBe(401);
});

test("POST /api/children sans session → 401", async () => {
  const r = await app.inject({ method: "POST", url: "/api/children", payload: { displayName: "S", ageBand: "7-10" } });
  expect(r.statusCode).toBe(401);
});
