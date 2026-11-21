import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireParent } from "../auth/require-parent.js";
import { createChild, listChildren } from "./children.repo.js";

const newChildBody = z.object({
  displayName: z.string().min(1),
  ageBand: z.enum(["7-10", "11-14", "15-17"]),
});

export async function childrenRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/children", { preHandler: requireParent }, async () => listChildren(app.db));

  app.post("/api/children", { preHandler: requireParent }, async (req, reply) => {
    const body = newChildBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    return reply.code(201).send({ id: createChild(app.db, body.data) });
  });
}
