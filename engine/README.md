# `engine/` — LongRange's owned copy of the BallisticsToolkit physics core

This directory is a **vendored, owned copy** of the C++ physics core from
[BallisticsToolkit](https://github.com/chasep255/BallisticsToolkit) (BTK), the
MIT-licensed engine LongRange is built on. It is where all LongRange engine work
happens (Bucket-A features, native test harness, etc.).

The pristine upstream clone at repo-root `BallisticsToolkit/` is **never modified** —
it serves as the golden-vector oracle (see `Design/build-plan.md` and
`Design/execution/execution-protocol.md` §4). Any divergence between this copy and
the oracle is what the validation harness (task 0.7) measures.

## What was copied, and from where

Copied on **2026-07-13** from `BallisticsToolkit/` at commit:

```
29d43c13f4945cb9caf4e73d2041c22645ebf4e7
(29d43c1, 2026-07-07 — "fclass: add Xbox/standard gamepad support (host and remote)")
```

This commit hash is the oracle version; it will be recorded in
`validation/ORACLE_VERSION` in task 0.7.

Copied verbatim:
- `src/` — all C++ sources (incl. `bindings.cpp`, the embind interface)
- `include/` — all headers
- `CMakeLists.txt` — build config (see modification below)
- `LICENSE` → `LICENSE.BTK` (BTK's MIT license, retained for attribution)

**Not** copied: BTK's `web/` UI directory (LongRange builds its own app), and BTK's
`.git`, docs, and scripts.

## Modifications to this copy

- **`CMakeLists.txt`:** removed the upstream `copy_web_files` custom target (task 0.2).
  It copied `web/` into the build dir; since we don't vendor `web/`, that `ALL` target
  would break every build. This is build plumbing on our own copy — not an oracle patch.

The C++ sources are unchanged from the upstream commit above.

## Building the WASM module

```
mkdir engine/build-wasm && cd engine/build-wasm
emcmake cmake ..
emmake make -j
```

Emits `engine/build-wasm/ballistics_toolkit_wasm.js` — a single ES6 module with the
WASM embedded (`SINGLE_FILE=1`). Built/verified under Emscripten **6.0.2**.
`build-wasm/` is git-ignored.
