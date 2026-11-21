import { randomUUID } from "node:crypto";
import type { DatabaseType } from "../db/connection.js";
import {
  generateBackupCodes, generateTotpSecret, hashBackupCode, hashPassword, otpauthUrl, verifyTotp,
} from "../auth/crypto.js";

export interface ParentRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  totp_secret: string;
  totp_enabled: number;
  backup_codes_hashes: string;
  created_at: string;
}

export interface NewParent {
  email: string;
  displayName: string;
  password: string;
}

export interface Enrollment {
  id: string;
  totpSecret: string;
  otpauthUrl: string;
  backupCodes: string[];
}

export function countParents(db: DatabaseType): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM parents").get() as { n: number }).n;
}

export function getParentByEmail(db: DatabaseType, email: string): ParentRow | undefined {
  return db.prepare("SELECT * FROM parents WHERE email = ?").get(email) as ParentRow | undefined;
}

export function getParentById(db: DatabaseType, id: string): ParentRow | undefined {
  return db.prepare("SELECT * FROM parents WHERE id = ?").get(id) as ParentRow | undefined;
}

export async function createParent(db: DatabaseType, input: NewParent): Promise<Enrollment> {
  const id = randomUUID();
  const passwordHash = await hashPassword(input.password);
  const totpSecret = generateTotpSecret();
  const backupCodes = generateBackupCodes();
  db.prepare(
    `INSERT INTO parents (id, email, display_name, password_hash, totp_secret, totp_enabled, backup_codes_hashes)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
  ).run(id, input.email, input.displayName, passwordHash, totpSecret, JSON.stringify(backupCodes.map(hashBackupCode)));
  return { id, totpSecret, otpauthUrl: otpauthUrl(totpSecret, input.email), backupCodes };
}

export function confirmTotp(db: DatabaseType, parentId: string, token: string): boolean {
  const p = getParentById(db, parentId);
  if (!p || !verifyTotp(p.totp_secret, token)) return false;
  db.prepare("UPDATE parents SET totp_enabled = 1 WHERE id = ?").run(parentId);
  return true;
}
