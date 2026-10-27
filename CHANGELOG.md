# Changelog

## 0.1.2

Redesigned the sidebar with a branded Start here panel, New experiment and Find experiment actions, library counts and a quick guide. Earth rows now show readable check states with inline Open/Run actions. Editing and cleanup actions are available from context menus; project history stays grouped by repository.


## 0.1.1

Opening the ParallelEarth sidebar now reveals Home in installed builds, including a restored visible sidebar. Both sidebar views include an Open Home title action. The dashboard is not opened on unrelated editor startup when the sidebar is hidden.

## 0.1.0 — Unreleased

Initial local MVP: committed-baseline experiments, detached Earths, native Explorer, approved text patches/checks, historical comparisons, reports, persistence, recovery and conservative cleanup. Includes real booking demo. Marketplace and cross-platform validation pending; see docs/validation.md.


Creation now reveals Earth Explorer, confirms the generated path, and offers the next action. A status-bar entry and Show Earth Explorer command make the panel discoverable when the activity bar overflows.

Earths now use readable project/Earth directory prefixes; Open Earth uses a named workspace and Earth window title. Existing UUID worktrees remain supported in place. Colourful ParallelEarth branding added.

F5 now opens an explicit booking demo folder with separate development profile and no third-party extensions. Repository names are shown in the Explorer/picker; new experiments explicitly select a project. Existing normal-profile experiments are preserved.

Replaced demo startup with an explicit empty workspace. Added branded home with real project-history cards, separate active/history views, and confirmed experiment deletion with keep-files or clean-worktree modes. Incomplete creation attempts are excluded from normal history. No projects or experiments are seeded on startup.

History now uses six compact project rows per page, search and sorting. Updates preserve the current search/page. Deletion shows immediate progress, blocks duplicate clicks and reuses repository ownership checks to reduce repeated Git work. History-only removal skips Git cleanup.

Redesigned Home around the Pixel Portal identity with clearer experiment actions, live library totals, compact searchable project rows, a concise workflow guide, responsive layouts, light/high-contrast theme support and reduced-motion animation.
