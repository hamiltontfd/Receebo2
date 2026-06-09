---
name: Artifact port detection vs serving
description: Why a web artifact's dev workflow can report "failed" / DIDNT_OPEN_A_PORT yet the app still serves fine through the api-server router.
---

# Artifact dev-workflow port detection is separate from actual serving

In this pnpm monorepo, web artifacts are path-routed: the `api` artifact (api-server)
is the application router on the single external port (e.g. 8080 -> external 80) and
dispatches incoming paths to each web artifact's `localPort` based on its
`artifact.toml` (`previewPath` -> `localPort`). The browser/preview never hits the
web artifact's port directly.

Two independent systems are easy to confuse:
- **Serving** works whenever the web artifact's vite dev server is alive on its
  `localPort`. The api-server proxy routes `previewPath` -> that localPort. No
  `.replit` `[[ports]]` entry is required for this.
- **Workflow port DETECTION** (what marks a workflow running vs failed) reads the
  external ports declared in `.replit`. If the artifact has no `.replit` `[[ports]]`
  entry, the detector reports `openPorts=null` -> `DIDNT_OPEN_A_PORT` no matter which
  port the app actually binds, and the artifact-managed workflow gets killed at the
  port-wait timeout.

**Why this happened here:** the `receiptr` artifact was bootstrapped with an invalid
localPort, so no `.replit` `[[ports]]` entry was ever written for it. There is no
agent tool to edit `.replit` directly (blocked), and `verifyAndReplaceArtifactToml` /
`configureWorkflow` do NOT add `.replit` port entries. The artifact registration also
can't be removed, so cleanly recreating the artifact is not possible.

**Workaround that works:** create a plain console workflow (e.g. `receiptr-run`) with
NO `waitForPort` running the artifact's dev command (`PORT=<localPort> BASE_PATH=/ pnpm
--filter @workspace/<artifact> run dev`). With no port wait it is never killed, vite
stays alive, and the api-server proxy serves the preview at `localhost:80/`. The
artifact-managed `... : web` workflow will keep showing "failed" — that label is
cosmetic here. **Production is unaffected**: prod serves a static build through
api-server, not the dev workflow.

**How to apply:** Don't chase a "failed" web-artifact workflow / DIDNT_OPEN_A_PORT as
if the app is down — first screenshot `localhost:80/<previewPath>` through the proxy.
If it renders, serving is fine and the failure is just detection. Keep vite alive via
a no-waitForPort console workflow rather than fighting `.replit`.
