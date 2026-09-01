# Tasks: Extract anti-slop

- [x] Extract `tools/oxlint/anti-slop` into a buildable `packages/anti-slop` package.
  - Acceptance: the default export and all existing rule IDs are unchanged; package metadata, README, license, build config, and a Changeset exist.
  - Verify: `pnpm install`, `pnpm --filter @workspace/oxlint-anti-slop build`, and `pnpm --filter @workspace/oxlint-anti-slop typecheck`.
  - Files: `packages/anti-slop/**`, `tools/oxlint/anti-slop/**`, `.changeset/**`, `pnpm-lock.yaml`.

- [x] Make this repository consume the workspace package.
  - Acceptance: `.oxlintrc.json` resolves `@workspace/oxlint-anti-slop` by package name and no configuration references the old tools path.
  - Verify: `pnpm format:check`, `pnpm lint`, and `pnpm typecheck`.
  - Files: `.oxlintrc.json`, `.oxfmtrc.json`, `package.json`, `pnpm-lock.yaml`.

- [x] Finalize the private workspace package.
  - Acceptance: package publication is disabled and the completed extraction is committed and pushed on `anti-slop-package`.
  - Verify: `pnpm format:check`, `pnpm lint`, and `pnpm typecheck`.
  - Files: `packages/anti-slop/package.json`, `.changeset/**`.
