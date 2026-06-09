---
name: object-storage-web lib composite build
description: Why typecheck fails after adding the object-storage-web lib to a web artifact, and how to make it pass.
---

# object-storage-web lib is a composite project reference but ships unbuilt

When the object-storage skill's `object-storage-web` lib is added to a web
artifact, the artifact's `tsconfig.json` references it as a TypeScript project
reference. But the lib scaffold ships **without** `"composite": true` and has
**no build script**, and its `package.json` `exports` points at `./src/index.ts`
(source, for Vite) rather than `dist`.

This produces two sequential typecheck failures:
1. `TS6306: Referenced project ... must have setting "composite": true` — fix by
   adding `composite: true`, `declarationMap: true`, `emitDeclarationOnly: true`
   to the lib's `tsconfig.json` (match the other libs, e.g. api-client-react).
2. `TS6305: Output file dist/index.d.ts has not been built from source` — the
   artifact typecheck runs `tsc -p` (not `tsc -b`), which does not build
   referenced projects. Emit the declarations once with `npx tsc -b lib/object-storage-web`.

**Why:** keeping `exports` on source is correct for Vite bundling; the composite
build only exists so `tsc -p` on the consuming artifact can resolve the lib's
`.d.ts`.

**How to apply:** after wiring object storage into a web artifact, if typecheck
complains about the composite reference, add the composite compiler options to
the lib tsconfig AND run `tsc -b` on the lib once to produce `dist/*.d.ts`.

Also: this lib's `ObjectUploader` callback params (`onGetUploadParameters(file)`,
`onComplete(result)`) only get proper types once the declarations are built —
before that they surface as `noImplicitAny` errors in the consuming page.
