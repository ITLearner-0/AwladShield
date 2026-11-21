import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Pendant le dev, les appels /api et /health sont relayés vers le serveur Fastify.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
});
