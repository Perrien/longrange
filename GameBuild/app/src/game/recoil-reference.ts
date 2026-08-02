// rifle-ammo-store S9 — shared rifle-weight reference table for recoil display.
// Rifle weights (lb) sourced from `feature-catalog.md` §B's hand-built recoil
// table ("Cartridge-scaled recoil (and self-spotting)") — the same 7-cartridge
// table `ballistic-derivation.test.ts`'s §3.5 verification rows already used as
// inline literals (now imported from here instead, so there's one copy).
//
// **Real, logged gap (flagged since S2, not silently worked around):** only 7 of
// the 10 cartridges this plan ships have a sourced rifle weight — 6mm Creedmoor,
// 6.5 PRC and .300 PRC were added by this plan's own cartridge ladder and have no
// weight anywhere in `feature-catalog.md` (its recoil table only ever covered the
// original 7-cartridge ladder). Inventing a number for those three isn't
// warranted by any source, so the Store's recoil readout (S9) and the calibrated
// `recoilPitchVelocity` ScopeView will read (S10) both render "not yet sourced"
// for them rather than a fabricated figure. Registered again at S11 (`Wiki/_gaps.md`).
export const RIFLE_WEIGHT_LB: Partial<Record<string, number>> = {
  '22lr': 13.5,
  '223': 15.0,
  '65cm': 21.0,
  '308': 16.0,
  '300wm': 18.0,
  '338lm': 22.0,
  '50bmg': 32.0,
};

/** The recoil calibration point (D13/S10): 6.5 CM / 140 gr match holds today's
 *  ScopeView constant. Store's relative-kick readout (S9) uses the same
 *  reference build so the two stay consistent once S10 lands. */
export const RECOIL_REFERENCE_CARTRIDGE_ID = '65cm';
export const RECOIL_REFERENCE_PRESET_ID = '65cm-match';
