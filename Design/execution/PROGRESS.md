# PROGRESS — LongRange build state

> Maintained by the executing agent per
> [`execution-protocol.md`](./execution-protocol.md) §7. One row per task.
> Statuses: `TODO · IN PROGRESS · AWAITING OWNER · BLOCKED · DONE · SKIPPED(reason)`

# Current increment: 0

## Increment 0 — Foundations & proofs

| Task | Status | Date | Commit | Note |
|---|---|---|---|---|
| 0.0 | DONE | 2026-07-13 | 90f18b6 | env preflight done; git repo initialized at root (was not a repo before). See capabilities table + owner queue below |
| 0.1 | AWAITING OWNER | 2026-07-13 | — | blocked: no `emcc` on this machine; cannot build pristine BTK. Queued below |
| 0.2 | TODO | | | blocked behind 0.1 (needs emsdk) |
| 0.3 | TODO | | | blocked (needs cmake, GoogleTest) |
| 0.4 | TODO | | | blocked (needs npm registry access) |
| 0.5 | TODO | | | |
| 0.6 | TODO | | | |
| 0.7 | TODO | | | |
| 0.8 | TODO | | | |
| 0.9 | TODO | | | |
| 0.10 | TODO | | | |

## Increment 1 — First shippable slice
*(rows added when Increment 0 exits)*

## Environment capabilities (filled by task 0.0)
| Capability | Status | Checked | Note |
|---|---|---|---|
| general internet (registry.npmjs.org, github.com) | FAIL | 2026-07-13 | `curl -sI https://registry.npmjs.org` and `git ls-remote` to github.com both return HTTP 403 from a local sandbox proxy ("Apple Claude Code security sandbox", `HTTPS_PROXY=http://localhost:4373`), not a DNS/network-down failure — these domains are simply not on the sandbox's allowlist yet. |
| npm registry (npm.apple.com, configured default) | FAIL | 2026-07-13 | `npm ping` → `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. `curl` to the same host succeeds (200) using the system trust store, but Node's own TLS stack gets `EPERM` on a direct `https.get` — looks like the sandbox permits `curl` but not raw Node socket/TLS access to this host yet. `NODE_EXTRA_CA_CERTS` is set (`/Users/analyst/.claude/apple/certs/bundle.pem`, exists) but doesn't fix it, consistent with a permission block rather than a cert-trust problem. |
| git remote (push/fetch) | FAIL (untested push) | 2026-07-13 | Only tested via `BallisticsToolkit/` clone: `git ls-remote origin` → 403 (same sandbox proxy). Root repo has no remote configured yet (it was not a git repo at all until this session — now `git init` done, see task 0.0 note). |
| emcc / emsdk 4.0.17 | FAIL | 2026-07-13 | Not installed; not on PATH; no cached copy found. |
| cmake ≥3.16 | FAIL | 2026-07-13 | Not installed anywhere (`which`, `xcrun --find`, `mdfind`, pip all negative). `make` 3.81 (`/usr/bin/make`) and `g++`/`clang` (Apple clang 21) via Xcode CLT ARE present, so a native build is possible once cmake exists. |
| C++17 compiler | PASS | 2026-07-13 | Apple clang version 21.0.0 (Xcode CLT at `/Applications/Xcode.app/Contents/Developer`). |
| node | PASS | 2026-07-13 | v26.5.0 (Homebrew, `/opt/homebrew/bin/node`). |
| npm | PASS (installed) / FAIL (registry) | 2026-07-13 | v11.17.0 present; cannot actually install packages — see npm registry row. |
| python3 | PASS | 2026-07-13 | 3.13.2. |
| git | PASS | 2026-07-13 | 2.50.1, user.name/email already configured globally. |

**Root repo status:** this directory was **not a git repository** before this session (only the nested `BallisticsToolkit/` clone had its own `.git`). Ran `git init` at `/Users/analyst/CCode/LongRange`, added a root `.gitignore` (ignores `BallisticsToolkit/` itself — it stays a separately-versioned nested clone/oracle, plus standard build/node_modules/OS noise), and committed the existing docs tree as a baseline (`90f18b6`).

## Owner install queue
*(agent adds exact commands here when a needed install fails; owner marks done)*

Everything below is blocked by the **same root cause**: this environment's outbound network goes through a local sandbox proxy (`HTTPS_PROXY=http://localhost:4373`, "Apple Claude Code security sandbox") that only allows pre-approved domains, and none of the domains this build needs are approved yet. There are two ways to unblock — pick whichever is easier on your side:

**Option A — allowlist the domains** (fastest if you're comfortable with it): open `http://localhost:4373` → Domains → Add Domain, and add:
- `registry.npmjs.org` (npm package installs for `app/`)
- `github.com`, `raw.githubusercontent.com`, `objects.githubusercontent.com` (git push/fetch, emsdk installer)
- `storage.googleapis.com` (emsdk downloads Emscripten releases from here)
Once added, tell me and I'll re-run the preflight checks and continue automatically.

**Option B — install manually, no domain changes needed:**
1. `brew install cmake` — needed for tasks 0.2/0.3 (engine build). (Note: `brew install` itself also fetches over the network — if it fails too, that confirms Option A is required, since Homebrew's bottle CDN is a different set of domains.)
2. emsdk 4.0.17, pinned per `BallisticsToolkit/.github/workflows/deploy.yml`:
   ```
   git clone https://github.com/emscripten-core/emsdk.git
   cd emsdk && ./emsdk install 4.0.17 && ./emsdk activate 4.0.17
   ```
3. GoogleTest for the native `ctest` suite (task 0.3) — either `brew install googletest` or drop a pinned source tarball at `engine/third_party/googletest/` (I'll wire `add_subdirectory` either way once one of these exists).
4. npm packages for `app/` (task 0.4) — once I've written `app/package.json` with exact pinned versions, run `npm install` inside `app/`.
5. `git push` access for this repo once a remote is added (not needed yet — no remote configured; will queue this again when it matters, e.g. task 0.5's CI).

I'll keep working on anything in Increment 0 that doesn't require these (documentation, task prep, non-network-dependent scaffolding) and pick tasks 0.1–0.4 back up the moment any of the above is done.

## Deferred observations
- (none yet)

## Blocked / escalations
- (none yet)

## Owner decisions log
- 2026-07-13: plan approved; executor = Sonnet-level agent; Increments 0–2 detailed
  up front, 3–6 planned just-in-time.
