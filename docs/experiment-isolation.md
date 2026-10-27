# Isolation

Detached Git worktrees isolate working files and indexes. They share repository objects, refs/configuration and local machine privileges.

No reset, checkout, stash or clean is applied to the original working tree. Experiments start from commits; uncommitted, untracked and ignored files are not copied. Files already committed to Git, including committed secrets, appear naturally in an Earth.

Worktree creation may invoke configured checkout filters. Hooks/fsmonitor/external diff/textconv are disabled where relevant, but this does not neutralize all Git configuration. Only trust repositories you have reviewed.

Dependencies must be installed manually per Earth. No node_modules sharing or automatic installation occurs. An approved process can read user files and shared Git metadata. Worktrees are not containers.

Cleanup requires an exact generated path, non-symlink ancestors, registration and matching common-directory. Changed/ignored/untracked files and commits different from source prevent deletion. No force option is exposed. Same-user concurrent filesystem races remain outside this isolation boundary.

