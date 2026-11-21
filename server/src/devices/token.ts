import { createHash } from "node:crypto";

/** Hash stocké d'un jeton d'appareil : sha256 hex du jeton brut (sans normalisation). */
export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
