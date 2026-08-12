# Domain Docs

How engineering skills consume this repo's domain documentation.

## Before exploring, read these

- `CONTEXT.md` at the repo root
- Relevant ADRs under `docs/adr/`

If these files don't exist, proceed silently. The `/domain-modeling` skill creates them when terms or decisions are resolved.

## Layout

This repository uses a single context:

/
├── CONTEXT.md
└── docs/adr/

## Use the glossary's vocabulary

Use terms as defined in `CONTEXT.md`. If a needed concept is absent, reconsider the wording or note the gap for `/domain-modeling`.

## Flag ADR conflicts

Surface any conflict with an existing ADR explicitly rather than silently overriding it.
