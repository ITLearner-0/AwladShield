import { buildApp } from "./app.js";
import { openDb } from "./db/connection.js";
import { runMigrations } from "./db/migrate.js";

const db = openDb(process.env.DB_PATH ?? "awladshield.db");
runMigrations(db);
const app = buildApp(db);
const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: process.env.HOST ?? "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
