# Architecture and decisions

A single strict TypeScript package keeps v0.1 maintainable while separating testable services.

| Module | Responsibility |
| --- | --- |
| domain.ts | Domain interfaces and runtime catalog/command validation |
| git.ts | Argument-array Git, paths, worktree registration and text patches |
| store.ts | Versioned catalog, exclusive lock and atomic rename |
| service.ts | Lifecycle, durable creation manifests and recovery |
| runner.ts | Approval/trust, adapters, bounded output and process control |
| comparison.ts | Historical command evidence and JSON/Markdown reports |
| extension.ts | Native Explorer, dialogs and commands |

The original tree is not used as the baseline runner. Every Earth has a UUID path beneath external storage. Registration and Git common-directory checks establish ownership before mutation; symlink/junction ancestors are refused.

Catalog reads/writes undergo runtime validation. Unknown schema versions and corruption fail closed. An exclusive lock coordinates windows; a temporary file and atomic rename persist changes. Creation manifests are written before worktree creation so interrupted catalog saves are recoverable. No migrations are needed for initial schema version 1.

Only known npm scripts or relative Node test files execute. Other commands are argument arrays with shell:false. Windows npm.cmd needs cmd.exe; only constrained script identifiers enter that adapter. This avoids accidental command injection, not malicious approved scripts.

Run fingerprints cover platform, extension Node, timeout, package manifest and lockfiles. They exclude installed dependency integrity, actual PATH binary identities and external services. Content hashes include tracked and non-ignored untracked files. Service.report checks current HEAD and contents before comparing; legacy hashes have unknown freshness. Commands record whether files changed during execution. Comparisons remain coarse command-level evidence. Native Markdown reports remain the evidence view. A branded home Webview uses escaped HTML, local resource roots, nonce CSP and an explicit action/ID message protocol; project history and active experiment selection are native TreeViews.

Registry access failed during development, so core dependencies were avoided and node:test replaces Vitest. Local TypeScript 5.9.3 supports the build. Normal development tooling is declared in package.json; a registry-generated lockfile is a release gate. An offline VSIX writer is separate from official Marketplace tooling.


Home and history are derived from persisted user-created experiments, with incomplete creation attempts excluded from normal history. Active selection is per-window memory and starts empty. F5 targets a generated workspace with an empty folders array, preventing previous-folder restoration without creating sample data. Catalog data is never seeded at activation.

## 0.3 snapshots and branch preservation

Snapshots use a unique temporary Git index populated from HEAD and current files. The real source index is never used for staging the snapshot. Duplicate Earth materialises the snapshot tree in a newly owned worktree at the experiment baseline. Bring Changes Back creates a commit with the snapshot tree and Earth HEAD parent, then creates a branch with an absent-ref precondition. Preview approval is tied to the revision, raw contents hash and snapshot tree. Existing branches cannot be overwritten. No checkout, merge, reset or stash occurs in the original source worktree.
