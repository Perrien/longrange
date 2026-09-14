# Native Swift replaces the web/PWA build

Status: accepted

The `Native-Swift-Port` exploration (closed 2026-09-08) reverses the 2026-07-10 web/PWA decision
recorded in `Design/btk-assessment-and-path-forward.md` §4 (`Status: DECIDED — web/PWA on BTK`). The
constraint that forced Option A back then — no paid Apple Developer account, so sideloaded iOS/iPadOS
apps expire on a 7-day provisioning profile — no longer holds: the owner has committed to the $99/yr
account, covering both Mac and iOS. With that removed, native returns to parity with web on
deployment, and two things web cannot provide become decisive: iPhone accelerometer/motion aiming
(CoreMotion tilt-and-shift, a native-exclusive input method), and a language/stack the owner is more
comfortable maintaining than the current TypeScript/React/Three.js codebase.

This is a full replacement, not a parallel track. `GameBuild/app/`'s ~232 TypeScript files, the
web/PWA deployment to GitHub Pages, and the free-web-distribution/no-account reach are all retired
once the native core dial-or-hold shot loop reaches parity with today's shipped build (see
`Design/Plans/Roadmap-Swift-Migration.md`, V0.2) — maintaining two front ends against one physics core
is not sustainable work for a solo owner, and it would undercut the point of moving to a stack the
owner finds easier to maintain. The C++/WASM engine (`GameBuild/engine/`) and pristine
`BallisticsToolkit/` are not ported away or deleted: they become the golden-vector validation oracle
the Swift port is checked against, the same role they already played for the web build.
