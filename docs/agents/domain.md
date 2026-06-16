# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`docs/project-architecture.md`** for the current product shape, module boundaries, contracts, and phase status
- **`docs/git-recovery-2026-06-14.md`** before doing branch cleanup, worktree changes, or any Git recovery action
- **`.roundtable-lite/project.md`** for durable product memory and delivery rules
- The topic-specific doc that matches the work area, when relevant:
  - `docs/component-contracts.md`
  - `docs/design-system.md`
  - `docs/design-tokens.md`
  - `docs/cloudbase-capabilities.md`
  - `docs/billing-design.md`
  - `docs/tool-runtime-contracts.md`
  - `docs/journey-map-tool.md`

If one of these files doesn't exist, proceed silently. Don't flag its absence; don't suggest creating replacement docs upfront unless the user asks for documentation work.

## File structure

Single-context repo:

```text
/
├── AGENTS.md
├── .roundtable-lite/
│   ├── project.md
│   ├── modules.json
│   ├── tasks.jsonl
│   └── reviews.jsonl
├── docs/
│   ├── project-architecture.md
│   ├── git-recovery-2026-06-14.md
│   └── *.md topic docs
└── src/
```

## Use the glossary's vocabulary

When naming domain concepts in issues, refactor proposals, hypotheses, or tests, prefer the terminology already used in `docs/project-architecture.md` and `.roundtable-lite/project.md`.

If a needed concept is missing from those docs, first reuse the closest existing term. Only propose a new term when the distinction matters.

## Flag decision conflicts

This repo does not currently use a dedicated `docs/adr/` tree. If your output contradicts a documented decision in `docs/project-architecture.md`, `.roundtable-lite/project.md`, or a task review record, surface that conflict explicitly rather than silently overriding it.
