# Security model

Protect original files, unrelated paths, credentials and truthful evidence. Inputs include Git configuration, repositories, patches, stored JSON, filenames, settings and process output.

| Threat | Control | Remaining limit |
| --- | --- | --- |
| Unapproved scripts | Workspace Trust, explicit modal, core approval flags | API callers must supply truthful approval |
| Shell injection | Argument arrays and constrained npm identifier | Approved scripts are arbitrary code |
| Path/cleanup escape | Generated path, registration/common-dir, no symlinks, no force | Same-user races are possible |
| Malicious patch | Size cap, validated paths, check-before-apply, preview/approval | Executable code may be changed |
| Git config | Hooks/fsmonitor/external diff/textconv disabled | Checkout filters require repository trust |
| Corrupt state | Runtime validation; fail closed | Not a multi-user authorization system |
| Resources | Timeout, concurrency/log/run retention limits | Scripts can allocate outside extension control |
| Secrets | Reduced environment, no upload or implicit ignored-file copy | Home directory/network remain accessible |
| XSS/messages | Home uses HTML escaping, local resources, nonce CSP and action/UUID allowlist | Review exported Markdown and logs |
| Inaccurate verification | Explicit historical statuses; no missing-evidence success | Exit zero does not prove assertions existed |

Cancellation uses POSIX process groups or Windows taskkill /t /f with direct termination fallback. Restricted OS policies may prevent killing descendants; detached descendants can outlive their parent. A timeout/error is not proof every descendant died. Job objects/container execution are future hardening.

No telemetry, AI, network listener or automatic source upload is present. Approved checks may use the network. Reports may contain secrets. See validation.md for actual tests and platform limits. This document is a local engineering assessment, not an independent security audit.


Experiment deletion requires a modal confirmation. History-only removal retains every worktree. Filesystem cleanup preflights all Earths and rechecks ownership/clean state before each Git removal, recording progress per Earth. No force removal is used. Home contains no remote resources or arbitrary-command message handler.
