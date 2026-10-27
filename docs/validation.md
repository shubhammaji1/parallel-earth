# Validation — 27 October 2026

Current scoped verification on Windows:
- Semantic TypeScript checking passed.
- Build passed.
- Fourteen focused tests passed (naming, project flow and history performance).
- Real temporary Git repositories verified readable worktree naming, legacy ownership, recovery, history removal preserving dirty files, and clean experiment deletion without modifying original files.
- Startup preparation produces an explicit empty workspace: no repository, demo or experiment is created.
- Home HTML escaping, nonce CSP and message allowlist were tested.

These results do not replace the outstanding full release gates. The earlier core checks and real booking demo were exercised during initial implementation; Windows process-tree cancellation, full extension-host automation, cross-platform verification, official dependency locking/advisory checks and Marketplace release are still pending.


History performance update: tested 1,000 project summaries with six rendered rows per page, search, sorting, duplicate-delete suppression and in-place updates preserving search. Clean deletion checks were verified using temporary Git repositories. One local four-Earth benchmark improved from 4,779 ms to 1,249 ms; disk size and Windows file locks still affect cleanup time. A transient Windows permission failure was observed during earlier runs; the final focused run passed all 14 tests.
