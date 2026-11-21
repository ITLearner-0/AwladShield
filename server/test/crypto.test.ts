import { expect, test } from "vitest";
import { authenticator } from "otplib";
import {
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  hashPassword,
  verifyBackupCode,
  otpauthUrl,
  verifyPassword,
  verifyTotp,
} from "../src/auth/crypto.js";

test("un mot de passe se vérifie, un faux échoue", async () => {
  const h = await hashPassword("s3cret!");
  expect(h.startsWith("$argon2id$")).toBe(true);
  expect(await verifyPassword(h, "s3cret!")).toBe(true);
  expect(await verifyPassword(h, "mauvais")).toBe(false);
});

test("verifyPassword renvoie false pour un haché invalide", async () => {
  expect(await verifyPassword("pas-un-hache", "x")).toBe(false);
});

test("TOTP: un jeton courant est accepté", () => {
  const s = generateTotpSecret();
  const token = authenticator.generate(s);
  expect(verifyTotp(s, token)).toBe(true);
  const last = token[token.length - 1];
  const wrong = token.slice(0, -1) + (last === "0" ? "1" : "0");
  expect(verifyTotp(s, wrong)).toBe(false);
});

test("TOTP: jeton du pas précédent accepté, deux pas d'écart refusé", () => {
  const s = generateTotpSecret();
  const at = (offsetSteps: number) =>
    authenticator.clone({ epoch: Date.now() + offsetSteps * 30_000 }).generate(s);
  expect(verifyTotp(s, at(-1))).toBe(true);
  expect(verifyTotp(s, at(-2))).toBe(false);
  expect(verifyTotp(s, at(2))).toBe(false);
});

test("otpauthUrl contient l'émetteur AwladShield", () => {
  const url = otpauthUrl(generateTotpSecret(), "admin@example.com");
  expect(url.startsWith("otpauth://totp/")).toBe(true);
  expect(url).toContain("issuer=AwladShield");
});

test("10 codes de secours, uniques, hachage vérifiable", () => {
  const codes = generateBackupCodes();
  expect(codes).toHaveLength(10);
  expect(new Set(codes).size).toBe(10);
  for (const c of codes) expect(c).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/);
  expect(hashBackupCode(codes[0])).toBe(hashBackupCode(codes[0]));
  expect(hashBackupCode(codes[0])).toMatch(/^[0-9a-f]{64}$/);
  expect(hashBackupCode(codes[0])).not.toBe(hashBackupCode(codes[1]));
});

test("verifyBackupCode: insensible à la casse, mauvais code refusé", () => {
  const [c0, c1] = generateBackupCodes();
  const stored = hashBackupCode(c0);
  expect(verifyBackupCode(c0, stored)).toBe(true);
  expect(verifyBackupCode(` ${c0.toLowerCase()} `, stored)).toBe(true);
  expect(verifyBackupCode(c1, stored)).toBe(false);
  expect(verifyBackupCode(c0, "abc")).toBe(false);
});
