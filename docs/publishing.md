# Publishing checklist

Status: local development build. Marketplace publication has not been authorized or performed.

- [x] Manifest, commands/views, Trust declaration, icon and documentation.
- [x] Package allowlist excludes test repos, output logs, dependencies and source.
- [ ] Generate/review/commit package-lock.json with registry access.
- [ ] Verify dependency compatibility and official minimum VS Code 1.100 typings.
- [ ] Run npm ci, semantic typecheck, tests, npm audit and official vsce package.
- [ ] Run extension-host tests and a clean-profile VSIX installation.
- [ ] Exercise create/edit/patch/approve/run/cancel/compare/export/restart/cleanup in VS Code.
- [ ] Validate Linux/macOS, high contrast, screen reader and keyboard flows.
- [ ] Confirm Marketplace name/publisher ownership; shubhammaji1 is a candidate only.
- [ ] Create actual public repository and add verified repository/issues links.
- [ ] Capture screenshots only from the running product.
- [ ] Configure credentials and obtain explicit publication authorization.

npm run package produces an offline VSIX. It does not imply official Marketplace validation. With development tooling available, also run:

    npx vsce package --no-dependencies --out artifacts/parallel-earth-0.1.0.vsix

Use Install from VSIX in a clean profile, then review the workflow. Publication is a separate authenticated action requiring explicit user authorization. Never embed a PAT.

Official references:
https://code.visualstudio.com/api/working-with-extensions/publishing-extension
https://code.visualstudio.com/api/extension-guides/workspace-trust
https://git-scm.com/docs/git-worktree

