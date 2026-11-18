# ParallelEarth 0.6.0 — combined release

This release combines the previously proposed 0.6, 0.7 and 0.8 work into **0.6.0**. Existing catalogs remain readable. JSON comparison reports use version 6.

## Checkpoints

Right-click an alternative Earth and choose **Save Checkpoint**. Checkpoints preserve tracked and non-ignored new files, binary files, deletions and staging boundaries. Git references keep the working snapshot and index reachable during normal Git garbage collection. Each Earth can retain 20 checkpoints; deletion is explicit.

**Restore Checkpoint** previews the changes and creates a safety checkpoint first. Save or close unsaved Earth documents before restoring, including buffers in other editor windows. Restore applies files and staging while retaining the current HEAD and commit history. Older check evidence is invalidated even if restored files match a previous run. New checks record the new evidence generation.

Ignored files are excluded, and ignored-file collisions are refused. Restoration joins the shared execution queue. Git filters may execute in the trusted repository. A filesystem failure can leave a partial restore; use the retained safety checkpoint to recover. Keep a free checkpoint slot for the automatic backup.

## Visual recipe builder

Open **Recipe Builder** from the experiment menu or comparison dashboard. Enter committed baseline/candidate references, choose an npm check script, dependency setup and repeat count, and select available mapped acceptance criteria. Criteria for other scripts are disabled. Save JSON for CLI/CI, or choose **Save and run** and approve execution. Runs create a fresh experiment and support cancellation.

Recipes use committed Git references; uncommitted source/Earth edits are not included. Unmapped requirements must be mapped through **Manage Acceptance Criteria** first. The recipe format remains version 1, with an optional `regressionTests` field.

## Preview health

Earth rows now show STARTING, READY, FAILED or STOPPED. **Preview Health** displays the latest response or error. A GET request probes the assigned loopback port every two seconds, with a 15-second startup grace period. HTTP 200–399 indicates readiness; redirects are not followed. Set `parallelEarth.previewHealthPath` to `/health` or another local path if the root does not return a successful response.

Monitoring reacts to terminal close/execution-end events and checks terminal exit status. A later successful probe can recover an unavailable endpoint to READY. HTTP readiness does not prove the whole application works or authenticate the responder's process identity. Scripts must respect their assigned ports. Worktrees and ports do not isolate databases, credentials or external services.

## Selective file export

Choose **Export Selected Files** on an alternative. Select complete changed files to create a new verification Earth from the experiment baseline plus those files. Excluded files and unrelated commits are not inherited. Binary additions and deletions are supported. This release selects whole files; edit the verification Earth for finer changes and then rerun checks.

Set up the verification Earth and run checks, then use **Bring Changes Back**. A complete, passing, current check series is required for selection exports. The resulting branch starts from the experiment baseline. The original Earth and source checkout/index are retained. Evidence from the broader original alternative does not substitute for checking the selected files.

## Baseline refresh

Choose **Refresh Baseline**, enter an existing local Git reference and select alternatives to carry forward. ParallelEarth creates a new experiment at that commit and merges snapshots of the alternatives into fresh worktrees. Existing experiments remain available. Acceptance mappings and regression goals carry forward; run history does not.

Conflicts remain in the new Earths for normal Git/editor resolution. Checks refuse unresolved merge entries. Resolve and finish or quit the merge as appropriate, review the files, then run setup/checks. Git merge drivers and filters may run. Unrelated Git histories are refused. Interrupted refreshes leave the new experiment available for inspection.

## Storage and recovery manager

Open **Storage and Recovery Manager** for per-Earth disk usage, checkpoint counts, ownership problems and uncatalogued directories. Symlink targets are excluded, and bounded scans label partial totals.

The manager can recover worktree catalog records from manifests, import completed runs retained after catalog-write failures, and recover interrupted execution queues. Invalid evidence is retained with an explanation. Queue recovery refuses live owners and requires confirmation that no child command survives. Uncatalogued directories are listed for manual inspection and never automatically deleted. Cleanup refuses edits, ignored files, extra commits and checkpoints. Generic Git metadata corruption may still need manual Git repair.

## Guided regression verification

Run a structured Jest/Vitest check in the candidate, then choose **Verify Regression Fix**. Select the candidate and the tests expected to distinguish the bug. After approval, the same check runs three times per Earth.

VERIFIED requires complete, current, comparable evidence; the configured repeat count; byte-identical selected test files; selected tests failing on the baseline and passing on the candidate; and a passing candidate command. Missing/skipped tests, altered files, varying outcomes, incomplete series and tests already passing on baseline are inconclusive. Candidate failures are FAILED.

This establishes the recorded distinction made by the selected tests. It does not independently prove requirement semantics, unchanged imported helpers, external service state or complete correctness. Introduce the same regression suite into both committed implementations when needed.

CI recipes can include:

```json
"regressionTests": [{"file": "tests/booking.test.ts", "name": "booking prevents duplicates"}]
```

The recipe repeat count becomes the minimum regression-run requirement. CI fails if a configured regression goal is not VERIFIED.

## Native Test Explorer

Choose **Publish Results to Test Explorer** to publish recorded test passes, failures and messages into VS Code's Testing view. Stale, skipped and todo evidence is skipped. Editor changes invalidate native results. Once published, checks through the extension refresh the displayed experiment results.

The native run profile reruns each selected Earth's full recorded check command with normal approval. Selecting an individual test does not rewrite an npm script or imply that only that test executes.

## Changed-line coverage

Configure a check wrapper to write fresh **Istanbul JSON** to `process.env.PARALLEL_EARTH_COVERAGE`. This is a unique, initially empty temporary file for each run, subject to path/symlink and output-byte limits. Jest/Vitest can produce `coverage-final.json` with their JSON coverage reporter; copy that run's generated file to the supplied path after completion. Clear the reporter output before running and propagate the test command's exit code.

Dashboard and JSON/Markdown exports compare added/modified lines with recorded statement start lines. Positive counts are COVERED, zero counts are UNCOVERED, and missing statement data is UNMEASURED. Unmeasured lines may be non-executable or absent from the report. The percentage describes measured lines only; no measured lines yields N/A. Statements on the same line use the lowest hit count. Continuation lines without their own statement are unmeasured. Deleted/binary files are excluded from line totals. Source maps and coverage accuracy depend on the reporter.

Code changes, checkpoint restore, incomplete checks and later setup prevent old coverage being displayed as current. Coverage records execution, not correctness. Repository scripts and framework reports remain trusted inputs; a wrapper can still fabricate or copy stale coverage. Captures are bounded to 1,000 files and 100,000 statement entries; comparisons allow up to 50,000 changed lines, in addition to the configured output-byte limit.

## Build and package

```sh
npm run typecheck
npm test
npm run demo
npm run package
```

Follow the [publishing guide](publishing.md) to generate `artifacts/parallel-earth-0.6.0-marketplace.vsix` with Microsoft's release tool.
