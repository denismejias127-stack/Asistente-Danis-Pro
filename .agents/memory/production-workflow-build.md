---
name: Production workflow builds
description: The main preview workflow serves the compiled dist output instead of running source files directly.
---

Source changes are not visible in the main preview until the production build regenerates `dist`, followed by a workflow restart.

**Why:** The configured start command launches the compiled server with `node ./dist/index.cjs`; restarting alone can leave the preview running old frontend and backend bundles.

**How to apply:** After changing client or server code, run the project build once, restart the `Start application` workflow, and check its logs before validating the result.