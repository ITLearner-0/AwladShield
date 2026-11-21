import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = 3921;
const DB_PATH = join(tmpdir(), `awlad-e2e-${Date.now()}.db`);
const DASHBOARD_DIST = join(process.cwd(), "dist");

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    launchOptions: {
      executablePath: "/opt/pw-browsers/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "../server/node_modules/.bin/tsx ../server/src/server.ts",
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DB_PATH,
      DASHBOARD_DIST,
      NODE_ENV: "test",
    },
  },
});
