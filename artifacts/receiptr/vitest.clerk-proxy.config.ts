import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Deliberately independent of vitest.api.config.ts: no database globalSetup.
export default defineConfig({
  root: fileURLToPath(new URL("../api-server", import.meta.url)),
  test: {
    environment: "node",
    include: ["src/middlewares/clerkProxyMiddleware.test.ts"],
    globalSetup: [],
    setupFiles: [],
  },
});
