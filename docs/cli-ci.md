# CLI and CI in 0.5

Build the repository with `npm ci --ignore-scripts` and `npm run build`. Node 22.17 or newer is required. Run `node dist/cli.js --help` for commands. The packaged VSIX also contains `dist/cli.js`; the CLI has no VS Code runtime dependency.

Commands are `list`, `create`, `earth`, `run`, `report`, and `ci`. Always supply an absolute or relative `--storage` directory outside the repository. Use the same storage path as the extension to share experiments. `list` prints experiment and Earth IDs. `run` accepts an existing Earth ID, an npm script, `--repeat 1..10`, and explicit `--approve`. `report` exports JSON or Markdown (`--format markdown`).

```sh
node dist/cli.js ci --storage ../earth-ci --repo . --baseline HEAD~1 --candidate HEAD --script test:json --repeat 2 --approve --output ../earth-report.json
```

CI uses committed references. Uncommitted source files and staging stay untouched and are not included in the candidate. Baseline and candidate receive fresh, separate worktrees; dependencies are not copied. Use optional `--setup ci` (lockfile required) or `--setup install` to install dependencies in each Earth. Setup and checks share the existing execution queue. These commands run repository scripts with your privileges; approve only repositories and revisions you trust.

To reuse a recipe, save this JSON and run `node dist/cli.js ci --storage ../earth-ci --repo . --recipe recipe.json --approve --output ../earth-report.json`. Recipe check/ref settings cannot be overridden by command-line flags.

```json
{
  "version": 1,
  "name": "Verify booking fix",
  "baseline": "HEAD~1",
  "candidate": "HEAD",
  "script": "test:json",
  "repeat": 2,
  "setup": "ci",
  "criteria": [
    {
      "label": "Prevent duplicate bookings",
      "tests": [{"file": "tests/booking.test.ts", "name": "booking prevents duplicate bookings"}]
    }
  ]
}
```

Test names are the reporter's exact `fullName`; files use repository-relative forward slashes. Criteria require structured Jest-compatible JSON. Without a structured reporter or criteria, CI gates command-level evidence only. Empty, malformed or interrupted detected reports fail the gate. Candidate tests reported as skipped, todo, missing, unstable or inconclusive cannot pass. A passing candidate must have complete, current evidence, a comparable baseline, known Node/npm versions, and all configured criteria VERIFIED. Baseline test failures can be improved; baseline execution errors/timeouts cannot establish a passing gate.

Exit codes: **0** gate passed; **1** check/comparison gate failed; **2** usage, setup or execution infrastructure error. Worktrees and catalog are retained for diagnosis; CI runners can discard their temporary directory after archiving reports. Never cache a live execution-queue lock. Reports contain paths, logs and failure messages; review before sharing.

Environment fingerprints now include observed PATH Node/npm versions, declared package manager and selected configuration hashes. A changed manifest, lockfile or configuration can make the environments incomparable; such CI results fail conservatively even if commands pass. No installed dependency tree, global npm configuration, database state or external service equivalence is asserted. Old records can still be read; rerun baseline and alternatives for the new comparison evidence.

## GitHub Actions example

Keep the comparison on trusted revisions. Do not use `pull_request_target` to execute untrusted pull-request code. This example runs on pushes and requires a `test:json` npm script in both revisions. Adjust the CLI path if using this tool from a different repository.

```yaml
name: Experiment evidence
on: [push]
permissions:
  contents: read
jobs:
  compare:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci --ignore-scripts
      - run: npm run build
      - name: Compare committed implementations
        run: node dist/cli.js ci --repo . --storage "$RUNNER_TEMP/earths" --baseline HEAD~1 --candidate HEAD --script test:json --setup ci --repeat 2 --approve --output "$RUNNER_TEMP/earth-report.json"
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: experiment-evidence
          path: ${{ runner.temp }}/earth-report.json
```

## App previews

In the Earth context menu, choose **Start App Preview**, select a `dev`, `start` or `serve` script, select a port mode, and approve the displayed script. **Open App Preview** opens its loopback URL. **Stop App Preview** disposes its managed terminal. Closing that terminal also clears the session entry. Previews are transient and stop when their owning extension window closes; they are not restarted after reload.

Available ports are allocated from 4300–4399. Vite mode supplies `--host 127.0.0.1 --port <port> --strictPort`. PORT/HOST mode sets those environment variables; the app must use them and must not fall back to a different port. Verify the actual URL and readiness in the terminal before opening. Another process can claim a port between reservation and app binding; use the terminal error and restart to choose another port. Launching does not claim that an HTTP health check passed.

Previews run in parallel with each other. Stop this window's managed preview before setup, checks, archiving or deletion. Other windows and external processes are not controlled. Worktree directories and ports do not isolate databases, APIs, credentials or other shared services. Configure independent test services/data. Terminal disposal controls its process tree through VS Code; scripts that deliberately detach services require manual cleanup.

**Compare Environments** captures current tools and configuration hashes across Earths. The comparison dashboard and reports show environments recorded at check time. They include OS/architecture, extension Node, PATH Node/npm, declared manager, selected file hashes and fixed check overrides (CI and FORCE_COLOR). Raw `.npmrc` contents and arbitrary environment variables are not exported.
