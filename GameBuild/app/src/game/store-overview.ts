// Store cartridge-list overview text (rifle-ammo-store S12) — a qualitative
// weight/velocity comparison for each cartridge against the AVERAGE OF THE
// OTHER CARTRIDGES IN THE STORE LIST, not any absolute or real-world
// standard. That's a deliberately small, heterogeneous list (rimfire through
// .50 BMG), so its mean is skewed by the ELR end. This is the tradeoff of
// "compared to the rest of what you can buy in this store" rather than an
// invented absolute scale, and it stays correct automatically as more
// cartridges are added to the catalog.
//
// Computed from each cartridge's DEFAULT build (`defaultRifleSpec`/
// `defaultLoadSpec` — the same starting point BuildScreen opens a fresh
// cartridge on) run through `believedLoadForBuild`, the same sync/pure path
// `game/recoil.ts` uses — no WASM module needed, so this text renders
// immediately in the Store list without waiting on the engine to load.
import { believedLoadForBuild } from './catalog';
import { CARTRIDGE_IDS_V2, defaultLoadSpec, defaultRifleSpec } from './spec';

interface BuildStats {
  massKg: number;
  muzzleVelocityMps: number;
}

function defaultBuildStats(cartridgeId: string): BuildStats {
  const load = believedLoadForBuild(defaultRifleSpec(cartridgeId), defaultLoadSpec(cartridgeId));
  return { massKg: load.massKg, muzzleVelocityMps: load.muzzleVelocityMps };
}

// Computed once at module load — CARTRIDGE_IDS_V2 is fixed catalog data, not
// player state, so the list average never changes within a running session.
const STATS_BY_ID: Record<string, BuildStats> = Object.fromEntries(
  CARTRIDGE_IDS_V2.map((id) => [id, defaultBuildStats(id)]),
);

const LIST_AVERAGE: BuildStats = (() => {
  const all = Object.values(STATS_BY_ID);
  const avg = (pick: (s: BuildStats) => number) => all.reduce((sum, s) => sum + pick(s), 0) / all.length;
  return { massKg: avg((s) => s.massKg), muzzleVelocityMps: avg((s) => s.muzzleVelocityMps) };
})();

interface WordBand {
  muchLow: string;
  low: string;
  about: string;
  high: string;
  muchHigh: string;
}

/** Band a value/average ratio into one of 5 qualitative words. Thresholds are
 *  a deliberately wide "about average" band (±10%) so most of the list doesn't
 *  read as a coin-flip between "heavier" and "lighter". */
function bandedWord(value: number, average: number, words: WordBand): string {
  const ratio = value / average;
  if (ratio < 0.6) return words.muchLow;
  if (ratio < 0.9) return words.low;
  if (ratio <= 1.1) return words.about;
  if (ratio <= 1.6) return words.high;
  return words.muchHigh;
}

export interface CartridgeOverviewWords {
  weight: string;
  velocity: string;
}

export function cartridgeOverviewWords(cartridgeId: string): CartridgeOverviewWords {
  const s = STATS_BY_ID[cartridgeId];
  return {
    weight: bandedWord(s.massKg, LIST_AVERAGE.massKg, {
      muchLow: 'much lighter bullet',
      low: 'lighter bullet',
      about: 'about-average bullet weight',
      high: 'heavier bullet',
      muchHigh: 'much heavier bullet',
    }),
    velocity: bandedWord(s.muzzleVelocityMps, LIST_AVERAGE.muzzleVelocityMps, {
      muchLow: 'much slower, more arcing trajectory',
      low: 'slower, more arcing trajectory',
      about: 'about-average velocity',
      high: 'faster, flatter-shooting',
      muchHigh: 'much faster, flatter-shooting',
    }),
  };
}
