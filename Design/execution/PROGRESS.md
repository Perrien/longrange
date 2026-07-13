# PROGRESS — LongRange build state

> Maintained by the executing agent per
> [`execution-protocol.md`](./execution-protocol.md) §7. One row per task.
> Statuses: `TODO · IN PROGRESS · AWAITING OWNER · BLOCKED · DONE · SKIPPED(reason)`

# Current increment: 0

## Increment 0 — Foundations & proofs

| Task | Status | Date | Commit | Note |
|---|---|---|---|---|
| 0.0 | DONE | 2026-07-13 | 90f18b6 | env preflight done; git repo initialized at root (was not a repo before). See capabilities table + owner queue below |
| 0.1 | AWAITING OWNER | 2026-07-13 | — | cmake now installed (owner ran `brew install cmake googletest`); still blocked on `emcc`/emsdk 4.0.17 — cannot build pristine BTK yet |
| 0.2 | TODO | | | blocked behind 0.1 (needs emsdk) |
| 0.3 | TODO | | | tools now available (cmake 4.4.0 + GoogleTest 1.17.0 via brew, confirmed via `find_package(GTest)` config at `/opt/homebrew/lib/cmake/GTest/`); not started — comes after 0.1/0.2 in task order |
| 0.4 | BLOCKED | 2026-07-13 | — | **root-cause investigation done, fix is not in the agent's control — see Blocked/escalations below.** `npm install` cannot work until the `NODE_EXTRA_CA_CERTS` cert bundle issue is resolved |
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
| emcc / emsdk 4.0.17 | FAIL | 2026-07-13 | Not installed; not on PATH; no cached copy found. **On hold** — owner wants the npm/cert blocker (below) resolved before installing anything else. |
| cmake ≥3.16 | **PASS** | 2026-07-13 | Owner ran `brew install cmake` → 4.4.0. `make` 3.81 and `g++`/`clang` (Apple clang 21, Xcode CLT) also present — native build path is now viable once GoogleTest wiring (0.3) is attempted. |
| GoogleTest | **PASS** | 2026-07-13 | Owner ran `brew install googletest` → 1.17.0. No CLI binary (`googletest --version` doesn't exist — that's expected, GTest is a library not a tool); confirmed present via `find_package(GTest)` config at `/opt/homebrew/lib/cmake/GTest/GTestConfig.cmake` and static libs at `/opt/homebrew/lib/libgtest*.a`. |
| C++17 compiler | PASS | 2026-07-13 | Apple clang version 21.0.0 (Xcode CLT at `/Applications/Xcode.app/Contents/Developer`). |
| node | PASS | 2026-07-13 | v26.5.0 (Homebrew, `/opt/homebrew/bin/node`). |
| npm | PASS (installed) / **BLOCKED** (see below) | 2026-07-13 | v11.17.0 present; cannot install packages — root cause identified, not a simple "no registry access" issue. |
| python3 | PASS | 2026-07-13 | 3.13.2. |
| git | PASS | 2026-07-13 | 2.50.1, user.name/email already configured globally. |

**Root repo status:** this directory was **not a git repository** before this session (only the nested `BallisticsToolkit/` clone had its own `.git`). Ran `git init` at `/Users/analyst/CCode/LongRange`, added a root `.gitignore` (ignores `BallisticsToolkit/` itself — it stays a separately-versioned nested clone/oracle, plus standard build/node_modules/OS noise), and committed the existing docs tree as a baseline (`90f18b6`).

## Owner install queue
*(agent adds exact commands here when a needed install fails; owner marks done)*

**On hold at owner's request (2026-07-13)** — see decisions log. Not currently
asking for anything further until the npm/cert blocker below is resolved. For
reference, once that's cleared, this is still outstanding:

- **emsdk 4.0.17** (tasks 0.1/0.2) — needs either:
  - domain allowlist at `http://localhost:4373` → Domains: `github.com`,
    `raw.githubusercontent.com`, `objects.githubusercontent.com` (clone) +
    `storage.googleapis.com` (the actual toolchain download `emsdk install` does,
    which is the big one — cloning the repo alone is NOT sufficient, see prior
    session note), **or**
  - installed on another machine with real internet access, then copy the whole
    resulting `emsdk/` directory onto this machine.
- **`git push`** — no remote configured yet on the root repo; not needed until
  task 0.5 (CI). Will re-queue then.

## Blocked / escalations

### 2026-07-13 — `npm install` cannot work: `NODE_EXTRA_CA_CERTS` breaks Node's TLS trust, not a missing/misconfigured registry

**Symptom:** `npm ping` / `npm install` fail with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`
against `npm.apple.com` (the configured registry, an internal Artifactory mirror).
This is **not** the general sandbox domain-allowlist issue that blocks
`registry.npmjs.org`/`github.com` — `npm.apple.com` itself is reachable (curl gets
a clean 200 through the same local proxy), and this same failure was reproduced in
a second, unrelated project (`/Users/analyst/CCode/SafeCracking/WebBuild/`) which
has a working `node_modules/` from **2026-07-10/11**, days before this session —
i.e. this is a newly-appeared, environment-wide regression, not something specific
to LongRange.

**Root cause, narrowed by direct experiment (not guessed):**
1. Captured the actual TLS handshake `npm.apple.com` sends (via a raw Node
   `net`+`tls` socket tunneled through the local sandbox proxy at
   `localhost:4373`). The server **does** send a complete, valid chain: leaf
   (`artifacts.apple.com`) → intermediate (`Apple Public Server RSA CA 1 - G1`) →
   root (`DigiCert Global Root G2`).
2. `openssl verify -purpose sslserver` against that captured chain (using either
   the system trust store or a dump of Node's own 120 built-in
   `tls.rootCertificates`) returns `OK`. `DigiCert Global Root G2` is one of
   Node's built-in trusted roots. The chain is cryptographically fine.
3. Opening the same TLS connection in Node with `ca: tls.rootCertificates`
   (Node's built-in roots ONLY, no extra file) → `authorized: true`. **Success.**
4. The exact same connection, in the exact same process, under the ambient
   `NODE_EXTRA_CA_CERTS=/Users/analyst/.claude/apple/certs/bundle.pem` env var
   that this whole environment runs under → `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`.
   **Failure.**

So: loading `/Users/analyst/.claude/apple/certs/bundle.pem` alongside Node's
built-in roots via `NODE_EXTRA_CA_CERTS` breaks certificate chain-building for a
connection that is otherwise completely valid. It is not a missing intermediate,
not an expired cert (checked validity windows — fine), not a wrong domain, and
not the sandbox's domain allowlist (that's a separate, already-documented issue
affecting `registry.npmjs.org`/`github.com`, not this).

**Attempted to confirm cleanly by re-running with the env var removed** — blocked:
a `PreToolUse` hook (`tool-call-monitor.sh`) explicitly refuses any command that
modifies environment variables ("Security Policy Violation: Command attempts to
modify environment variables, which is not allowed"). This is a hard policy stop,
not something to route around — logging it here rather than trying alternate
tricks to unset/override the var.

**Why this matters:** every task from 0.4 onward that touches `app/` needs
`npm install` to work at all (React/Three.js/Zustand/idb/Vite/vitest — none of
these are vendorable by hand per protocol §4b.5). This is currently the single
highest-priority blocker for the whole build, ahead of emsdk.

**What's needed to resolve (owner/harness-side, not agent-side):** either fix or
regenerate `/Users/analyst/.claude/apple/certs/bundle.pem` so it doesn't corrupt
Node's default trust anchors when merged, or find/fix whatever sets
`NODE_EXTRA_CA_CERTS` to point at it. This is inside the "Apple Claude Code
security sandbox" tooling, not this project's code — likely needs whoever
maintains that harness/dashboard (`http://localhost:4373`) or its cert-bundle
generation step.

## Deferred observations
- (none yet)

## Blocked / escalations
- (none yet)

## Owner decisions log
- 2026-07-13: plan approved; executor = Sonnet-level agent; Increments 0–2 detailed
  up front, 3–6 planned just-in-time.
- 2026-07-13: owner ran `brew install cmake googletest` (both confirmed working).
- 2026-07-13: owner asked to **pause all further installs** (emsdk included) until
  the npm/`NODE_EXTRA_CA_CERTS` blocker above is understood and resolved, rather
  than routing around it. Agent is holding on 0.1/0.2/0.4 pending this.
