import { createHash, randomInt } from "node:crypto";
import argon2 from "argon2";
import { authenticator } from "otplib";

const ISSUER = "AwladShield";
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

authenticator.options = { digits: 6, step: 30 };

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
  return authenticator.generateSecret();
}

export function otpauthUrl(secret: string, label: string): string {
  return authenticator.keyuri(label, ISSUER, secret);
}

export function verifyTotp(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token, secret });
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

export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
