import { expect, test } from "vitest";
import { authenticator } from "otplib";
import {
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  hashPassword,
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
  expect(verifyTotp(s, "000000")).toBe(false);
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
