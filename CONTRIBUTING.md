# Contributing

Use Node >=22.17 and Git. Install tooling, run npm run typecheck, npm test and npm run demo. Press F5 for the host. Run npm run test:host when Electron downloads are available.

Keep services separate. Never reset/stash/clean originals, auto-install, infer absent test evidence or claim sandbox isolation. Add regression tests for changed behavior, especially deletion, execution and patches. Tests own generated temporary repositories beneath artifacts/test-fixtures; the demo intentionally retains worktrees.

Review logs for secrets. Do not commit generated packages, test repositories or dependencies. Follow docs/publishing.md before release.

