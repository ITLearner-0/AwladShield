import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import type { DatabaseType } from "./db/connection.js";
import { authRoutes } from "./auth/auth.routes.js";
import { parentsRoutes } from "./parents/parents.routes.js";
import { childrenRoutes } from "./children/children.routes.js";
import { pairingRoutes } from "./devices/pairing.routes.js";
import { devicesRoutes } from "./devices/devices.routes.js";

function dashboardDist(): string {
  if (process.env.DASHBOARD_DIST) return process.env.DASHBOARD_DIST;
  // src/app.ts -> ../../dashboard/dist ; dist/app.js -> ../../dashboard/dist (identique).
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dashboard", "dist");
}

export function buildApp(db: DatabaseType): FastifyInstance {
  const app = Fastify();
  app.decorate("db", db);
  app.get("/health", async () => ({ status: "ok", app: "AwladShield" }));
  app.register(cookie);
  app.register(authRoutes);
  app.register(parentsRoutes);
  app.register(childrenRoutes);
  app.register(pairingRoutes);
  app.register(devicesRoutes);

  // Sert la SPA construite si elle existe. Les tests sans dist ne l'activent pas.
  const dist = dashboardDist();
  if (existsSync(join(dist, "index.html"))) {
    app.register(fastifyStatic, { root: dist });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api") && !req.url.startsWith("/health")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "not_found" });
    });
  }

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    db: DatabaseType;
  }
}
