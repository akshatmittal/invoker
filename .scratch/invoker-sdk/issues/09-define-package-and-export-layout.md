# Define package placement and exports

Type: grilling
Status: resolved
Blocked by: 08

## Question

Where should `@akshatmittal/invoker` live in the current workspace, which ESM entry points and types should it export, which existing build tooling should it reuse, and what repository template code is outside the SDK package's boundary?

## Answer

The published SDK lives at `packages/invoker` as `@akshatmittal/invoker`, initially versioned `0.1.0`. The private root package is renamed from `@workspace/invoker` to `invoker-workspace` so the workspace and published package cannot be confused.

Implementation replaces the empty `packages/app-config` template with `packages/invoker` and deletes `apps/web-start`, `packages/ui`, the `apps/*` workspace path, their TypeScript references, every web-only dependency, catalog entry, override, compiler option, and lockfile entry. Shared TypeScript tooling remains private and becomes strict Node/ESM configuration without DOM or JSX settings.

pnpm workspace management, Changesets, Turbo, formatting, linting, and release scripts remain. Add the missing standard `.changeset/config.json` for a public independently versioned package. Keep `tsdown` as the SDK build/bundling tool, reusing the existing ESM and declaration-generation setup.

`@akshatmittal/invoker` is ESM-only and publishes one `"."` export containing `defineTask`, `defineWorkflow`, and the approved public types. It has no Node, reporter, configuration, or internal subpath exports. Package metadata uses public npm access, MIT, `sideEffects: false`, the existing GitHub repository, the root's Node 24 engine requirement, and ships only `dist`, its focused README, and license material.

Vitest `^4.1.7` is a required peer dependency and a development dependency for local build/typechecking. It is referenced directly rather than added to the shared catalog. Runtime code imports only documented public APIs from `vitest`; no internal Vitest package is a direct dependency.
