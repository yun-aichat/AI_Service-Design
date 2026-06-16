# Roundtable Lite Workflow

This repo uses **Roundtable Lite** as the only active coordination workflow.

## Source of truth

- Active coordination state lives in `.roundtable-lite/`.
- `AGENTS.md` points engineering skills to the repo protocols.
- `docs/project-architecture.md` and `.roundtable-lite/project.md` hold the product and delivery context.
- The legacy `.roundtable/` format is not active in this repo and must not be recreated unless the user explicitly asks for a migration back to full Roundtable.

## Canonical workspace

- Canonical repo root: `D:\knowledge\codex\design_02`
- Canonical main worktree: the repo root above
- Linked feature worktrees live under `.worktrees/`

If any older note or task mentions `D:\knowledge\codex\design`, treat it as historical context unless the user explicitly says otherwise.

## Git safety rules

- Do not implement feature work directly in the canonical main worktree.
- Each active task gets exactly one branch and one linked worktree.
- Create the branch from the intended base first, then create the linked worktree.
- Keep the main worktree for hosting, review, triage, and documentation-only changes when safe.
- Never use `git add .` or `git add -A`.
- Stage only the files owned by the current task.
- Check `git diff --cached` before every commit.
- Do not mix user changes, unrelated module files, or generated artifacts into the same commit.

## Task lifecycle

1. Read `AGENTS.md`, this file, `.roundtable-lite/project.md`, and the relevant topic docs.
2. Confirm the task maps to one module boundary from `.roundtable-lite/modules.json`.
3. Create or reuse a task in `.roundtable-lite/tasks.jsonl`.
4. Create a dedicated branch and linked worktree under `.worktrees/<task-or-branch-name>`.
5. Implement and verify only inside that linked worktree.
6. Record verification evidence and changed files when submitting or completing the task.
7. Use reviewer flow whenever the task's `review_required` is `true`.

## When the worktree is already dirty

- Stop and inspect `git status --short --branch` before starting new implementation work.
- If tracked files are unexpectedly missing or unrelated changes are present, treat that as a baseline problem, not as part of the new task.
- Resolve the baseline first, or move the new task into a fresh linked worktree from a known commit.

## Review expectations

- `docs`-only tasks may complete without reviewer flow when risk is low.
- Code changes should follow the task's recorded `review_required` value.
- Do not mark a task complete from chat memory alone; use the evidence recorded in `.roundtable-lite/tasks.jsonl` and `reviews.jsonl`.
