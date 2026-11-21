import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import type { DatabaseType } from "./db/connection.js";
import { authRoutes } from "./auth/auth.routes.js";
import { parentsRoutes } from "./parents/parents.routes.js";
import { childrenRoutes } from "./children/children.routes.js";
import { pairingRoutes } from "./devices/pairing.routes.js";

export function buildApp(db: DatabaseType): FastifyInstance {
  const app = Fastify();
  app.decorate("db", db);
  app.get("/health", async () => ({ status: "ok", app: "AwladShield" }));
  app.register(cookie);
  app.register(authRoutes);
  app.register(parentsRoutes);
  app.register(childrenRoutes);
  app.register(pairingRoutes);
  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    db: DatabaseType;
  }
}
