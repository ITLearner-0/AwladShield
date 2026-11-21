import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import { authenticator } from "otplib";

const ISSUER = "AwladShield";
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// Instance dédiée (pas de mutation du singleton global) ; fenêtre ±1 pas de 30 s.
const totp = authenticator.clone({ digits: 6, step: 30, window: 1 });

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export function generateTotpSecret(): string {
  return totp.generateSecret();
}

export function otpauthUrl(secret: string, label: string): string {
  return totp.keyuri(label, ISSUER, secret);
}

export function verifyTotp(secret: string, token: string): boolean {
  try {
    return totp.verify({ token, secret });
  } catch {
    return false;
  }
}

function randomGroup(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += BASE32[randomInt(BASE32.length)];
  return out;
}

export function generateBackupCodes(n = 10): string[] {
  const codes = new Set<string>();
  while (codes.size < n) codes.add(`${randomGroup(4)}-${randomGroup(4)}`);
  return [...codes];
}

function normalizeBackupCode(code: string): string {
  return code.trim().toUpperCase();
}

export function hashBackupCode(code: string): string {
  return createHash("sha256").update(normalizeBackupCode(code)).digest("hex");
}

export function verifyBackupCode(code: string, storedHash: string): boolean {
  const a = Buffer.from(hashBackupCode(code), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
