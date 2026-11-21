import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getParentByEmail } from "../parents/parents.repo.js";
import { hashPassword, verifyPassword, verifyTotp } from "./crypto.js";
import { createSession, deleteSession, SESSION_COOKIE, SESSION_TTL_MS } from "./sessions.js";

const loginBody = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  totp: z.string().min(1),
});

// Hash factice : égalise le temps de réponse quand l'email est inconnu.
let dummyHash: Promise<string> | undefined;

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/login", async (req, reply) => {
    const fail = () => reply.code(401).send({ error: "invalid_credentials" });
    const body = loginBody.safeParse(req.body);
    if (!body.success) return fail();
    const { email, password, totp } = body.data;

    const parent = getParentByEmail(app.db, email);
    if (!parent) {
      dummyHash ??= hashPassword("dummy-password");
      await verifyPassword(await dummyHash, password);
      return fail();
    }
    const passwordOk = await verifyPassword(parent.password_hash, password);
    const totpOk = verifyTotp(parent.totp_secret, totp);
    if (!passwordOk || !totpOk) return fail();

    const sid = createSession(app.db, parent.id);
    reply.setCookie(SESSION_COOKIE, sid, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
    return { parentId: parent.id, displayName: parent.display_name };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const sid = req.cookies[SESSION_COOKIE];
    if (sid) deleteSession(app.db, sid);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });
}
