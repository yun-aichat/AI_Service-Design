## Agent skills

### Issue tracker

Issues and PRDs for this repo are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the default triage label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain docs layout. See `docs/agents/domain.md`.

### Execution workflow

This repo uses Roundtable Lite as the only active coordination workflow, with one task per branch and one branch per linked worktree. See `docs/agents/roundtable-lite.md`.

Task completion is not valid until the agent records the Roundtable Lite state transition itself (`submit`, `complete`, or `review`). A code change without the matching task event is unfinished work.
