import { beforeEach, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { authenticator } from "otplib";
import { buildApp } from "../src/app.js";
import { openDb, type DatabaseType } from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrate.js";
import { confirmTotp, countParents, createParent, getParentByEmail } from "../src/parents/parents.repo.js";

let db: DatabaseType;
let app: FastifyInstance;

beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
  app = buildApp(db);
});

const setup = (email = "p1@x.fr") =>
  app.inject({ method: "POST", url: "/api/setup", payload: { email, displayName: "Parent 1", password: "s3cret!" } });

test("premier /api/setup crée le parent et renvoie l'enrôlement TOTP", async () => {
  const res = await setup();
  expect(res.statusCode).toBe(201);
  expect(res.json().otpauthUrl).toContain("AwladShield");
  expect(res.json().backupCodes).toHaveLength(10);
  expect(res.json().parentId).toBeTruthy();
});

test("GET /api/setup/status renvoie needsSetup=true sans parent, false après setup", async () => {
  const before = await app.inject({ method: "GET", url: "/api/setup/status" });
  expect(before.statusCode).toBe(200);
  expect(before.json()).toEqual({ needsSetup: true });
  await setup();
  const after = await app.inject({ method: "GET", url: "/api/setup/status" });
  expect(after.json()).toEqual({ needsSetup: false });
});

test("un deuxième /api/setup est refusé (409)", async () => {
  await setup();
  const res = await setup("p2@x.fr");
  expect(res.statusCode).toBe(409);
});

test("/api/setup valide le corps (400)", async () => {
  const res = await app.inject({ method: "POST", url: "/api/setup", payload: { email: "pas-un-email" } });
  expect(res.statusCode).toBe(400);
});

test("/api/setup/confirm active le TOTP avec un bon jeton, refuse un mauvais", async () => {
  const { parentId } = (await setup()).json();
  const secret = getParentByEmail(db, "p1@x.fr")!.totp_secret;
  const bad = await app.inject({ method: "POST", url: "/api/setup/confirm", payload: { parentId, token: "000000" } });
  expect(bad.statusCode).toBe(400);
  expect(getParentByEmail(db, "p1@x.fr")!.totp_enabled).toBe(0);
  const ok = await app.inject({
    method: "POST", url: "/api/setup/confirm",
    payload: { parentId, token: authenticator.generate(secret) },
  });
  expect(ok.statusCode).toBe(200);
  expect(getParentByEmail(db, "p1@x.fr")!.totp_enabled).toBe(1);
});

test("createParent stocke mot de passe haché, codes de secours hachés, totp inactif", async () => {
  const r = await createParent(db, { email: "a@x.fr", displayName: "A", password: "pw12345" });
  expect(countParents(db)).toBe(1);
  const p = getParentByEmail(db, "a@x.fr")!;
  expect(p.id).toBe(r.id);
  expect(p.password_hash).not.toContain("pw12345");
  expect(p.totp_enabled).toBe(0);
  const hashes = JSON.parse(p.backup_codes_hashes) as string[];
  expect(hashes).toHaveLength(10);
  for (const c of r.backupCodes) expect(hashes).not.toContain(c);
  expect(confirmTotp(db, r.id, authenticator.generate(r.totpSecret))).toBe(true);
  await expect(createParent(db, { email: "a@x.fr", displayName: "B", password: "x" })).rejects.toThrow();
});
