import type { FastifyReply, FastifyRequest } from "fastify";
import { hashDeviceToken } from "./token.js";

export async function requireDevice(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const m = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "");
  if (!m) return reply.code(401).send({ error: "unauthorized" });
  const hash = hashDeviceToken(m[1]!);
  const row = req.server.db.prepare("SELECT id FROM devices WHERE token_hash = ?").get(hash) as
    | { id: string }
    | undefined;
  if (!row) return reply.code(401).send({ error: "unauthorized" });
  req.deviceId = row.id;
}

declare module "fastify" {
  interface FastifyRequest {
    deviceId?: string;
  }
}
