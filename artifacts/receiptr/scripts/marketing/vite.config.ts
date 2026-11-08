import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { activeCapture, createCaptureSession } from "./fixtures.mjs";
import { illustrativePdf, sampleDocumentLines } from "./sample-document.mjs";

const capture = activeCapture();
const samplePdf = capture.name === "us" ? illustrativePdf(sampleDocumentLines(capture.receipts[0])) : null;

function capturePreview() {
  const session = createCaptureSession();
  return {
    name: "receebo-capture-preview",
    transformIndexHtml(html: string) {
      return html.replace(
        "<head>",
        `<head><meta name="receebo-capture-at" content="${capture.capturedAt}"><meta name="color-scheme" content="light">`,
      );
    },
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string; method?: string }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (body?: string | Buffer) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "/";
        if (url.startsWith("/sample/receipt.pdf")) {
          if (!samplePdf) { res.statusCode = 404; res.end("EU sample image is written by record.mjs"); return; }
          res.setHeader("Content-Type", "application/pdf");
          res.end(samplePdf);
          return;
        }
        if (!url.startsWith("/api/")) return next();
        const action = session.answer(req.method ?? "GET", `http://127.0.0.1:5199${url}`);
        if (action.fulfill?.sample) {
          if (!samplePdf) { res.statusCode = 404; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "EU sample image is written by record.mjs" })); return; }
          res.setHeader("Content-Type", action.fulfill.contentType);
          res.end(samplePdf);
          return;
        }
        const fulfill = action.patch ? { json: session.patched({}) } : action.fulfill;
        if (!fulfill) { res.statusCode = 404; res.end(); return; }
        if (fulfill.json !== undefined) {
          res.statusCode = fulfill.status ?? 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(fulfill.json));
          return;
        }
        res.statusCode = fulfill.status ?? 200;
        if (fulfill.contentType) res.setHeader("Content-Type", fulfill.contentType);
        res.end(fulfill.body ?? "");
      });
    },
  };
}

// Separate, loopback-only tooling. Never imported by the application build.
export default defineConfig({
  root: import.meta.dirname,
  publicDir: path.resolve(import.meta.dirname, "../../public"),
  plugins: [react(), tailwindcss(), capturePreview()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../../src"),
      "@clerk/react": path.resolve(import.meta.dirname, "fictional-auth.ts"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: { host: "127.0.0.1", port: 5199, strictPort: true },
});
