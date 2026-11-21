import { expect, test } from "vitest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db/connection.js";

test("GET /health renvoie ok", async () => {
  const app = buildApp(openDb(":memory:"));
  const res = await app.inject({ method: "GET", url: "/health" });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: "ok", app: "AwladShield" });
});
