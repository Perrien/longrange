# `native-matrix.cpp` — proving an engine change is a no-op, without emsdk

## What it is

A native twin of the golden-vector harness. It walks the same 36-case matrix
(`loads.json` → 6 loads × 3 atmospheres × 2 wind cases) with the same solve
sequence as `solve-driver.mjs`, and prints every sampled row at full float
precision.

Compile it **twice against the same file** — once with pristine
`BallisticsToolkit/`, once with `GameBuild/engine/` — and diff. Identical output
means the change under test does not touch the validated path.

## Why bother, when `run.mjs` exists

`run.mjs` is the real check and stays the authority. But it runs the engine's
**WASM artifact**, so it can only tell you anything after an emsdk rebuild. When
a change lands somewhere the whole matrix flows through — `computeZero` is the
obvious case, since every row is sampled from a zeroed trajectory — you want the
answer *before* paying for that rebuild.

This is also a **stronger** statement than `run.mjs` makes. The harness passes
anything inside 1e-4 relative; this compares byte for byte. "Bit-identical" is a
claim worth being able to make, because the alternative is arguing about whether
a small diff is rounding or a regression.

## Running it

```sh
cd <repo root>
M=GameBuild/validation/native-matrix.cpp

g++ -std=c++17 -O2 -IBallisticsToolkit/include $M \
    BallisticsToolkit/src/ballistics/*.cpp BallisticsToolkit/src/physics/*.cpp \
    -o /tmp/mat_pristine

g++ -std=c++17 -O2 -IGameBuild/engine/include $M \
    GameBuild/engine/src/ballistics/*.cpp GameBuild/engine/src/physics/*.cpp \
    -o /tmp/mat_owned

/tmp/mat_pristine > /tmp/pristine.txt
/tmp/mat_owned    > /tmp/owned.txt
diff /tmp/pristine.txt /tmp/owned.txt && echo "BYTE-IDENTICAL"
```

Expect **636 rows** each, matching `vectors/golden.json`.

## What it does NOT do

- It does not replace `run.mjs`. This is native float; the shipped engine is
  WASM, and the two can differ. **Always run the real check after rebuilding.**
- It only covers what the matrix covers: a **100 m zero**, sampled to each load's
  `maxRangeM`. A change that only misbehaves at long zero ranges will pass here —
  correctly, since the golden vectors do not constrain that regime either. That
  is precisely the freedom the 2026-07-28 `computeZero` work relied on.
- It only compiles `ballistics/` + `physics/`. A change under `match/` or
  `rendering/` is out of scope.

## Keeping it honest

The solve sequence is transcribed from `solve-driver.mjs` by hand — the same
6-argument `computeZero` call (dt 0.001, 50 iterations, tolerance 1e-5), the same
`simulate(maxRange * 1.05, 0.001, 15.0)`, the same skip of unreachable ranges. The
load table is transcribed from `loads.json`. **If either moves, move this too**,
or it will quietly be answering a question you did not ask.
