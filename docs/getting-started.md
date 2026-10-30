# Your first experiment

Open a trusted local Git repository with at least one commit. Use the Pixel Portal activity-bar icon or Command Palette. The Start here panel has New experiment, Find experiment, Dashboard and Quick guide shortcuts.

**Create Experiment** selects a repository and committed revision. Nested folders resolve to their Git root; multiple repositories prompt for selection. Dirty originals are excluded and preserved. A separate baseline worktree is created.

Expand the current experiment and create an Earth. Click its row or its **Open Earth** icon to open it. Use the play icon to run checks; right-click the Earth for inspection, patching, renaming, duplication, archiving and deletion. Edit and save in the new window, then return to the experiment window.

**Run Checks** lists conventional npm scripts or accepts a relative Node test-file path. A modal displays the exact command, directory, script body when applicable, privileges and machine/network risks. Choose **Approve and Run**. Use Cancel in the progress notification; output is streamed and a bounded copy is retained.

Run identical checks for baseline and alternatives with matching settings. **Compare Earths** opens historical Markdown evidence. NOT_RUN means no run occurred. INCONCLUSIVE means baseline evidence is missing or fingerprints differ. REGRESSION means a matching baseline command passed and the alternative failed. These are command-level comparisons.

**Inspect Changes** shows tracked diff against source, including staged and unstaged changes, plus untracked filenames. Untracked contents are excluded. **Apply Patch** previews and requests approval for small plain-text Git patches. Renames, quoted paths, symlink patches and binary patches are unsupported.

**Archive Earth** toggles archive state. **Duplicate Earth Baseline** creates another clean worktree at the same source commit; edits are not copied.

**Delete Earth** requires confirmation and refuses tracked edits, untracked/ignored files, new commits, baselines, symlink paths and unowned directories. Preserve work manually first. There is no automatic cleanup.

**Recover Experiments** validates creation manifests and Git registration, recovers journaled worktrees missing from the catalog and reports unavailable paths. It does not delete stale records or silently repair missing Git metadata.

Storage defaults to extension global storage outside the repository. Settings changes to storage require window reload. Storage changes switch catalogs. At most 50 runs per Earth are retained, with a configured byte limit per run. Telemetry and AI are absent.

For the fixture demo, invoke npm run demo in the extension source repository. Review artifacts/booking-report.md.


## Readable Earth names

New directories use project--earth-name--short-id, for example nanighar--test-change--a1b2c3d4. Open Earth launches a named workspace showing nanighar - Earth: test-change with a ParallelEarth window title. Existing UUID directories stay in place and receive readable display labels when reopened. Rename Earth updates the display name on next open; the creation-time directory stays stable to avoid breaking terminals and processes. Workspace descriptions are generated outside your project. No .vscode files are written into the original or Earth repository.


## Home and history

F5 prepares an explicit empty workspace, opens ParallelEarth home, and creates no demo or experiment. Pick Create Experiment to select your own Git project. Project History groups previously created experiments by repository. Click an experiment to resume it; it appears in Current experiment without opening its source folder. Open Earth opens only the selected Earth workspace.

Deletion is available from home project rows, experiment context menus or Delete Experiment. Remove from History keeps Earth folders; Delete Clean Worktrees first verifies every worktree is owned, clean and at its source commit. Dirty or otherwise unpreserved work prevents cleanup. The original project is always retained. Failed creation records are hidden from normal history but can be selected in Delete Experiment.

For setup, directory actions, repeated checks and queue recovery, see the README section “New in 0.2.0”. Commands now run sequentially across windows sharing storage.
