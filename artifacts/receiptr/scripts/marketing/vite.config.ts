import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Separate, loopback-only tooling. Never imported by the application build.
export default defineConfig({
  root: import.meta.dirname,
  publicDir: path.resolve(import.meta.dirname, "../../public"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../../src"),
      "@clerk/react": path.resolve(import.meta.dirname, "fictional-auth.ts"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: { host: "127.0.0.1", port: 5199, strictPort: true },
});
