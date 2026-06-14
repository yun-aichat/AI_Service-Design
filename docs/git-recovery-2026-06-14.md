# Git Recovery Record

Recovery date: 2026-06-14

## Incident

The repository metadata directory `D:\knowledge\codex\design\.git` disappeared
after the local branch cleanup completed. The cleanup session log shows only
`git tag`, `git branch -d`, and read-only inspection commands. The final
successful repository check happened immediately before `.git` became
unavailable.

No remote repository was configured, and no recoverable local Git object store,
pack file, recycle-bin copy, or Codex worktree copy was found. The source working
tree remained intact.

Before rebuilding Git metadata, a source backup was created at:

`D:\knowledge\codex\design-recovery-20260614-120031.zip`

## Recovery Policy

- Preserve the current source tree exactly.
- Do not claim that the reconstructed commit is the original Git history.
- Create a new recovery baseline on `main`.
- Recreate active development branches from that baseline.
- Keep this record as the bridge to the known historical commit identifiers.

## Known Historical Chain

The following commit identifiers and subjects were recovered from the Codex
session log:

```text
8ab6f45 fix(billing-entitlements): tighten payment bindings
47ecca3 feat(billing-entitlements): wire payment integration flow
edd9ab7 fix(persistence-backend): honor cloudbase create contracts
36d6708 feat(persistence-backend): formalize journey project documents
2bdbcf6 fix(ai-orchestration): wire assistant route context and auth
7ded03e fix(persistence-backend): wire tool document reads
770bc7a feat(ai-orchestration): formalize journey assistant protocol
81919c6 feat(billing-entitlements): define billing contracts
b5bffb5 feat(persistence-backend): add tool document persistence
36a05fd refactor(platform-shell): collapse component library and css leftovers
7f366c3 feat(tool-runtime): extract journey map editor ui
ead10d9 feat(ai-orchestration): extract journey assistant panel
9e7ee22 feat(tool-runtime): extract journey map runtime
a68c9c2 test(tool-runtime): baseline journey map behavior
c4e81fc fix(identity): complete cloudbase auth acceptance
d0325c6 test(tool-runtime): cover contract boundaries
50e0d66 feat(platform-shell): establish chakra design foundation
61da886 feat(identity-cloudbase): add otp authentication adapter
afa75cc docs(identity-cloudbase): record verified login configuration
05066fc feat(tool-runtime): define tool document contracts
68b1dba docs(identity-cloudbase): document available cloudbase capabilities
f8fcd8c initial demo completed
d6a58ed feat(journey-editor): add stage and dimension deletion
257c41b refine journey map selection layout
3a4f047 adjust typography weights
6eea648 add typography design tokens
b1d35db tune MiSans font weights
30fbef5 refine orange color system and font
3787194 initial design toolbox snapshot
```

These identifiers are historical references only. Their Git objects were not
available during recovery and therefore cannot be checked out from the rebuilt
repository.

## Active Branches After Recovery

- `main`: reconstructed source baseline
- `codex/billing-entitlements-credits`: active credit billing work
- `codex/persistence-backend-credit-config`: active persistence/config work

Future tasks must create a dedicated branch before editing and must commit only
their module-owned files.
