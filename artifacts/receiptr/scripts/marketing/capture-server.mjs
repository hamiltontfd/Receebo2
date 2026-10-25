import { createServer } from "vite";

// Started with a minimal environment by release-check.mjs, never as an app route.
const server = await createServer({
  configFile: new URL("./vite.config.ts", import.meta.url).pathname,
});
await server.listen();
process.send?.("ready");
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => { await server.close(); process.exit(0); });
}
