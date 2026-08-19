# Flaky Timeout In Base-Layer Compositing Test

Status: untriaged
Filed: 2026-08-19

`plate-surface.test.ts`'s `writeEngineLayer is byte-identical to writeLayer` case (task T4's
base-layer-compositing suite) intermittently fails with a 5000ms timeout under `npx vitest run`'s default
parallel file execution, on a file untouched by the change in flight at the time. It passes reliably in
isolation and with `--no-file-parallelism`, so this reads as worker-pool contention rather than a real
defect in the code under test — but it should be looked at rather than assumed benign.
