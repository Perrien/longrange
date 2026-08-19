# Re-Zeroing At A New Distance Nudges The Sight Picture

Status: open
Filed: 2026-08-13

Confirming a zero shifts the erector offset by minus the required come-up, so re-zeroing at a distance
other than the rifle's current zero reference nudges the sight picture by the come-up between the two.
At the rifle's current zero distance — the normal sight-in-bay case — the shift is nil and the view is
still, which is why this was accepted rather than chased when turret-follows-view shipped. Closing it
means modelling the trajectory zero's own launch angle as a fourth offset term, which costs a solver call
per frame.
