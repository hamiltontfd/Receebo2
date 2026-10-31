// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";
import { APP_COPY } from "./appCopy";

it("keeps every literal application translation key in the shared catalog", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const missing: string[] = [];
  let checked = 0;
  for (const dir of ["pages", "components", "hooks", "lib"]) {
    for (const name of readdirSync(path.join(root, dir), { recursive: true }) as string[]) {
      if (!/\.tsx?$/.test(name) || name.includes(".test.")) continue;
      const file = path.join(root, dir, name);
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node)) {
          const fn = node.expression.getText(source);
          const key = node.arguments[fn === "appError" ? 1 : 0];
          if (["appText", "appError"].includes(fn) && key && ts.isStringLiteral(key)) {
            checked++;
            if (!Object.hasOwn(APP_COPY, key.text)) missing.push(`${dir}/${name}: ${key.text}`);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  expect(checked).toBeGreaterThan(300);
  expect(missing).toEqual([]);
});
