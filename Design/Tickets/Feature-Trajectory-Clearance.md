# Trajectory Clearance — Line Of Sight Is Not The Bullet's Path

Status: open
Filed: 2026-08-13

Model the bullet's arc against overhead obstructions: a 2000 m shot passes about 32 m above the sight
line as it crosses the 1200 m mark, so a slot you can see through is not necessarily one the round
clears. Worth building because the difficulty ladder becomes physics rather than authored content, and
flatter cartridges gain a reason to exist beyond wind. Needs trajectory-vs-canopy collision — nothing in
the app does path-obstacle collision today — and feedback for a strike the player cannot see, so
`Feature-Spotter-Cam` has to come first.
