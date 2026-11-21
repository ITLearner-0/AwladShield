import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireParent } from "../auth/require-parent.js";
import { childExists, claimPairingCode, createPairingCode } from "./pairing.repo.js";

const codeBody = z.object({ childId: z.string().min(1), deviceName: z.string().min(1) });
const claimBody = z.object({ code: z.string().min(1), hostname: z.string().min(1), os: z.string().min(1) });

export async function pairingRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/pairing/code", { preHandler: requireParent }, async (req, reply) => {
    const body = codeBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    if (!childExists(app.db, body.data.childId)) return reply.code(404).send({ error: "child_not_found" });
    return reply.code(201).send(createPairingCode(app.db, body.data));
  });

  app.post("/api/pairing/claim", async (req, reply) => {
    const body = claimBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    const r = claimPairingCode(app.db, body.data);
    if (r.ok) return { deviceId: r.deviceId, deviceToken: r.deviceToken };
    if (r.reason === "expired") return reply.code(410).send({ error: "code_expired" });
    if (r.reason === "used") return reply.code(409).send({ error: "code_used" });
    return reply.code(404).send({ error: "code_not_found" });
  });
}
