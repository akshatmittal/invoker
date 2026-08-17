# Define the package and deployment contract

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

How should the independent `@akshatmittal/invoker/github` subpath be built and exported; which runtime dependencies belong to the module versus its tiny host app; how should `t3-env`, evlog, Node signals, environment secrets, and Docker be documented; and what is the minimum runnable deployment example without adding a CLI, hosted app, or published image?

## Answer

Keep one npm package with two independent ESM entries. Add `src/github.ts` beside `src/index.ts`, build both with tsdown, and export the new entry as:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.mts",
      "import": "./dist/index.mjs"
    },
    "./github": {
      "types": "./dist/github.d.mts",
      "import": "./dist/github.mjs"
    }
  }
}
```

The `./github` source graph imports nothing from the root SDK or Vitest. Mark the existing Vitest peer optional with `peerDependenciesMeta` so GitHub-only consumers can install `@akshatmittal/invoker` without Vitest; root SDK consumers continue to install the documented Vitest peer.

Add `@octokit/auth-app`, `@octokit/request`, `croner`, and `evlog` as direct runtime dependencies with ordinary package-local version ranges, not workspace catalog entries. Directly import every declared dependency. Because npm dependencies apply to the whole package, root-only consumers also download these packages; a separate install graph would require a different npm package and is outside the agreed `@akshatmittal/invoker/github` interface.

`@t3-oss/env-core` and Zod belong only to the host application and documentation. The published module accepts App credentials explicitly and never reads environment variables or initializes process-global evlog configuration. Document the minimum host as one plain ESM file requiring no TypeScript build:

```js
import { createEnv } from "@t3-oss/env-core";
import { defineGitHubSchedule } from "@akshatmittal/invoker/github";
import { z } from "zod";

const env = createEnv({
  server: {
    GITHUB_APP_ID: z.coerce.number().int().positive(),
    GITHUB_APP_PRIVATE_KEY: z.string().min(1),
  },
  runtimeEnv: process.env,
});

await defineGitHubSchedule({
  app: {
    id: env.GITHUB_APP_ID,
    privateKey: env.GITHUB_APP_PRIVATE_KEY,
  },
  schedules: [
    {
      cron: "0 9 * * 1",
      timezone: "UTC",
      repository: "acme/regressions",
      workflow: "invoker.yml",
      ref: "main",
      inputs: { dataset: "weekly" },
    },
  ],
});
```

The package README owns GitHub App setup, the Actions-write permission, selected-repository installation, host dependency installation, configuration, lifecycle, one-replica invariant, failure behavior, and a documented Docker example. Do not add a workspace example app, CLI, bin entry, committed deployment, hosted service, or published image.

The Docker example uses `node:24-slim`, installs only production dependencies, copies `schedule.mjs`, switches to the image's non-root `node` user, and runs `node schedule.mjs`. Inject `GITHUB_APP_ID` and the real multiline `GITHUB_APP_PRIVATE_KEY` at runtime; never copy an env file or credential into the image. Use process liveness, evlog output, the platform restart policy, and exactly one replica. No HTTP server, health endpoint, readiness protocol, or Docker build pipeline belongs to this version.

Implementation adds a minor Changeset and verifies the package with typecheck, build, and packed-file inspection. Repository instructions prohibit adding or running tests for this work.
