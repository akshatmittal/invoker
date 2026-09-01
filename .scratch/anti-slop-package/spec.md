# Spec: anti-slop npm package

## Objective

Extract the existing Oxlint anti-slop plugin into a private `@workspace/oxlint-anti-slop` package without changing its rules or rule IDs. Success means this repository consumes the package through the workspace and release automation cannot publish it.

## Tech Stack

- TypeScript 7 and ESM
- Oxlint JavaScript plugin API from `@oxlint/plugins`
- tsdown for ESM and declaration output
- pnpm workspaces, Turborepo, and Changesets

## Commands

- Install: `pnpm install`
- Build: `pnpm --filter @workspace/oxlint-anti-slop build`
- Typecheck: `pnpm --filter @workspace/oxlint-anti-slop typecheck`
- Lint: `pnpm lint`

## Project Structure

```text
packages/anti-slop/
  src/index.ts       → default Oxlint plugin export
  src/rules/         → existing rule implementations
  src/shared/        → existing shared rule helpers
  package.json       → private workspace metadata and scripts
  README.md          → workspace Oxlint configuration
  LICENSE            → MIT license
  tsconfig.json      → package typecheck configuration
  tsdown.config.ts   → ESM and declaration build
```

The old `tools/oxlint/anti-slop/` directory is removed after the repository lint configuration consumes `anti-slop` from the workspace.

## Public Interface and Code Style

The package exposes one default plugin export and preserves the current `anti-slop/*` rule IDs:

```ts
import antiSlopPlugin from "@workspace/oxlint-anti-slop";

export default antiSlopPlugin;
```

Consumer configuration:

```json
{
  "jsPlugins": [{ "name": "anti-slop", "specifier": "@workspace/oxlint-anti-slop" }],
  "rules": {
    "anti-slop/no-object-parameters": "error"
  }
}
```

Existing repository TypeScript and formatting conventions remain unchanged.

## Testing Strategy

Per repository instructions, add no tests. Verify the extracted package by building declarations and ESM, typechecking the package and existing consumers, linting the repository through the packaged plugin, inspecting the packed tarball contents, and running Oxlint against the repository.

## Boundaries

- Always: preserve all current rules, default export, plugin name, and rule IDs; keep the package private; add a Changeset.
- Ask first: any change to rule behavior or publication status.
- Never: publish the package or make unrelated repository changes.

## Success Criteria

- The package default export contains every current rule under the same rule name.
- This repository loads the plugin through the `@workspace/oxlint-anti-slop` dependency rather than a relative source path.
- Package build, workspace typecheck, formatting, and lint pass.
- The package is marked private so package managers and Changesets cannot publish it.
- The implementation is committed and pushed on `anti-slop-package`.

## Open Questions

None.
