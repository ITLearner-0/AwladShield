import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { confirmTotp, countParents, createParent, getParentByEmail } from "./parents.repo.js";

const newParentBody = z.object({
  email: z.email(),
  displayName: z.string().min(1),
  password: z.string().min(1),
});
const confirmBody = z.object({ parentId: z.string().min(1), token: z.string().min(1) });

export async function parentsRoutes(app: FastifyInstance): Promise<void> {
  const enroll = async (input: z.infer<typeof newParentBody>) => {
    const r = await createParent(app.db, input);
    return { parentId: r.id, otpauthUrl: r.otpauthUrl, backupCodes: r.backupCodes };
  };

  app.post("/api/setup", async (req, reply) => {
    const body = newParentBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    if (countParents(app.db) > 0) return reply.code(409).send({ error: "already_setup" });
    return reply.code(201).send(await enroll(body.data));
  });

  app.post("/api/setup/confirm", async (req, reply) => {
    const body = confirmBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    if (!confirmTotp(app.db, body.data.parentId, body.data.token)) {
      return reply.code(400).send({ error: "invalid_token" });
    }
    return { ok: true };
  });

  // TODO(Task 4): protect with requireParent
  app.post("/api/parents", async (req, reply) => {
    const body = newParentBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    if (getParentByEmail(app.db, body.data.email)) return reply.code(409).send({ error: "email_taken" });
    return reply.code(201).send(await enroll(body.data));
  });
}
