# PROGRESS — LongRange build state

> Maintained by the executing agent per
> [`execution-protocol.md`](./execution-protocol.md) §7. One row per task.
> Statuses: `TODO · IN PROGRESS · AWAITING OWNER · BLOCKED · DONE · SKIPPED(reason)`

# Current increment: 0

## Increment 0 — Foundations & proofs

| Task | Status | Date | Commit | Note |
|---|---|---|---|---|
| 0.0 | DONE | 2026-07-13 | 9263b65 | env preflight done; git repo initialized at root (was not a repo before). See capabilities table + owner queue below |
| 0.1 | DONE | 2026-07-13 | 7d779b5 | pristine BTK WASM built under emscripten 6.0.2 (no build-only patches needed). Verified module COMPUTES via Node: `Conversions.yardsToMeters(100)`=91.44, `moaToMrad(1)`=0.290888, `fpsToMps(2700)`=823.0. Browser ballistic-calc check is OWNER-SIDE (agent can't bind a localhost server — see capabilities table); **owner confirmed ballistic-calc runs correctly in-browser on the 6.0.2 build (2026-07-13)**. Node function-call proof satisfies "Done when". Values are float32-precision. |
| 0.2 | DONE | 2026-07-13 | 04e267f | `GameBuild/engine/` created as owned copy of BTK core (src/, include/, CMakeLists.txt, LICENSE.BTK, README.md) from BTK commit `29d43c1` (`29d43c13f4945cb9caf4e73d2041c22645ebf4e7`, 2026-07-07) — the oracle version for task 0.7. Removed `copy_web_files` target per task; `web/` not copied. `emmake make -j` builds clean under emscripten 6.0.2 → `GameBuild/engine/build-wasm/ballistics_toolkit_wasm.js` (244417 B, loads+computes in Node). `BallisticsToolkit/` untouched (clean). `build-wasm/` git-ignored. |
| 0.3 | DONE | 2026-07-13 | 052193c | Native (non-emscripten) CMake path added to `GameBuild/engine/CMakeLists.txt`: `if(EMSCRIPTEN)` keeps the WASM build byte-identical (244417 B, verified), `else()` builds `ballistics_core` static lib (all sources minus `bindings.cpp`) + GoogleTest suite. Native build uses plain `cmake`→Apple clang (independent of emscripten even though emcc is on PATH); `-Werror` dropped natively (newer host clang; we don't edit copied sources). 5 ctests green: 3× Conversions round-trips, ISA atmosphere spot values, 6.5CM computeZero@100m. Rendering sources compile natively (embind guarded by `#ifdef __EMSCRIPTEN__`). `build-native/` git-ignored; BTK untouched. |
| 0.4 | TODO | | | ready — npm unblocked; no further installs needed |
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
| general internet (registry.npmjs.org, github.com) | FAIL (not blocking) | 2026-07-13 | Public `registry.npmjs.org` / `github.com` still return HTTP 403 from the local sandbox proxy ("Apple Claude Code security sandbox", `HTTPS_PROXY=http://localhost:4373`) — not a DNS/network-down failure, just not on the allowlist. **Not currently blocking anything:** npm installs go through the internal mirror (`npm.apple.com`, works — see npm row), and the owner pushes to GitHub owner-side. |
| npm registry (npm.apple.com, configured default) | **PASS (resolved 2026-07-13)** | 2026-07-13 | Initial `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` failure is **fixed** via `npm config set cafile` — full writeup in Resolved escalations. (Same subject as the `npm` row below.) |
| git remote (push/fetch) | PASS (owner-side) | 2026-07-13 | Owner created the GitHub repo and pushed `main` (CLAUDE.md, .gitignore, Design/) successfully on 2026-07-13. Pushing is done **owner-side** — github.com is 403-blocked from the agent sandbox, so the agent cannot `git push` directly. |
| emcc / emsdk | **PASS (emscripten 6.0.2)** | 2026-07-13 | Installed via `brew install emscripten` per owner decision (6.0.2 replaces the 4.0.17 pin — see decisions log). Homebrew's postinstall failed to write the toolchain config, so the agent fixed `/opt/homebrew/Cellar/emscripten/6.0.2/libexec/.emscripten`: set `LLVM_ROOT=/opt/homebrew/opt/emscripten/libexec/llvm/bin`, `BINARYEN_ROOT=/opt/homebrew/opt/emscripten/libexec/binaryen` (were `/usr/bin`,`/usr/local`). Smoke test: `emcc t.cpp -o t.js` + `node t.js` → `wasm ok: 42`. `emcc`/`emcmake`/`emmake` all on PATH. |
| cmake ≥3.16 | **PASS** | 2026-07-13 | Owner ran `brew install cmake` → 4.4.0. `make` 3.81 and `g++`/`clang` (Apple clang 21, Xcode CLT) also present — native build path is now viable once GoogleTest wiring (0.3) is attempted. |
| GoogleTest | **PASS** | 2026-07-13 | Owner ran `brew install googletest` → 1.17.0. No CLI binary (`googletest --version` doesn't exist — that's expected, GTest is a library not a tool); confirmed present via `find_package(GTest)` config at `/opt/homebrew/lib/cmake/GTest/GTestConfig.cmake` and static libs at `/opt/homebrew/lib/libgtest*.a`. |
| C++17 compiler | PASS | 2026-07-13 | Apple clang version 21.0.0 (Xcode CLT at `/Applications/Xcode.app/Contents/Developer`). |
| node | PASS | 2026-07-13 | v26.5.0 (Homebrew, `/opt/homebrew/bin/node`). |
| npm | **PASS (RESOLVED 2026-07-13)** | 2026-07-13 | v11.17.0. The `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` failure is **fixed** — see the resolved-escalation writeup below. `npm ping` → PONG, `npm view react version` → 19.2.7, real registry fetches work; `npm install` will work. |
| python3 | PASS | 2026-07-13 | 3.13.2. |
| listening sockets (localhost servers) | **FAIL (agent sandbox)** | 2026-07-13 | The agent process **cannot bind a listening TCP socket** — `socket.bind()` on both `127.0.0.1:8001` and `0.0.0.0:8001` returns `PermissionError [Errno 1] Operation not permitted` (sandbox seatbelt, not port-in-use). ⇒ **any verification that requires serving the app to a browser is OWNER-SIDE** (owner runs the server in a normal Terminal, not via the `!` prefix which shares this sandbox). Affects task 0.1's browser check (already satisfied via Node instead), and will affect 0.6 (PWA offline reload) and 0.9 (touch-aiming). Command for the owner: `python3 -m http.server 8001 --directory <path>` then open in browser. |
| git | PASS (local) / github 403 | 2026-07-13 | 2.50.1, user.name/email configured. github.com still blocked by sandbox domain allowlist (only matters for the emsdk git-clone route + task 0.5 push). |

**Root repo status:** this directory was **not a git repository** before 2026-07-13
(only the nested `BallisticsToolkit/` clone had its own `.git`). Ran `git init` at
`/Users/analyst/CCode/LongRange`, added a root `.gitignore`, and committed a baseline
(`9263b65`). Repo now tracks **only `CLAUDE.md` + `Design/`**; `BallisticsToolkit/`,
`Documentation/`, and `Wiki/` are git-ignored and were scrubbed from history (they
were briefly in the initial baseline before the scrub — see decisions log). Owner has
pushed `main` to GitHub.

## Owner install queue
*(agent adds exact commands here when a needed install fails; owner marks done)*

**All installs complete.** cmake 4.4.0, GoogleTest 1.17.0, emscripten 6.0.2, npm
(via cafile fix) — nothing outstanding.

- **`git push`** — DONE owner-side (remote configured, `main` pushed 2026-07-13).
  Future pushes remain owner-side (github.com blocked from the agent sandbox); CI
  (task 0.5) runs on GitHub's own infra, so its workflow file is written locally and
  the owner pushes it.

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
- (none — all Increment 0 tooling in place as of 2026-07-13)

## Owner decisions log
- 2026-07-13: plan approved; executor = Sonnet-level agent; Increments 0–2 detailed
  up front, 3–6 planned just-in-time.
- 2026-07-15: **Emscripten 6.0.2 (internal brew mirror) replaces the 4.0.17 pin**
  (GitHub domain-blocked locally; owner prefers current versions). One version
  everywhere: local builds, root `ci.yml`, golden-vector generation. Protocol §4.1
  amended: minimal **build-only** patches to `BallisticsToolkit/` are allowed
  (`oracle-patch:` commits, recorded in `GameBuild/validation/ORACLE_VERSION`); numerical
  code paths and optimization flags remain untouchable; re-run McCoy/Litz
  cross-checks after any oracle patch.
- 2026-07-13: owner ran `brew install cmake googletest` (both confirmed working).
- 2026-07-13: owner asked to **pause all further installs** (emsdk included) until
  the npm/`NODE_EXTRA_CA_CERTS` blocker above is understood and resolved, rather
  than routing around it. Agent is holding on 0.1/0.2/0.4 pending this.
- 2026-07-13: **npm blocker RESOLVED** by the agent via `npm config set cafile
  /Users/analyst/node-ca.pem` (legitimate npm config, no security/env/sandbox
  change; see Resolved escalations). The pause condition is now satisfied — emsdk
  install is ready to proceed pending owner's choice of route (Owner install queue).
- 2026-07-13: **Repo scope decided (owner).** The git repo tracks only `CLAUDE.md`
  and `Design/`. `BallisticsToolkit/`, `Documentation/` (copyrighted source PDFs),
  and `Wiki/` are **git-ignored, local-only, never pushed** — history was scrubbed
  (filter-branch) so they never appear in any commit. Files remain on disk. Owner
  pushes to GitHub manually (github.com is blocked from the agent sandbox). Pre-scrub
  state recoverable locally under `.git/refs/original/` until owner drops it.
- 2026-07-13: **Owner rule — stop after every task.** The agent must NOT auto-advance
  between tasks. Finish a task, verify, log/commit, then stop and confirm with the
  owner before starting the next (every boundary 0.0→…→0.10 and beyond). Encoded in
  `execution-protocol.md` §2.7 / §3.
- 2026-07-13: initial push to GitHub done by owner (CLAUDE.md, .gitignore, Design/).
- 2026-07-13: **Layout decided (owner) — `GameBuild/` umbrella.** All buildable code
  lives under `GameBuild/`: `GameBuild/engine/`, `GameBuild/app/`, `GameBuild/validation/`
  (keeps repo root clean). `.github/` must stay at repo root (GitHub Actions requirement).
  `engine/` was `git mv`'d to `GameBuild/engine/` and rebuilt (verified). All path refs
  in build-plan / feature-catalog / execution docs / CLAUDE.md updated `engine|app|validation/`
  → `GameBuild/…`. Supersedes the flat root layout in build-plan §5.
