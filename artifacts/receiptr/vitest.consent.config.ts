import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Consent route/store unit tests only: no startup imports or database setup.
export default defineConfig({
  root: fileURLToPath(new URL("../api-server", import.meta.url)),
  test: { environment: "node", include: ["src/routes/attributionConsent.test.ts"], globalSetup: [], setupFiles: [] },
});
