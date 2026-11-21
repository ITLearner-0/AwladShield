import Fastify, { type FastifyInstance } from "fastify";
import type { DatabaseType } from "./db/connection.js";
import { parentsRoutes } from "./parents/parents.routes.js";

export function buildApp(db: DatabaseType): FastifyInstance {
  const app = Fastify();
  app.decorate("db", db);
  app.get("/health", async () => ({ status: "ok", app: "AwladShield" }));
  app.register(parentsRoutes);
  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    db: DatabaseType;
  }
}
