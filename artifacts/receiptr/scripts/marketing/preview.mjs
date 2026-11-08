import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activeCapture } from "./fixtures.mjs";
import { illustrativePdf, sampleDocumentLines } from "./sample-document.mjs";

// Loopback sample server. Not a production route and not the DEV app.
const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "../../../..");
const capture = activeCapture();
if (capture.name === "us") {
  const dir = path.join(workspace, "generated-artifacts/receebo-marketing-us/sources");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "sample-receipt.pdf");
  await writeFile(file, illustrativePdf(sampleDocumentLines(capture.receipts[0])));
  console.log(`Sample PDF for the file picker: ${file}`);
  console.log("Download: http://127.0.0.1:5199/sample/receipt.pdf");
}
console.log(`Sample ${capture.name} (market ${capture.market}, ${capture.locale}) http://127.0.0.1:5199/`);
console.log("Loopback only. The DEV app URL does not serve this harness. Port 5199 is not a published port.");
const child = spawn("pnpm", ["--filter", "@workspace/receiptr", "exec", "vite", "--config", "scripts/marketing/vite.config.ts"], {
  cwd: workspace,
  env: process.env,
  stdio: "inherit",
});
child.on("exit", code => process.exit(code ?? 1));
