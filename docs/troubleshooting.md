# Troubleshooting

- No repository: open a local Git repository containing a committed HEAD.
- Restricted Mode: review and trust the workspace before Git/check commands.
- Storage error: choose an absolute location outside the repository without symlink/junction ancestors.
- Missing dependencies: review and manually install inside each Earth.
- Catalog busy after a crash: close all windows using this catalog, remove only catalog.lock in the configured storage directory, then reopen and Recover Experiments.
- Corrupt catalog: the file is preserved. Back it up and inspect it; no automatic reset occurs.
- Missing worktree/repository: recovery reports the path; restore manually. No destructive repair occurs.
- Interrupted baseline creation: recover if the worktree was created; otherwise create a new experiment and preserve the incomplete entry for inspection.
- Deletion refused: preserve or remove tracked/untracked/ignored files and commits yourself.
- Timeout/cancellation: inspect active processes; OS policies may block termination.
- INCONCLUSIVE: run the same baseline command with matching settings/lockfiles. External services may still differ.
- Old results after edits: save and rerun; evidence is historical.
- Registry unavailable: build with installed TypeScript if available. Generate a lockfile and install/review development tooling before release.

