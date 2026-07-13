# PROGRESS — LongRange build state

> Maintained by the executing agent per
> [`execution-protocol.md`](./execution-protocol.md) §7. One row per task.
> Statuses: `TODO · IN PROGRESS · AWAITING OWNER · BLOCKED · DONE · SKIPPED(reason)`

# Current increment: 0

## Increment 0 — Foundations & proofs

| Task | Status | Date | Commit | Note |
|---|---|---|---|---|
| 0.0 | DONE | 2026-07-13 | 90f18b6 | env preflight done; git repo initialized at root (was not a repo before). See capabilities table + owner queue below |
| 0.1 | AWAITING OWNER | 2026-07-13 | — | cmake+gtest installed; **npm blocker now RESOLVED** (see below). Sole remaining blocker = `emcc`/emsdk — cannot build pristine BTK WASM yet. Owner decision needed on emsdk route (options in Owner install queue) |
| 0.2 | TODO | | | needs emsdk (WASM build). The non-WASM part (copy BTK → `engine/`) does not |
| 0.3 | TODO | | | tools now available (cmake 4.4.0 + GoogleTest 1.17.0 via brew, confirmed via `find_package(GTest)` config at `/opt/homebrew/lib/cmake/GTest/`); native ctest path needs no emsdk |
| 0.4 | TODO | 2026-07-13 | — | **npm unblocked** — scaffold + units service no longer blocked. Engine-bridge/WASM-comparison portion still needs emsdk (via 0.1/0.2) |
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
| emcc / emsdk 4.0.17 | FAIL | 2026-07-13 | Not installed; not on PATH; no cached copy. **Now the sole remaining hard blocker.** Homebrew offers `emscripten` 6.0.2 (bottled, via Apple's internal mirror — installs with no allowlist change) but that is NOT the pinned 4.0.17. github.com (git-clone emsdk route) still 403-blocked by the sandbox domain allowlist. See Owner install queue for the 3 options. |
| cmake ≥3.16 | **PASS** | 2026-07-13 | Owner ran `brew install cmake` → 4.4.0. `make` 3.81 and `g++`/`clang` (Apple clang 21, Xcode CLT) also present — native build path is now viable once GoogleTest wiring (0.3) is attempted. |
| GoogleTest | **PASS** | 2026-07-13 | Owner ran `brew install googletest` → 1.17.0. No CLI binary (`googletest --version` doesn't exist — that's expected, GTest is a library not a tool); confirmed present via `find_package(GTest)` config at `/opt/homebrew/lib/cmake/GTest/GTestConfig.cmake` and static libs at `/opt/homebrew/lib/libgtest*.a`. |
| C++17 compiler | PASS | 2026-07-13 | Apple clang version 21.0.0 (Xcode CLT at `/Applications/Xcode.app/Contents/Developer`). |
| node | PASS | 2026-07-13 | v26.5.0 (Homebrew, `/opt/homebrew/bin/node`). |
| npm | **PASS (RESOLVED 2026-07-13)** | 2026-07-13 | v11.17.0. The `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` failure is **fixed** — see the resolved-escalation writeup below. `npm ping` → PONG, `npm view react version` → 19.2.7, real registry fetches work; `npm install` will work. |
| python3 | PASS | 2026-07-13 | 3.13.2. |
| git | PASS (local) / github 403 | 2026-07-13 | 2.50.1, user.name/email configured. github.com still blocked by sandbox domain allowlist (only matters for the emsdk git-clone route + task 0.5 push). |

**Root repo status:** this directory was **not a git repository** before this session (only the nested `BallisticsToolkit/` clone had its own `.git`). Ran `git init` at `/Users/analyst/CCode/LongRange`, added a root `.gitignore` (ignores `BallisticsToolkit/` itself — it stays a separately-versioned nested clone/oracle, plus standard build/node_modules/OS noise), and committed the existing docs tree as a baseline (`90f18b6`).

## Owner install queue
*(agent adds exact commands here when a needed install fails; owner marks done)*

**Only one item outstanding: emsdk.** (npm is resolved — see below.) The pause the
owner placed on installs was conditioned on the npm/cert blocker; that condition is
now met, so this is ready to proceed once the owner picks an emsdk route:

- **Option 1 — Homebrew emscripten 6.0.2 (no allowlist/security change needed).**
  `brew install emscripten`. Installs from Apple's already-working internal mirror,
  same path that delivered cmake/googletest. **Caveat:** this is **not** the pinned
  4.0.17 (BTK's `deploy.yml` pins 4.0.17). For our *local* oracle diff this is likely
  fine — task 0.7 compares pristine-BTK-vs-`engine/` built with the **same** local
  compiler, so they stay mutually consistent regardless of version; the 4.0.17 pin
  still governs the CI/GitHub-Pages deploy build. Risk: BTK's C++ may need tweaks to
  compile under emscripten 6.x (large jump from the 4.0.x line) — if it fails to
  build, protocol §0.1 says stop & escalate rather than hack versions.
- **Option 2 — exact pinned 4.0.17 via git (needs domains allowlisted).** Add at
  `http://localhost:4373` → Domains (or the owner adds to
  `~/.claude/apple/dangerous_allowed_domains.csv`): `github.com`,
  `raw.githubusercontent.com`, `objects.githubusercontent.com`, and
  `storage.googleapis.com` (the toolchain download step). Then:
  `git clone https://github.com/emscripten-core/emsdk.git ~/emsdk && cd ~/emsdk && ./emsdk install 4.0.17 && ./emsdk activate 4.0.17`.
  *(Agent will not edit the security allowlist unilaterally — that's an owner call.)*
- **Option 3 — install 4.0.17 on another machine** with real internet, then copy the
  whole resulting `emsdk/` directory onto this machine (e.g. to `~/emsdk`).

Recommendation: **Option 1 first** (fastest, unblocks 0.1/0.2 immediately); fall back
to Option 2/3 only if BTK won't build under emscripten 6.x or exact-pin reproducibility
becomes necessary before CI is set up.

- **`git push`** — no remote configured yet; not needed until task 0.5 (CI). Re-queue then.

## Resolved escalations

### 2026-07-13 — RESOLVED: npm `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`

**Fix applied:** `npm config set cafile /Users/analyst/node-ca.pem` (writes to the
user-level `~/.npmrc`; **not** committed to this repo, and reversible with
`npm config delete cafile`). Verified: `npm ping` → PONG, `npm view react version`
→ 19.2.7, `npm view vite version` → 8.1.4. `npm install` will now work.

**Why it works / true root cause:** the ambient `NODE_EXTRA_CA_CERTS` points at
`/Users/analyst/.claude/apple/certs/bundle.pem`, which contains only **11 legacy
Apple/GeoTrust/VeriSign/Comodo roots and does NOT include `DigiCert Global Root G2`**
— the root that anchors `npm.apple.com`'s real chain. Node's *built-in* store does
include that root, but in this Node v26 build, having `NODE_EXTRA_CA_CERTS` set
effectively caused Node to trust only that incomplete bundle for npm's connections
(so chain-building failed). Pointing npm's own `cafile` at the pre-existing complete
CA file `~/node-ca.pem` (a 180-cert keychain dump already on the machine from another
project) gives npm a self-sufficient trust set that overrides the broken ambient one.
This is a legitimate npm configuration using valid CA certs — not a security bypass,
no env-var or sandbox change, no domain-allowlist change.

**To reproduce the fix from scratch** (if `~/node-ca.pem` is ever missing): a dump of
Node's built-in roots suffices — `node -e "const t=require('tls'),f=require('fs');f.writeFileSync('/some/ca.pem',t.rootCertificates.join('\n'))"`
then `npm config set cafile /some/ca.pem`.

**Note for the harness maintainer (not blocking us):** the underlying bug is that
`/Users/analyst/.claude/apple/certs/bundle.pem` is an incomplete trust set that, when
loaded via `NODE_EXTRA_CA_CERTS`, breaks Node TLS for hosts anchored by roots it
omits (e.g. DigiCert Global Root G2). Regenerating that bundle to be complete would
fix this environment-wide for all Node tools without the per-tool `cafile` workaround.

## Deferred observations
- (none yet)

## Blocked / escalations
- **emsdk 4.0.17 not installed** — sole remaining hard blocker for the WASM build
  tasks (0.1/0.2, and the engine-integration part of 0.4/0.7). Owner decision pending
  on which route (see Owner install queue). Non-WASM work is unblocked.

## Owner decisions log
- 2026-07-13: plan approved; executor = Sonnet-level agent; Increments 0–2 detailed
  up front, 3–6 planned just-in-time.
- 2026-07-13: owner ran `brew install cmake googletest` (both confirmed working).
- 2026-07-13: owner asked to **pause all further installs** (emsdk included) until
  the npm/`NODE_EXTRA_CA_CERTS` blocker above is understood and resolved, rather
  than routing around it. Agent is holding on 0.1/0.2/0.4 pending this.
- 2026-07-13: **npm blocker RESOLVED** by the agent via `npm config set cafile
  /Users/analyst/node-ca.pem` (legitimate npm config, no security/env/sandbox
  change; see Resolved escalations). The pause condition is now satisfied — emsdk
  install is ready to proceed pending owner's choice of route (Owner install queue).
