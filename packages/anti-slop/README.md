# @workspace/oxlint-anti-slop

Opinionated Oxlint rules that reject low-evidence and low-signal TypeScript patterns.

This is a private package for the Invoker workspace.
Generic rules are synced from [`dmmulroy/anti-slop` v0.1.2](https://github.com/dmmulroy/anti-slop/tree/v0.1.2).

## Configure

Add the plugin and enable the rules you want in `.oxlintrc.json`:

```json
{
  "jsPlugins": [{ "name": "anti-slop", "specifier": "@workspace/oxlint-anti-slop" }],
  "rules": {
    "anti-slop/no-object-parameters": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error"
  }
}
```

Available rules:

- `no-chained-type-assertions`
- `no-conditional-empty-object-spread`
- `no-known-value-widening`
- `no-module-mocking`
- `no-object-parameters`
- `no-reflect-apply`
- `no-reflect-get`
- `no-runtime-typeof`
- `no-shape-in-symbol-names`
- `no-unknown-parameters`
- `no-unknown-returns`
- `no-unknown-type-aliases`
- `no-unsafe-dictionary-type`
- `no-widen-then-assert`
- `require-safety-comment-for-type-assertion`

The package does not enable rules automatically.
