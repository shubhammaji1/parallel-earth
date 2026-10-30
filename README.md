<p align="center">
  <img src="https://raw.githubusercontent.com/shubhammaji1/parallel-earth/main/media/parallel-earth-logo.png" alt="ParallelEarth Pixel Portal logo" width="180">
</p>

# ParallelEarth — Git Worktree Experiments for VS Code

**Explore alternate futures. Verify before you change.**

Try alternative implementations in separate Git worktrees, run checks you approve, and compare their results against a committed baseline—all organised as one experiment inside VS Code.

**[Install from Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=shubhammaji1.parallel-earth)** · **[Install from Open VSX](https://open-vsx.org/extension/shubhammaji1/parallel-earth)** · [Report an issue](https://github.com/shubhammaji1/parallel-earth/issues)

ParallelEarth is available on both registries. It runs locally and requires no AI account, API key or cloud backend. The extension includes no telemetry; commands and tools you choose to run can have their own network behaviour.

[Quick start](#quick-start) · [Why ParallelEarth?](#why-parallelearth-instead-of-git-branches) · [Features](#features) · [Installation](#installation) · [FAQ](#faq) · [Development](#development)

## What is ParallelEarth?

When you have two ways to fix a bug or refactor a function, you need more than separate copies of the code. You need a way to keep track of the question, the approaches and what happened when you checked them.

ParallelEarth brings those pieces together:

| Concept | What it means |
| --- | --- |
| **Experiment** | A named investigation attached to a Git repository and an exact committed revision. |
| **Baseline Earth** | A reference Git worktree created from that revision. |
| **Alternative Earth** | A separate detached Git worktree where you try an implementation. |
| **Check evidence** | Recorded command results you can compare with a matching baseline check. |

Your original working files stay in place while you edit alternatives in their own directories and editor windows.

## Why ParallelEarth instead of Git branches?

Git branches and worktrees already support parallel development. ParallelEarth adds an experiment workflow around those Git capabilities.

| Task | Manual Git workflow | ParallelEarth |
| --- | --- | --- |
| Try another implementation | Create and organise branches or worktrees | Create a named Earth under an experiment |
| Keep a reference version | Maintain a reference checkout | Use the experiment's committed baseline Earth |
| Record check results | Collect command output yourself | Retain approved runs with each Earth |
| Compare alternatives | Match commands and outcomes yourself | Compare matching checks against the baseline |
| Document the decision | Assemble a report | Export JSON or Markdown evidence |

**A branch is often enough for a normal feature or bug fix.** ParallelEarth is useful when you want to evaluate competing implementations before deciding what to keep.

Use it to compare refactoring approaches, investigate bug fixes, or check alternative AI-generated implementations. It does not generate code, automatically choose a winner or replace code review.

## Installation

### VS Code

1. Open **Extensions** and search for **ParallelEarth**.
2. Choose the extension published by **shubhammaji1** and click **Install**.
3. Open the Command Palette and run **ParallelEarth: Open Home**.

You can also install through the [Visual Studio Marketplace listing](https://marketplace.visualstudio.com/items?itemName=shubhammaji1.parallel-earth), or use the VS Code CLI:

```sh
code --install-extension shubhammaji1.parallel-earth
```

### Open VSX and compatible editors

ParallelEarth is also available on [Open VSX](https://open-vsx.org/extension/shubhammaji1/parallel-earth). In an editor configured to use Open VSX, search for **ParallelEarth** or **shubhammaji1.parallel-earth**.

Registry availability does not guarantee compatibility with every editor. Cursor, VSCodium and other VS Code-based editors must support the declared VS Code APIs and local extension execution; editor-specific clean-install validation remains a separate check. This VSIX is not a JetBrains plugin.

### Install a VSIX manually

Download a VSIX from a registry listing, then use **Extensions → … → Install from VSIX…**. Reload if prompted and run **ParallelEarth: Open Home**.

### Requirements

- VS Code **1.100 or later**, or a compatible editor supporting the required APIs.
- A trusted, local Git repository with **at least one commit**.
- Git available to the extension.
- The tools required by your chosen checks, such as Node.js and npm for a Node project.

Browser-only and virtual workspaces are unsupported. Development requires Node.js **22.17 or later**. Publication does not imply that every operating system and editor combination has been verified.

## Quick start

1. **Open Home.** Run **ParallelEarth: Open Home** from the Command Palette.
2. **Create an experiment.** Select your Git repository, name the question you want to investigate, and choose a committed starting revision.
3. **Create alternative Earths.** Use descriptive names such as “Approach A — deduplicate” and “Approach B — alternative algorithm”.
4. **Open an Earth.** Edit its separate working directory in a new editor window. Install project dependencies deliberately if needed.
5. **Run matching checks.** Select and approve checks for the baseline and alternatives.
6. **Compare evidence.** Compare Earths, inspect changes and export a JSON or Markdown report.
7. **Decide what to keep.** Review the chosen changes and bring them back using your normal Git workflow.

No demo project or experiment is created automatically. History contains the projects you create or resume.

> Earths start from a committed revision. Uncommitted, untracked and ignored files from your original checkout are not automatically copied. Dependencies are not installed automatically. Duplicating an Earth starts from its original committed baseline, not its current edits.

## Example: compare a booking reconciliation fix

The repository includes a booking reconciliation fixture with a baseline and three alternatives. Its expected check outcomes are:

| Earth | Outcome | Meaning in this fixture |
| --- | --- | --- |
| Baseline | `PASSED` | The reference command succeeds. |
| A — Deduplicate correctly | `PASSED` | The alternative also passes the check. |
| B — Duplicate regression | `REGRESSION` | The baseline passes, but this alternative fails the matching check. |
| C — Not yet checked | `NOT_RUN` | No check evidence has been recorded. |

Run the fixture explicitly from a development checkout:

```sh
npm install
npm run demo
```

The demo creates a separate fixture repository and real Git worktrees. It writes reports to `artifacts` and retains the fixture for inspection. It does not run when a user opens the extension.

**A passing command is evidence for that command, not proof of overall correctness.** Single-run durations are not performance benchmarks. Comparison depends on matching checks and compatible recorded fingerprints; mismatches are inconclusive. Rerun checks after editing an implementation.

## Features

- **Named code experiments:** group related implementation alternatives around a question.
- **Committed baselines:** pin the starting point to an exact Git revision.
- **Separate Git worktrees:** edit alternatives without switching the original checkout's files.
- **Readable Earth names:** identify alternatives in folder names and editor windows.
- **Earth management:** rename, archive, unarchive and duplicate alternatives from the committed baseline.
- **Change inspection:** inspect tracked diffs and untracked filenames; preview and approve supported text patches.
- **Approved checks:** discover npm test, build, lint, typecheck and check scripts, or select a Node test file.
- **Recorded evidence:** retain command status, bounded output and run identifiers.
- **Baseline comparison:** compare matching checks and export JSON or Markdown reports.
- **Project history:** search and sort compact project rows with pagination.
- **Conservative cleanup:** remove history while retaining files, or delete eligible clean worktrees.

Reports summarise the latest check per Earth. JSON includes retained run history, capped at 50 runs per Earth. Individual test assertions remain in command output rather than normalised assertion records. Git worktrees can hold projects in many languages; built-in check discovery currently focuses on npm scripts and Node test files.

## Project history and cleanup

Resume previous experiments from Project History. Home provides search, sorting and pagination as the project list grows.

| Action | Result |
| --- | --- |
| **Remove from History** | Removes the catalog entry while retaining Earth files. |
| **Delete Clean Worktrees** | Checks ownership and cleanliness before removing worktrees. Edits, untracked or ignored files, and new commits block cleanup. |

The original source repository is not a deletion target. Individual baseline deletion is refused; deleting an entire experiment can remove its eligible clean baseline and alternatives.

## FAQ

### Does ParallelEarth merge changes back into my project?

No automatic merge or transfer back to the source checkout is performed. Review the alternative's changes and use your normal Git workflow to bring them back. Keep the Earth until you have verified that your chosen changes are preserved.

### Can I use it with AI coding tools?

You can use editing tools available in an Earth's editor window. ParallelEarth does not depend on an AI provider. Check the outputs using your project's own tests, builds or other relevant checks.

### Is an Earth a security sandbox?

An Earth is a Git worktree, not a container or security boundary. Approved commands can access your machine, files, credentials and network. Use trusted projects and commands.

### Does it upload my source code?

The extension has no source-upload backend or telemetry. Scripts, dependencies and external tools that you run may communicate over the network independently.

### Why are my uncommitted changes missing from an Earth?

Earths are created from the selected committed revision. Commit the intended starting code before creating the experiment; local edits and ignored files are not automatically included.

### Why is a comparison inconclusive?

The alternative needs a matching baseline command with a compatible recorded fingerprint. Different commands or environments cannot establish a like-for-like comparison. Fingerprints do not verify all installed dependencies or external services.

## Execution and evidence limits

Workspace Trust and explicit command approval apply to execution. The runner provides timeouts, cancellation controls, bounded logs and concurrency limits. Git hooks and external diff/textconv are disabled for extension Git operations; repository checkout filters remain a trust consideration.

Logs and exported reports may contain sensitive project information. Review them before sharing. Container isolation, automatic AI generation, automatic merging and normalised assertion-level verification are outside the current scope.

## Development

Requirements: Node.js 22.17+, npm, Git and VS Code 1.100+.

```sh
git clone https://github.com/shubhammaji1/parallel-earth.git
cd parallel-earth
npm install
npm run typecheck
npm test
npm run build
```

Press **F5** to launch an Extension Development Host with an explicit empty workspace. Startup does not create experiments or open the fixture project.

Additional commands:

```sh
# Explicit fixture demonstration
npm run demo

# Extension-host checks (require a suitable GUI/display environment)
npm run test:host

# Build a VSIX with the repository's local packaging script
npm run package
```

For official VSIX packaging, create the output directory if needed and run:

```sh
npx @vscode/vsce package --no-dependencies --out artifacts/parallel-earth-0.2.0.vsix
```

Use the version declared in `package.json` when naming release artifacts. The build transpiles TypeScript; semantic checking is the separate `typecheck` command. Packaging alone does not verify extension behaviour; test a clean installation before releasing an update.

## Documentation and feedback

- [Getting started](https://github.com/shubhammaji1/parallel-earth/blob/main/docs/getting-started.md)
- [Architecture](https://github.com/shubhammaji1/parallel-earth/blob/main/docs/architecture.md)
- [Experiment isolation](https://github.com/shubhammaji1/parallel-earth/blob/main/docs/experiment-isolation.md)
- [Security model](https://github.com/shubhammaji1/parallel-earth/blob/main/docs/security-model.md)
- [Troubleshooting](https://github.com/shubhammaji1/parallel-earth/blob/main/docs/troubleshooting.md)
- [Validation notes](https://github.com/shubhammaji1/parallel-earth/blob/main/docs/validation.md)
- [Contributing](https://github.com/shubhammaji1/parallel-earth/blob/main/CONTRIBUTING.md)
- [Changelog](https://github.com/shubhammaji1/parallel-earth/blob/main/CHANGELOG.md)

Found a bug or a confusing step? [Open an issue](https://github.com/shubhammaji1/parallel-earth/issues) with your editor/OS versions, reproduction steps and relevant redacted output. If you have tried ParallelEarth, an honest registry review helps other developers understand whether it fits their workflow.

## License

ParallelEarth is available under the [MIT License](https://github.com/shubhammaji1/parallel-earth/blob/main/LICENSE).


## New in 0.2.0: setup and repeatable evidence

Right-click an Earth for **Copy Earth Path**, **Reveal Earth Folder** or **Set Up Earth**. Fresh worktrees have no installed dependencies. Review and approve `npm ci`, `npm install` or a project setup script; setup outcomes are recorded separately from checks. Dependencies are never automatically shared.

Use **Repeat Checks Against Baseline** on an experiment, choose alternatives, a command and 2–10 runs per Earth. Every completed run is retained (up to 50 per Earth). Incomplete or changed series are inconclusive; mixed pass/fail outcomes are labelled **UNSTABLE**. This identifies observed variation, not its cause. A later single check replaces the comparison summary; JSON preserves retained history.

Setup and checks use one shared queue across windows using the same local storage root. Progress shows Queued, Running or Cancelled. Cancellation prevents queued commands from starting. Other tools, other roots, remote machines and test-runner workers are outside this queue. Elapsed times are not benchmarks. The old concurrency setting is deprecated and ignored.

Reports include directory paths, setup status, commands, revisions, fingerprints, repeat outcomes and queue scope. Review paths and logs before sharing.

### Interrupted execution queue

An interrupted host may leave `execution-queue/active` beneath your storage root. ParallelEarth never automatically steals this lock: a child command may still be running. Close other ParallelEarth windows and verify/stop surviving commands before removing that **active directory only**, then retry. Do not share storage over a network filesystem.
