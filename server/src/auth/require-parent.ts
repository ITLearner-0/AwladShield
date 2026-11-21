import type { FastifyReply, FastifyRequest } from "fastify";
import { getSessionParent, SESSION_COOKIE } from "./sessions.js";

export async function requireParent(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sid = req.cookies[SESSION_COOKIE];
  const parentId = sid ? getSessionParent(req.server.db, sid) : null;
  if (!parentId) return reply.code(401).send({ error: "unauthorized" });
  req.parentId = parentId;
}

declare module "fastify" {
  interface FastifyRequest {
    parentId?: string;
  }
}
