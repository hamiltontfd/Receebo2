import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Pure evaluator/fixture checks only. Never inherit the API database globalSetup.
export default defineConfig({
  root: fileURLToPath(new URL("../api-server", import.meta.url)),
  test: {
    environment: "node",
    include: ["src/lib/marketingFixture.test.ts", "src/lib/itemCoverage.test.ts"],
    globalSetup: [],
    setupFiles: [],
  },
});
