import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { chromium } from "@playwright/test";

// Prefer an explicit override, then bundled Chromium, then the workspace browser.
// Replit provides Chromium on PATH, without Playwright's headless-shell download.
export function iconBrowserOptions(override = process.env.CHROMIUM_PATH) {
  const executablePath = override || [chromium.executablePath(),
    ...(process.env.PATH || "").split(delimiter).map((dir) => join(dir, "chromium")),
  ].find((file) => existsSync(file));
  return executablePath ? { executablePath } : {};
}
