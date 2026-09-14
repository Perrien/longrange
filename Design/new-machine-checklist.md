# New machine checklist

**Purpose:** verify a fresh machine can build, test and work on LongRange. Point an agent at this file
and it can run every check here without asking a question.

**The move is a folder copy, not a clone.** `~/CCode/LongRange` on the old machine becomes
`~/Developer/LongRange` on the new one, username changing too. Section 0 covers what that means.

**This file verifies. It does not install.** The install list is the owner's `new-machine-setup.md`,
which lives outside the repo (on the old machine at `~/CCode/NewUnit/new-machine-setup.md`). If a check
here fails, the fix is in that document. If the owner no longer has it, section 1 below still names
every tool and version, so it can be rebuilt from this file alone.

**Baseline date: 2026-09-13.** Every number in section 8 was measured on the old machine that day, on
macOS 26.6.2 / Xcode 26.6 / emcc 6.0.6-git / node v26.7.0 / npm 11.19.0 / cmake 4.4.0. Counts drift as
work continues. A *failing* check is the signal, not a count that has moved up.

**Run order matters.** Sections 0 to 3 gate everything else. Do not debug a Swift build before the
golden-vector check passes.

---

## 0. The move itself

**The project moves as a straight folder copy, not a clone.** `~/CCode/LongRange` on the old machine
becomes `~/Developer/LongRange` on the new one. That choice is deliberate and it is the right one here:
`Documentation/` (241 MB), `Wiki/`, `BallisticsToolkit/` and the five untracked design documents are all
git-ignored or uncommitted, so a clone would arrive missing most of the project. A copy brings
everything.

The cost is that it also brings 285 MB of build output with the old machine's absolute paths baked in.
Prune that, and the copy is strictly better than a clone.

**Copy to an APFS volume.** Not exFAT or FAT, which lose permissions and symlinks and will quietly
damage `.git` and `BallisticsToolkit/.git`.

### Take these, they exist nowhere else

- [ ] **The whole `~/CCode/LongRange` folder**, including `.git/`, `BallisticsToolkit/` with its own
  `.git`, `Documentation/`, `Wiki/`, `LocalOnly/`, and the untracked files in `Design/`. As of 2026-09-13
  those untracked files were `ADR-0002`, the exploration `Native-Swift-Port`, `Roadmap-Swift-Migration`,
  the approved plan `Swift-Physics-Port-1-Foundation-And-Harness` and `AGENTS.md`, plus a modified
  `Feature-Peer-To-Peer-Multiplayer`. That is the entire Swift migration design.
- [ ] **`~/.claude/skills/`.** Nine skills, five of which (`a-explore`, `a-create-plan`,
  `a-create-ticket`, `a-decision`, `a-glossary`) are what `CLAUDE.md` builds its whole workflow on, plus
  `a-roadmap`, `a-map`, `a-init-project` and `unslop`. They live in the user directory, not the repo.
  Nothing in them is machine-specific. This is the one part of `~/.claude` that must come across even
  though most of the rest must not.
- [ ] **`~/CCode/NewUnit/emcc-baseline/`** (the 6.0.2-built WASM artifact, sha256 `96ec0cd3…`) and
  `new-machine-setup.md` beside it. The baseline artifact only matters if the golden-vector check fails,
  and then it is the fastest way to tell a bad compiler from bad vectors. Both are small. Take them.

### Leave these behind

Either exclude them during the copy, or delete them on arrival before anything else runs. Both work.
Deleting on arrival is easier to verify, because you can see what you removed.

| Path | Size | Why |
|---|---|---|
| `GameBuild/app/node_modules/` | 268 MB | Installed through a corporate npm mirror. `npm ci` rebuilds it |
| `GameBuild/engine/build-native/` | 7.1 MB | `CMakeCache.txt` bakes 6 absolute paths to `/Users/analyst` |
| `GameBuild/engine/build-wasm/` | 1.8 MB | Same, plus the old Emscripten toolchain paths |
| `GameBuild/app/dist/` | 1.7 MB | Build output |
| `GameBuild/app/.build-artifact-stale-undeletable*` | 6.7 MB, 4 folders | Debris from the old machine's filesystem quirk. Nothing needs them |
| `node_modules/` at the repo root | 12 KB | A stray `.vite` cache |
| `.claude/settings.local.json` | small | ~100 permission entries, several of them corporate probes against `npm.apple.com`. Start with no file |
| every `.DS_Store` | small | noise |

Excluding during the copy:

```bash
rsync -av \
  --exclude 'node_modules/' --exclude 'build-native/' --exclude 'build-wasm/' \
  --exclude 'dist/' --exclude '.build-artifact-stale-undeletable*' \
  --exclude '.DS_Store' --exclude '.claude/' \
  ~/CCode/LongRange/ /Volumes/<disk>/LongRange/
```

Keep `.obsidian/`. It is the owner's vault config, git-ignored, and harmless.

**A pruned copy is roughly 390 MB, against 679 MB unpruned.** That is the quickest check that the
excludes worked.

---

## 1. Tools present and correct

| Check | Command | Expect |
|---|---|---|
| Homebrew | `brew --version` | any |
| Xcode selected (not just CLT) | `xcode-select -p` | a path inside `Xcode.app`, not `/Library/Developer/CommandLineTools` |
| Xcode | `xcodebuild -version` | 26.x or newer |
| Git identity | `git config --show-origin --get-regexp '^user\.'` | name and email set, and you can see which file each came from |
| GitHub auth | `gh auth status` | logged in to github.com with a token. See the note below |
| Node | `node --version` | v26.x. CI pins `node-version: '26'` in `.github/workflows/ci.yml` |
| npm | `npm --version` | any 11.x |
| CMake | `cmake --version` | 3.16 minimum per `GameBuild/engine/CMakeLists.txt`, 4.x fine |
| GoogleTest | `brew list googletest` | installed. The native test target needs it |
| Emscripten | `emcc --version` | a version listed as verified in `GameBuild/validation/ORACLE_VERSION` (6.0.6 or 6.0.9 as of 2026-09-14). See the warning below |
| Python | `python3 --version` | any 3.x. Both project scripts are pure stdlib, no venv needed for a build |
| jq | `which jq` | only needed by the status line, not by any build |

**GitHub push credentials do not travel with the copy, and a password will not work.** They live in
the macOS Keychain, not in any file. GitHub stopped accepting account passwords for git operations in
2021, but git still prompts for `Username` and `Password`, so the first push on a fresh machine looks
like an ordinary login and then fails telling you to use a token. Head it off with
`gh auth login` followed by `gh auth setup-git`, which stores a browser-issued token and points git at
it. Full walkthrough, including the manual token route and how to clear a stale keychain entry, is in
`new-machine-setup.md` §3.

**Identity is set per repository here.** LongRange's `.git/config` carries
`Ashley Perrien <perrien@me.com>`, which overrides whatever the global config says, and a folder copy
brings that override with it. So `git config --global user.name` can look wrong while commits are
perfectly correct. That is why the table asks for `--show-origin`.

**Emscripten is the one version that matters.** `GameBuild/validation/ORACLE_VERSION` is the authority,
not this table. The golden vectors were generated under 6.0.2 and verified bit-identical under 6.0.6
(2026-08-07) and 6.0.9 (2026-09-14). No other version has been measured, and the engine builds with
`-O3 -ffast-math`, which lets the compiler rewrite float arithmetic. If `emcc --version` reports a
version `ORACLE_VERSION` does not list as verified, do not assume it is fine. Run section 3 and read the
diff.

**Check `.emscripten` by hand after install.** On 6.0.2 and 6.0.6 Homebrew's postinstall failed
outright and `emcc` refused to run with `config file not found: …/libexec/.emscripten`. On 6.0.9 it
succeeded but wrote `/opt/homebrew/opt/emscripten/…` symlink paths. Either way, make the file read
as below, using the **versioned Cellar path**, never `/opt/homebrew/opt/emscripten/…`:

```
LLVM_ROOT = '/opt/homebrew/Cellar/emscripten/<version>/libexec/llvm/bin'
BINARYEN_ROOT = '/opt/homebrew/Cellar/emscripten/<version>/libexec/binaryen'
NODE_JS = '/opt/homebrew/bin/node'
```

The `opt` path is a symlink that follows whatever Homebrew has linked, so a future upgrade would
silently point this toolchain at a different LLVM.

---

## 2. The copy arrived intact

Run these from `~/Developer/LongRange`.

- [ ] **Build output is gone.** `ls GameBuild/app/node_modules GameBuild/engine/build-native
  GameBuild/engine/build-wasm GameBuild/app/dist 2>/dev/null` prints nothing. If any survived the move,
  delete it now. A copied `CMakeCache.txt` holds 6 paths pointing at `/Users/analyst/CCode/...`, and
  CMake will reuse them rather than reconfigure, producing failures that read as toolchain bugs.
- [ ] **`.claude/settings.local.json` is gone**, or has been emptied to `{}`.
- [ ] **Git survived the copy.** `git status --porcelain` shows the same handful of untracked design
  documents it showed on the old machine and nothing alarming, `git log --oneline -1` matches, and
  `git remote -v` still points at `https://github.com/Perrien/longrange.git`. Thousands of unexpected
  modifications mean the copy went through a filesystem that lost permissions or changed line endings,
  and the right move is to recopy onto APFS rather than to fix it up.
- [ ] **The design documents are all there.** `ls Design/Plans/` includes
  `Swift-Physics-Port-1-Foundation-And-Harness.md` and `Roadmap-Swift-Migration.md`; `ls
  Design/Decisions/` includes `0002-native-swift-replaces-web-pwa.md`; `ls Design/Explorations/` includes
  `Native-Swift-Port.md`. These were untracked at the time of the move, so they are the first thing a
  botched copy loses and the last thing git would tell you about.
- [ ] **`Documentation/` present and readable**, 241 MB, `ls Documentation/` lists the PDF folders. If it
  was made an iCloud symlink during the move, confirm the files are downloaded rather than evicted stubs.
- [ ] **`Wiki/` present**, `ls Wiki/Home.md` resolves.
- [ ] **`BallisticsToolkit/` is still the pristine oracle.** `git -C BallisticsToolkit rev-parse HEAD`
  returns `29d43c13f4945cb9caf4e73d2041c22645ebf4e7` and `git -C BallisticsToolkit status --porcelain` is
  empty. If its `.git` did not survive the copy, re-clone rather than patch:
  `git clone https://github.com/chasep255/BallisticsToolkit.git && git -C BallisticsToolkit checkout 29d43c1`.
  A dirty pristine tree means the oracle is no longer an oracle.
- [ ] **`LocalOnly/`** came across. It was empty on 2026-09-13, so an empty folder is the correct result.
- [ ] **Nothing tracked depends on the old path.** `git grep -n "/Users/" -- . ':!Design/Archived/'`
  returns one hit, a comment in `GameBuild/validation/ORACLE_VERSION`. The 8 hits in
  `Design/Archived/PROGRESS.md` are historical narrative and stay as they are. If this grep returns
  anything else, something new started depending on an absolute path and it needs fixing before the move
  is called done.

---

## 3. The engine stack works

This is the acceptance test for the whole machine. Run it from the repo root, in order.

```bash
# 3a. Native engine tests
cmake -S GameBuild/engine -B GameBuild/engine/build-native
cmake --build GameBuild/engine/build-native -j
ctest --test-dir GameBuild/engine/build-native --output-on-failure
```
- [ ] 30/30 pass.

```bash
# 3b. WASM build
emcmake cmake -S GameBuild/engine -B GameBuild/engine/build-wasm
emmake make -C GameBuild/engine/build-wasm -j
```
- [ ] `GameBuild/engine/build-wasm/ballistics_toolkit_wasm.js` exists. Nothing in the app runs without
  it; `scripts/check-engine.mjs` fails the dev, build and test scripts if it is missing.

```bash
# 3c. THE ONE THAT MATTERS
node GameBuild/validation/run.mjs
```
- [ ] Reports `36 cases checked; worst rel diff 0.000e+0` and `PASSED`.

**If 3c reports anything other than `0.000e+0`, stop and triage before touching anything else.** The
most likely cause is an Emscripten version other than 6.0.6. To separate a bad compiler from bad vectors,
point `run.mjs` at the carried-over `emcc-baseline/ballistics_toolkit_wasm.6.0.2.js`. If the baseline
artifact passes and the freshly built one does not, the compiler moved the numbers. That is an owner
decision, not an agent fix: either pin the old Emscripten via `emsdk`, or measure and re-record the new
one in `ORACLE_VERSION` the way the 6.0.6 bump was recorded.

```bash
# 3d. Engine vs pristine BTK (local only, never runs in CI)
node GameBuild/validation/match-check.mjs
```
- [ ] Passes. This is the check CI cannot run, because `BallisticsToolkit/` is git-ignored. It is the
  only proof that the owned engine copy still matches upstream.

---

## 4. The web app still builds

`GameBuild/app/` stays the live shipped product until the native shot loop reaches parity at V0.2 of
`Roadmap-Swift-Migration`. Until then these are real gates, and `Design/Execution-Protocol.md` §2 lists
them as gates 3 to 5 for every task.

```bash
cd GameBuild/app
npm ci
npx vitest run
npx tsc --noEmit
npm run build
```

- [ ] `npm ci` completes against the public registry. On the old machine this went through a corporate
  mirror. If it reaches for `npm.apple.com` or complains about a CA bundle, a corp config file came
  across; see section 7.
- [ ] vitest green. 1616 tests across 90 files on 2026-09-13.
- [ ] `tsc --noEmit` silent.
- [ ] `npm run build` writes `dist/`.

**If the build trips over undeletable files in `dist/`,** that was a quirk of the old machine's mounted
filesystem, and `.gitignore` carries a `.build-artifact-stale-undeletable*` rule for it. On a normal
local disk it should never recur, and section 0 already drops the four stale folders the old machine
accumulated.

---

## 5. Native Swift readiness

This is where the next real work happens. `Swift-Physics-Port-1-Foundation-And-Harness` is approved with
T1 not started, so `GameBuild/swift/` may not exist yet.

- [ ] `xcodebuild -version` runs and reports 26.x or newer.
- [ ] `xcodebuild -showsdks` lists both a macOS SDK and an iOS SDK. The project targets **iOS 17.0 /
  macOS 14.0** minimum, which is the `@Observable` floor the whole ladder depends on.
- [ ] `xcrun simctl list runtimes` shows at least one iOS runtime, for the iOS side of the multiplatform
  target.
- [ ] Xcode has been launched once and its additional components finished installing. A first-run
  component install will otherwise interrupt the first `xcodebuild` in a way that looks like a build
  failure.
- [ ] The owner's paid Apple Developer account is signed in under Xcode Settings, Accounts. **Not a
  blocker for V0.1.** The plan explicitly says to select no signing team and enable no capabilities, so
  the physics port builds and tests without it. It matters at distribution, and the placeholder bundle
  identifier `com.longrange.LongRange` is already ticketed to be replaced then.
- [ ] **If `GameBuild/swift/LongRange.xcodeproj` exists,** it builds and tests:
  ```bash
  xcodebuild -project GameBuild/swift/LongRange.xcodeproj -scheme LongRange -destination 'platform=macOS' test
  ```
  Expect exit 0, including `GoldenFixtureLoadTests.testLoadsCommittedGoldenVectors()` asserting 36 cases
  and 660 rows against `GameBuild/validation/vectors/golden.json`.
- [ ] **If it does not exist,** that is correct for a tree where T2 has not run. Nothing is missing.

---

## 6. Agent workflow scaffold

- [ ] `CLAUDE.md` is present at the repo root and readable. Note that on 2026-09-13 an untracked
  `AGENTS.md` sat beside it, near-identical except for the filename in its own structure diagram. If both
  arrive, they must be kept in step or one of them will start lying.
- [ ] **The five workflow skills resolve.** In a Claude Code session in the repo, `/a-create-ticket`,
  `/a-decision` and `/a-glossary` appear, and `/a-explore` and `/a-create-plan` are invocable. If they do
  not, `~/.claude/skills/` did not come across, and `CLAUDE.md`'s "how work flows" section describes a
  process the machine cannot run.
- [ ] `Design/Execution-Protocol.md` opens. It is one of exactly two documents an executing agent reads.
- [ ] The backlog is intact: `ls Design/Tickets/` is non-empty, and `Design/Plans/` contains
  `Swift-Physics-Port-1-Foundation-And-Harness.md` with `Status: APPROVED`.
- [ ] `Design/Archived/PROGRESS.md` exists but is **not** to be read. It is 643 KB of retired build log.
- [ ] **Claude Code sees the new path.** The session's project directory is now
  `~/Developer/LongRange`, so Claude Code keys its history under a slug like
  `-Users-<newuser>-Developer-LongRange`. The plan is to start clean here rather than carry memory
  across. If any old `~/.claude/projects/-Users-analyst-CCode-LongRange` content is brought over after
  all, rename it for **both** changes, the username and `CCode` to `Developer`, and rewrite the absolute
  paths inside the memory files. Memory is loaded as live context, so a path that no longer exists is
  worse than no memory at all.

**Standing owner rule, worth restating on a fresh machine:** never run a git command that writes history.
No commit, push, checkout, reset, rebase or merge. The owner does all of it. Read-only inspection is
fine.

---

## 7. Things that must NOT be present

The old machine was corporate-managed, and a folder copy is indiscriminate. Several of its settings will
break Claude Code or npm outright on a personal machine.

- [ ] **No `~/.npmrc`.** The old one set registry `npm.apple.com`, a `localhost:4373` proxy and a
  `cafile`. Start with none at all.
- [ ] **No `~/node-ca.pem`**, and no `NODE_EXTRA_CA_CERTS` in the environment.
- [ ] **No `~/.claude/apple/`** and no `apiKeyHelper`, `CLAUDE_CODE_SHELL_PREFIX`, or corp `hooks` entries
  in `~/.claude/settings.json`. Each one points at a script that does not exist on this machine, and the
  auth helper failing means no auth at all. Only `~/.claude/skills/` comes across from that directory.
- [ ] **No `NPM_CONFIG_REGISTRY`, `UV_INDEX_URL` or `UV_DEFAULT_INDEX`** in the environment or settings.
- [ ] **No stale `/Users/analyst` paths in config.** `grep -rn "/Users/analyst" ~/.claude/settings*.json
  .claude/settings.local.json 2>/dev/null` returns nothing. The repo's own `.claude/settings.local.json`
  is the likeliest survivor of a folder copy: roughly 100 allowlist entries, several of them corporate
  `npm.apple.com` probes and six `Read(//Users/analyst/**)` rules that grant nothing on this machine.
  Deleting it beats pruning it.
- [ ] Git-tracked files are **not** to be scrubbed of `/Users/analyst`. The occurrences in
  `Design/Archived/PROGRESS.md` are historical narrative and should stay as the record they are.

---

## 8. Known-good baseline, 2026-09-13

Measured on the old machine the day this checklist was written. Use these to judge whether the new
machine matches, not as targets to hit exactly.

| Check | Result |
|---|---|
| `ctest` native engine tests | 30 / 30 pass |
| `node GameBuild/validation/run.mjs` | 36 cases, worst rel diff `0.000e+0`, tolerance `1e-4` |
| `golden.json` contents | 36 cases, 660 rows. `README-native-matrix.md`'s figure of 636 is stale |
| `npx vitest run` | 1616 tests across 90 files, all pass |
| `npx tsc --noEmit` | clean |
| `npm run build` | green |
| BTK pristine HEAD | `29d43c13f4945cb9caf4e73d2041c22645ebf4e7`, clean, `oracle-patches: (none)` |
| emcc | `6.0.6-git` |
| node / npm | v26.7.0 / 11.19.0 |
| cmake | 4.4.0 |
| Xcode / macOS | 26.6 (build 17F113) / 26.6.2 |
| `Documentation/` | 241 MB |
| `Wiki/` | 196 KB, 12 articles |
| `BallisticsToolkit/` | 82 MB |

---

## 9. Triage, worst case first

| Symptom | Most likely cause |
|---|---|
| `run.mjs` reports a non-zero diff | Emscripten is not 6.0.6. Check that before suspecting anything else |
| `run.mjs` fails against the carried 6.0.2 baseline artifact too | The vectors or the harness are wrong, not the compiler. Escalate to the owner |
| `emcc: config file not found` | Homebrew's postinstall failed. Write `.emscripten` by hand, section 1 |
| `[engine] WASM artifact not found` | Section 3b has not been run on this machine |
| `npm ci` fails on certificates or an unreachable registry | A corp npm config came across in the copy. Section 7 |
| CMake configures against paths under `/Users/analyst` | A `build-*` directory survived the copy. Delete it and reconfigure |
| `git status` shows thousands of modified files | The copy went through a filesystem that lost permissions or rewrote line endings. Recopy onto APFS |
| A design document named in section 2 is missing | It was untracked at the time of the move, so `git` cannot restore it. Go back to the old machine |
| `git push` rejected right after you typed your GitHub password | Passwords have not worked since 2021. `gh auth login` then `gh auth setup-git`, or paste a token into the password prompt |
| `ctest` cannot find GoogleTest | `brew install googletest` |
| `/a-create-plan` is not a recognised command | `~/.claude/skills/` did not come across. Section 0 |
| A PDF in `Documentation/` reads as empty or errors | iCloud evicted it. Turn off Optimize Mac Storage for that folder |

---

## 10. What to report back

When every box above is ticked, hand the owner one short block:

```
Machine verified <date>.
  ctest           30/30
  golden vectors  36 cases, worst rel diff 0.000e+0
  match-check     pass
  vitest          <n> tests / <n> files
  tsc             clean
  app build       green
  xcodebuild      <version>, iOS <sdk> / macOS <sdk> SDKs present
  swift target    <built and tested | not yet scaffolded, T2 pending>
  emcc            <version>
Not verified: <anything skipped, and why>
```

State plainly what was skipped. A checklist reported as fully green when two boxes were guessed at is
worse than no checklist, because the next failure will be debugged against a false baseline.
