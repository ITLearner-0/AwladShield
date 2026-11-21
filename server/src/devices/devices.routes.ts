import type { FastifyInstance } from "fastify";
import { requireParent } from "../auth/require-parent.js";
import { requireDevice } from "./require-device.js";

export const ONLINE_WINDOW_MS = 3 * 60_000;

interface DeviceRow {
  id: string;
  child_id: string;
  name: string;
  os: string;
  last_seen_at: string | null;
}

export async function devicesRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/devices/heartbeat", { preHandler: requireDevice }, async (req) => {
    const serverTime = new Date().toISOString();
    app.db.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").run(serverTime, req.deviceId);
    return { serverTime };
  });

  app.get("/api/devices", { preHandler: requireParent }, async () => {
    const rows = app.db
      .prepare("SELECT id, child_id, name, os, last_seen_at FROM devices ORDER BY paired_at, id")
      .all() as DeviceRow[];
    const now = Date.now();
    return rows.map((r) => ({
      id: r.id,
      childId: r.child_id,
      name: r.name,
      os: r.os,
      lastSeenAt: r.last_seen_at,
      online: r.last_seen_at !== null && now - new Date(r.last_seen_at).getTime() < ONLINE_WINDOW_MS,
    }));
  });
}
