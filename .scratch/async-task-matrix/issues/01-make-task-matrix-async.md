# Make Task Matrix discovery asynchronous

Type: task
Status: resolved

## Question

How should `defineTask` accept an async `matrix` function, await its Matrix during Vitest collection, and retain exact Case coordinate inference?

## Answer

`defineTask` accepts `matrix?: () => Promise<M>` and normalizes omission to an async empty Matrix. `defineWorkflow` uses Vitest's async suite factory to validate Task definitions, await all Matrix functions, expand their returned Matrices, and only then register Task suites. The const generic `M` preserves exact coordinates from the async function's returned literal.
