# The plate material's metalness and roughness are global, not per-range

Status: accepted

`createPlateMaterial` (`plate-surface.ts`) is a single factory shared by all four range scenes —
`RangeScene` (Range A), `TestRangeScene`, `WoodedZeroScene` and `ELRRangeScene` — and it ships one
patched shader program keyed `plate-surface-v1`. The ELR dressing exploration decided the material's
`metalness: 0.3` was physically wrong (a painted plate is a dielectric, and with no environment map
anywhere in the app the 30 % routed into a specular lobe reflects nothing and is simply lost), while
separately recording a non-goal that Range A stays as is.

**We change it globally rather than parameterising per range.** The defect is physical, so it is a
defect on every range; parameterising would add an argument to a shared factory for the sole purpose
of keeping a value alive that nobody wants, on three ranges, for someone to re-discover and re-fix
later.

**Consequence:** plates on Range A, the Test Range and the Wooded Zero visibly brighten. That
overrides the exploration's *"Range A is untouched"* non-goal, which was scoped to feature work rather
than to shared-code correctness. Recorded here so a future reader finds the reason instead of
"fixing" it back.
