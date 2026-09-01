# Plan: Extract anti-slop

## Components

1. **Private package** — move the existing plugin source into `packages/anti-slop`, add the minimal ESM build/type contract, documentation, license, and Changeset.
2. **Workspace consumer** — point the root Oxlint configuration at the workspace package and update workspace dependency metadata.
3. **Finalize** — mark the package private, verify the workspace, then commit and push the completed extraction.

## Dependency Order

```text
Package contract and source
  → workspace consumption and lint verification
    → private-package verification and push
```

The source move and package contract must land together because neither is useful independently. Repository consumption follows so Oxlint exercises the packaged entry point. Private-package verification is last.

## Risks and Mitigations

- **Broken runtime resolution:** run repository Oxlint through the workspace package before packing.
- **Accidental publication:** set `private: true` and use an empty Changeset so release automation cannot publish the package.

## Slices and Checkpoints

### Slice 1: Extract the package

Move the existing source without rule changes, define the `@workspace/oxlint-anti-slop` default export contract, add package metadata/docs/build configuration, install workspace links, and add a Changeset.

Checkpoint: `pnpm --filter @workspace/oxlint-anti-slop build` and `pnpm --filter @workspace/oxlint-anti-slop typecheck` pass. Commit the slice.

### Slice 2: Consume it from the workspace

Replace the relative plugin specifier with `@workspace/oxlint-anti-slop`, update ignore paths and root dependencies, then verify the whole workspace.

Checkpoint: `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` pass. Commit the slice.

### Slice 3: Finalize

Mark the package private, keep its workspace version at `0.0.0`, verify the final workspace, commit, and push the branch.

Checkpoint: package build, formatting, lint, and workspace typecheck pass with a clean committed branch.

## Parallelism

None. Each slice depends on the previous one.
