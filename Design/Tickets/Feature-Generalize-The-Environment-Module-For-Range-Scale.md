# Generalize The Environment Module For Range Scale

Status: open
Filed: 2026-08-13

The shared `environment/` module is config-driven but shaped for short distances, while the ELR range is
hand-rolled on its own foundation and does not use the module at all. ELR's machinery is the more general
of the two, so its long-range pieces should be promoted into the shared module — not the short-range
model stretched outward — after which ELR folds in and future ranges become config files. This is the
prerequisite for the rest of ELR's dressing: the horizon, ground undulation and mud patches all wait on
it.
