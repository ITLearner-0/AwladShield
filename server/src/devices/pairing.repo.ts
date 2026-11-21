import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { DatabaseType } from "../db/connection.js";
import { hashDeviceToken } from "./token.js";

export const PAIRING_TTL_MS = 15 * 60_000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans I, O, 0, 1
const CODE_LEN = 8;

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

function normalizeCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

function generateCode(): string {
  let raw = "";
  for (let i = 0; i < CODE_LEN; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function childExists(db: DatabaseType, childId: string): boolean {
  return db.prepare("SELECT 1 FROM children WHERE id = ?").get(childId) !== undefined;
}

export function createPairingCode(
  db: DatabaseType,
  input: { childId: string; deviceName: string },
): { code: string; expiresAt: string } {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
  db.prepare("INSERT INTO pairing_codes (code_hash, child_id, device_name, expires_at) VALUES (?, ?, ?, ?)")
    .run(sha256(normalizeCode(code)), input.childId, input.deviceName, expiresAt);
  return { code, expiresAt };
}

export type ClaimResult =
  | { ok: true; deviceId: string; deviceToken: string }
  | { ok: false; reason: "not_found" | "expired" | "used" };

interface CodeRow {
  child_id: string;
  device_name: string;
  expires_at: string;
  used_at: string | null;
}

export function claimPairingCode(
  db: DatabaseType,
  input: { code: string; hostname: string; os: string },
): ClaimResult {
  const codeHash = sha256(normalizeCode(input.code));
  const tx = db.transaction((): ClaimResult => {
    const row = db.prepare("SELECT child_id, device_name, expires_at, used_at FROM pairing_codes WHERE code_hash = ?")
      .get(codeHash) as CodeRow | undefined;
    if (!row) return { ok: false, reason: "not_found" };
    if (row.used_at !== null) return { ok: false, reason: "used" };
    if (new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, reason: "expired" };

    const upd = db.prepare("UPDATE pairing_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL")
      .run(new Date().toISOString(), codeHash);
    if (upd.changes !== 1) return { ok: false, reason: "used" };

    const deviceId = randomUUID();
    const deviceToken = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO devices (id, child_id, name, os, token_hash) VALUES (?, ?, ?, ?, ?)")
      .run(deviceId, row.child_id, row.device_name || input.hostname, input.os, hashDeviceToken(deviceToken));
    return { ok: true, deviceId, deviceToken };
  });
  return tx();
}
