import { beforeEach, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { authenticator } from "otplib";
import { createHash } from "node:crypto";
import { buildApp } from "../src/app.js";
import { openDb, type DatabaseType } from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrate.js";
import { createParent, getParentByEmail } from "../src/parents/parents.repo.js";
import { createChild } from "../src/children/children.repo.js";

let db: DatabaseType;
let app: FastifyInstance;
let childId: string;
const email = "p1@x.fr";
const password = "s3cret-pass!";
const sha = (s: string) => createHash("sha256").update(s.replace(/-/g, "")).digest("hex");

beforeEach(async () => {
  db = openDb(":memory:");
  runMigrations(db);
  app = buildApp(db);
  await createParent(db, { email, displayName: "Parent 1", password });
  childId = createChild(db, { displayName: "Sara", ageBand: "11-14" });
});

const authed = async (method: "GET" | "POST", url: string, payload?: Record<string, unknown>) => {
  const totp = authenticator.generate(getParentByEmail(db, email)!.totp_secret);
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password, totp } });
  const cookie = `awlad_session=${res.cookies.find((c) => c.name === "awlad_session")!.value}`;
  return app.inject({ method, url, payload, headers: { cookie } });
};

const claim = (code: string, hostname = "PC-SARA") =>
  app.inject({ method: "POST", url: "/api/pairing/claim", payload: { code, hostname, os: "windows" } });

const newCode = async () => (await authed("POST", "/api/pairing/code", { childId, deviceName: "PC-Sara" })).json();

test("un code valide crée un appareil et renvoie un jeton (haché en base)", async () => {
  const { code, expiresAt } = await newCode();
  const ttl = new Date(expiresAt).getTime() - Date.now();
  expect(ttl).toBeGreaterThan(14 * 60_000);
  expect(ttl).toBeLessThanOrEqual(15 * 60_000);
  const stored = db.prepare("SELECT code_hash FROM pairing_codes").get() as { code_hash: string };
  expect(stored.code_hash).toBe(sha(code));
  expect(stored.code_hash).not.toBe(code);

  const r = await claim(code);
  expect(r.statusCode).toBe(200);
  const { deviceId, deviceToken } = r.json();
  expect(deviceToken).toBeTruthy();
  const dev = db.prepare("SELECT * FROM devices WHERE id = ?").get(deviceId) as Record<string, string>;
  expect(dev.child_id).toBe(childId);
  expect(dev.os).toBe("windows");
  expect(dev.token_hash).toBe(createHash("sha256").update(deviceToken).digest("hex"));
  expect(dev.token_hash).not.toBe(deviceToken);
});

test("les réponses à secret unique sont en Cache-Control: no-store", async () => {
  const created = await authed("POST", "/api/pairing/code", { childId, deviceName: "PC-Sara" });
  expect(created.headers["cache-control"]).toBe("no-store");
  const r = await claim(created.json().code);
  expect(r.headers["cache-control"]).toBe("no-store");
});

test("deviceName blanc refusé (400)", async () => {
  expect((await authed("POST", "/api/pairing/code", { childId, deviceName: "   " })).statusCode).toBe(400);
});

test("réclamer deux fois le même code → 409", async () => {
  const { code } = await newCode();
  expect((await claim(code)).statusCode).toBe(200);
  expect((await claim(code, "X")).statusCode).toBe(409);
  expect(db.prepare("SELECT COUNT(*) AS n FROM devices").get()).toEqual({ n: 1 });
});

test("code expiré → 410", async () => {
  const { code } = await newCode();
  db.prepare("UPDATE pairing_codes SET expires_at = ?").run(new Date(Date.now() - 1000).toISOString());
  expect((await claim(code)).statusCode).toBe(410);
  expect(db.prepare("SELECT COUNT(*) AS n FROM devices").get()).toEqual({ n: 0 });
});

test("code inconnu → 404", async () => {
  expect((await claim("ZZZZ-ZZZZ")).statusCode).toBe(404);
});

test("génération sans session → 401", async () => {
  const r = await app.inject({ method: "POST", url: "/api/pairing/code", payload: { childId, deviceName: "x" } });
  expect(r.statusCode).toBe(401);
});

test("enfant inexistant → 404, corps invalide → 400", async () => {
  expect((await authed("POST", "/api/pairing/code", { childId: "nope", deviceName: "x" })).statusCode).toBe(404);
  expect((await authed("POST", "/api/pairing/code", { childId })).statusCode).toBe(400);
  expect((await app.inject({ method: "POST", url: "/api/pairing/claim", payload: {} })).statusCode).toBe(400);
});
