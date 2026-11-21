import { beforeEach, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { authenticator } from "otplib";
import { buildApp } from "../src/app.js";
import { openDb, type DatabaseType } from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrate.js";
import { createParent, getParentByEmail } from "../src/parents/parents.repo.js";
import { createSession, getSessionParent } from "../src/auth/sessions.js";
import { requireParent } from "../src/auth/require-parent.js";

let db: DatabaseType;
let app: FastifyInstance;
const email = "p1@x.fr";
const password = "s3cret-pass!";

beforeEach(async () => {
  db = openDb(":memory:");
  runMigrations(db);
  app = buildApp(db);
  // route sonde protégée (les vraies routes protégées arrivent aux tâches suivantes)
  app.get("/api/_probe", { preHandler: requireParent }, async (req) => ({ parentId: req.parentId }));
  await createParent(db, { email, displayName: "Parent 1", password });
});

const current = () => authenticator.generate(getParentByEmail(db, email)!.totp_secret);
const login = (payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/api/auth/login", payload });
const sessionCookie = async () => {
  const res = await login({ email, password, totp: current() });
  return `awlad_session=${res.cookies.find((c) => c.name === "awlad_session")!.value}`;
};

test("login échoue si le TOTP est faux", async () => {
  const res = await login({ email, password, totp: "000000" });
  expect(res.statusCode).toBe(401);
  expect(res.cookies.find((c) => c.name === "awlad_session")).toBeUndefined();
});

test("login échoue si le TOTP est absent ou vide", async () => {
  expect((await login({ email, password })).statusCode).toBe(401);
  expect((await login({ email, password, totp: "" })).statusCode).toBe(401);
});

test("login échoue si le mot de passe est faux ou l'email inconnu", async () => {
  expect((await login({ email, password: "mauvais", totp: current() })).statusCode).toBe(401);
  expect((await login({ email: "autre@x.fr", password, totp: current() })).statusCode).toBe(401);
});

test("login réussit avec mot de passe + bon TOTP et pose un cookie HttpOnly", async () => {
  const res = await login({ email, password, totp: current() });
  expect(res.statusCode).toBe(200);
  const c = res.cookies.find((x) => x.name === "awlad_session")!;
  expect(c).toBeTruthy();
  expect(c.httpOnly).toBe(true);
  expect(String(c.sameSite).toLowerCase()).toBe("lax");
  expect(res.json().displayName).toBe("Parent 1");
  expect(res.json().parentId).toBe(getParentByEmail(db, email)!.id);
});

test("route protégée sans session → 401, avec session → 200", async () => {
  expect((await app.inject({ method: "GET", url: "/api/_probe" })).statusCode).toBe(401);
  const res = await app.inject({ method: "GET", url: "/api/_probe", headers: { cookie: await sessionCookie() } });
  expect(res.statusCode).toBe(200);
  expect(res.json().parentId).toBe(getParentByEmail(db, email)!.id);
});

test("logout supprime la session", async () => {
  const cookie = await sessionCookie();
  const out = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
  expect(out.statusCode).toBe(200);
  expect((await app.inject({ method: "GET", url: "/api/_probe", headers: { cookie } })).statusCode).toBe(401);
});

test("session expirée ou inconnue → null ; id aléatoire de 32 octets", () => {
  const id = getParentByEmail(db, email)!.id;
  const s = createSession(db, id);
  expect(s).toMatch(/^[0-9a-f]{64}$/);
  expect(getSessionParent(db, s)).toBe(id);
  db.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").run("2000-01-01T00:00:00.000Z", s);
  expect(getSessionParent(db, s)).toBeNull();
  expect(getSessionParent(db, "inconnue")).toBeNull();
});

test("POST /api/parents sans session → 401 ; avec session + email dupliqué → 409", async () => {
  const payload = { email: "p2@x.fr", displayName: "P2", password: "s3cret-pass!" };
  expect((await app.inject({ method: "POST", url: "/api/parents", payload })).statusCode).toBe(401);
  const headers = { cookie: await sessionCookie() };
  expect((await app.inject({ method: "POST", url: "/api/parents", payload, headers })).statusCode).toBe(201);
  expect((await app.inject({ method: "POST", url: "/api/parents", payload, headers })).statusCode).toBe(409);
});
