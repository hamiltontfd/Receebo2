---
name: Don't create duplicate dev workflows for an artifact
description: A web artifact already has a system-managed dev workflow; adding your own console workflow for the same dev command causes a port conflict and a "failed" artifact workflow.
---

# Each artifact already has a managed dev workflow — do not add a second one

In this pnpm monorepo, every artifact gets a system-managed workflow named
`artifacts/<slug>: <service>` (e.g. `artifacts/receiptr: web`). It is generated
from the artifact's real config at `artifacts/<slug>/.replit-artifact/artifact.toml`
(NOT `artifacts/<slug>/artifact.toml`, which is empty/unused). That config sets the
service `localPort` and a `[services.env]` block (e.g. `PORT=5000`, `BASE_PATH=/`),
and the matching `.replit` `[[ports]]` entry. Path routing: the api-server is the
router on the single external port and proxies `previewPath` -> the service's
`localPort`; the browser/preview hits `localhost:80/<previewPath>`, never the
artifact port directly.

**The trap:** if a "... : web" workflow shows "failed", do NOT work around it by
creating your own console workflow that runs the same dev command on the same port.
That second workflow squats the artifact's `localPort`, so the managed workflow then
fails with "Port <N> is already in use" — a self-inflicted conflict that persists
across restarts and confuses the user ("the artifact failed to run").

**How to apply:**
1. First screenshot `localhost:80/<previewPath>` — if it renders, serving is fine.
2. Inspect the REAL config at `.replit-artifact/artifact.toml`. If it has the right
   `localPort` and `[services.env]` (PORT/BASE_PATH), the managed workflow is correct.
3. If a "failed" managed workflow is caused by a duplicate workflow you (or a past
   session) added, `removeWorkflow({name})` the duplicate, then restart the managed
   `artifacts/<slug>: web` workflow. It will bind the freed port and serve.
4. To change an artifact's port/env/command, edit `.replit-artifact/artifact.toml`
   via `verifyAndReplaceArtifactToml` — never hand-roll a parallel workflow.

**Why:** the managed workflow and the artifact config are the single source of truth.
A parallel console workflow is redundant and races for the same port.
