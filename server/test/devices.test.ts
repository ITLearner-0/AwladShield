import { beforeEach, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { authenticator } from "otplib";
import { buildApp } from "../src/app.js";
import { openDb, type DatabaseType } from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrate.js";
import { createParent, getParentByEmail } from "../src/parents/parents.repo.js";
import { createChild } from "../src/children/children.repo.js";

let db: DatabaseType;
let app: FastifyInstance;
let childId: string;
let deviceToken: string;
let deviceId: string;
const email = "p1@x.fr";
const password = "s3cret-pass!";

const authed = async (method: "GET" | "POST", url: string, payload?: Record<string, unknown>) => {
  const totp = authenticator.generate(getParentByEmail(db, email)!.totp_secret);
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password, totp } });
  const cookie = `awlad_session=${res.cookies.find((c) => c.name === "awlad_session")!.value}`;
  return app.inject({ method, url, payload, headers: { cookie } });
};

beforeEach(async () => {
  db = openDb(":memory:");
  runMigrations(db);
  app = buildApp(db);
  await createParent(db, { email, displayName: "Parent 1", password });
  childId = createChild(db, { displayName: "Sara", ageBand: "11-14" });
  const { code } = (await authed("POST", "/api/pairing/code", { childId, deviceName: "PC-Sara" })).json();
  const r = await app.inject({ method: "POST", url: "/api/pairing/claim", payload: { code, hostname: "PC", os: "windows" } });
  ({ deviceToken, deviceId } = r.json());
});

const beat = (token?: string) =>
  app.inject({ method: "POST", url: "/api/devices/heartbeat", headers: token ? { authorization: `Bearer ${token}` } : {} });

test("heartbeat avec bon jeton met à jour last_seen", async () => {
  const before = (await authed("GET", "/api/devices")).json()[0];
  expect(before.online).toBe(false);
  expect(before.lastSeenAt).toBeNull();
  const r = await beat(deviceToken);
  expect(r.statusCode).toBe(200);
  expect(r.json().serverTime).toBeTruthy();
  const list = await authed("GET", "/api/devices");
  const d = list.json()[0];
  expect(d).toMatchObject({ id: deviceId, childId, name: "PC-Sara", os: "windows", online: true });
  expect(d.lastSeenAt).toBeTruthy();
});

test("heartbeat avec jeton invalide ou absent → 401", async () => {
  expect((await beat("faux")).statusCode).toBe(401);
  expect((await beat()).statusCode).toBe(401);
});

test("appareil vu il y a plus de 3 minutes → online=false", async () => {
  db.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").run(new Date(Date.now() - 4 * 60_000).toISOString(), deviceId);
  expect((await authed("GET", "/api/devices")).json()[0].online).toBe(false);
});

test("GET /api/devices sans session → 401", async () => {
  expect((await app.inject({ method: "GET", url: "/api/devices" })).statusCode).toBe(401);
});
