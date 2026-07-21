import { describe, expect, it } from 'vitest';
import {
  cloudEdgeOpacity,
  generateCloudPlacements,
  generateMountainPlacements,
  generateScatterPlacements,
  generateTreePlacements,
  getCloudField,
  makeTerrainSampler,
  wrapToField,
} from './environment-config';
import { NO_HILL_CORRIDOR, TEST_RANGE_ENVIRONMENT, TEST_RANGE_GONG } from '../test-range-config';

const CFG = TEST_RANGE_ENVIRONMENT;
const sampler = makeTerrainSampler(CFG);

describe('environment-config determinism', () => {
  it('same seed gives identical placement arrays', () => {
    expect(generateTreePlacements(CFG)).toEqual(generateTreePlacements(CFG));
    expect(generateScatterPlacements(CFG)).toEqual(generateScatterPlacements(CFG));
    expect(generateMountainPlacements(CFG)).toEqual(generateMountainPlacements(CFG));
    expect(generateCloudPlacements(CFG)).toEqual(generateCloudPlacements(CFG));
  });

  it('a different seed gives different placements', () => {
    const other = { ...CFG, seed: 1338 };
    expect(generateTreePlacements(other)).not.toEqual(generateTreePlacements(CFG));
  });
});

describe('makeTerrainSampler', () => {
  it('is exactly flat in the shooter-to-target box', () => {
    const { zFlatToM } = CFG.terrain;
    for (let x = -16; x <= 16; x += 2) {
      for (let z = 0; z >= -zFlatToM; z -= 10) {
        expect(Math.abs(sampler(x, z))).toBeLessThan(1e-9);
      }
    }
  });

  it('unlocks relief straight ahead (x=0) once past the flat zone', () => {
    const { zFlatToM, zBlendM } = CFG.terrain;
    // Just past the fully-unlocked boundary — the lane's x-mask no longer
    // matters here, only z, so a bump directly on the sight line must show.
    expect(Math.abs(sampler(0, -(zFlatToM + zBlendM + 1)))).toBeGreaterThan(0);
  });

  it('sight line from the shooter to the gong stays above terrain', () => {
    const eye = { x: 0, y: 1.6, z: 0 };
    const gong = { x: 0, y: TEST_RANGE_GONG.plateCenterYM, z: -TEST_RANGE_GONG.distanceM };
    for (let i = 0; i <= 200; i++) {
      const t = i / 200;
      const x = eye.x + (gong.x - eye.x) * t;
      const y = eye.y + (gong.y - eye.y) * t;
      const z = eye.z + (gong.z - eye.z) * t;
      expect(sampler(x, z)).toBeLessThan(y);
    }
  });

  it('rises toward the hill height near its center, directly behind the target', () => {
    const { hill } = CFG.terrain;
    expect(hill.xM).toBe(0); // must read straight ahead, not off to the side
    expect(sampler(hill.xM, hill.zM)).toBeGreaterThan(0.8 * hill.heightM);
  });

  it('guarantees the ~10 yd wide, 100 yd long shooter-to-target corridor stays exactly flat, independent of the lane/zFlat tuning knobs', () => {
    const { halfWidthM, lengthM } = NO_HILL_CORRIDOR;
    for (let x = -halfWidthM; x <= halfWidthM; x += 1) {
      for (let z = 0; z >= -lengthM; z -= 5) {
        expect(Math.abs(sampler(x, z))).toBeLessThan(1e-9);
      }
    }
  });
});

describe('placement bounds', () => {
  const minAbsX = CFG.terrain.laneHalfWidthM + CFG.terrain.laneBlendM;
  const onLaneBands = CFG.trees.bands.filter((b) => b.allowOnLane);
  const isInOnLaneBand = (x: number, z: number) =>
    onLaneBands.some((b) => x >= b.xMin && x <= b.xMax && z >= b.zMin && z <= b.zMax);

  it('trees clear the lane (or sit in a designated on-lane backdrop band), match config counts, and sit on the sampled terrain', () => {
    const trees = generateTreePlacements(CFG);
    expect(trees).toHaveLength(CFG.trees.coniferCount + CFG.trees.deciduousCount);
    expect(trees.filter((t) => t.kind === 'conifer')).toHaveLength(CFG.trees.coniferCount);
    expect(trees.filter((t) => t.kind === 'deciduous')).toHaveLength(CFG.trees.deciduousCount);
    for (const t of trees) {
      if (!isInOnLaneBand(t.x, t.z)) expect(Math.abs(t.x)).toBeGreaterThan(CFG.terrain.laneHalfWidthM);
      expect(Math.abs(t.x)).toBeLessThanOrEqual(CFG.terrain.widthM / 2);
      expect(Math.abs(t.z)).toBeLessThanOrEqual(CFG.terrain.lengthM);
      expect(t.y).toBe(sampler(t.x, t.z));
    }
  });

  it('a dedicated backdrop band puts trees near the sight line, safely behind the target', () => {
    expect(onLaneBands.length).toBeGreaterThan(0);
    for (const b of onLaneBands) {
      // The near edge (zMax, least negative) must clear the gong by a solid
      // buffer so backdrop trees never stand between the shooter and target.
      expect(b.zMax).toBeLessThan(-TEST_RANGE_GONG.distanceM - 40);
    }
    const trees = generateTreePlacements(CFG);
    const onLane = trees.filter((t) => isInOnLaneBand(t.x, t.z));
    expect(onLane.length).toBeGreaterThan(0);
    const maxAbsX = Math.max(...onLaneBands.flatMap((b) => [Math.abs(b.xMin), Math.abs(b.xMax)]));
    for (const t of onLane) {
      expect(Math.abs(t.x)).toBeLessThanOrEqual(maxAbsX);
      expect(t.z).toBeLessThan(-TEST_RANGE_GONG.distanceM - 40);
    }
  });

  it('bushes and rocks clear the lane (or sit in the on-lane backdrop band) and match config counts', () => {
    const { bushes, rocks } = generateScatterPlacements(CFG);
    expect(bushes).toHaveLength(CFG.cover.bushCount);
    expect(rocks).toHaveLength(CFG.cover.rockCount);
    for (const s of [...bushes, ...rocks]) {
      if (!isInOnLaneBand(s.x, s.z)) {
        expect(Math.abs(s.x)).toBeGreaterThan(CFG.terrain.laneHalfWidthM);
        expect(Math.abs(s.x)).toBeGreaterThanOrEqual(minAbsX);
      }
      expect(s.y).toBe(sampler(s.x, s.z));
    }
  });

  it('grass tufts stay inside the lane and grass zone', () => {
    const { grassTufts } = generateScatterPlacements(CFG);
    expect(grassTufts).toHaveLength(CFG.cover.grassTuftCount);
    for (const t of grassTufts) {
      expect(Math.abs(t.x)).toBeLessThanOrEqual(CFG.terrain.laneHalfWidthM);
      expect(t.z).toBeLessThanOrEqual(0);
      expect(t.z).toBeGreaterThanOrEqual(-CFG.cover.grassZoneM);
    }
  });

  it('grass tufts clear the shooter by shooterClearM (no tuft can dominate the sight picture)', () => {
    const { grassTufts } = generateScatterPlacements(CFG);
    for (const t of grassTufts) {
      expect(Math.hypot(t.x, t.z)).toBeGreaterThanOrEqual(CFG.cover.shooterClearM);
    }
  });

  it('mountains all clear the minimum ring distance', () => {
    const mountains = generateMountainPlacements(CFG);
    expect(mountains).toHaveLength(CFG.mountains.count);
    for (const m of mountains) {
      expect(m.z).toBeLessThanOrEqual(-CFG.mountains.distMinM);
      expect(-m.z).toBeLessThanOrEqual(CFG.mountains.distMaxM);
    }
  });

  it('clouds all sit inside their configured field box', () => {
    const clouds = generateCloudPlacements(CFG);
    expect(clouds).toHaveLength(CFG.clouds.count);
    for (const c of clouds) {
      expect(Math.abs(c.x)).toBeLessThanOrEqual(CFG.clouds.fieldHalfWidthM);
      expect(c.z).toBeLessThanOrEqual(CFG.clouds.fieldZNearM);
      expect(c.z).toBeGreaterThanOrEqual(CFG.clouds.fieldZFarM);
      expect(c.y).toBeGreaterThanOrEqual(CFG.clouds.heightMinM);
      expect(c.y).toBeLessThanOrEqual(CFG.clouds.heightMaxM);
    }
  });
});

describe('cloud field wrap/fade math (Stage 4)', () => {
  const field = getCloudField(CFG);

  it('getCloudField derives a box whose near/far edges match the config exactly', () => {
    expect(field.centerX).toBe(0);
    expect(field.halfWidthM).toBe(CFG.clouds.fieldHalfWidthM);
    expect(field.centerZ + field.halfLengthM).toBeCloseTo(CFG.clouds.fieldZNearM, 9);
    expect(field.centerZ - field.halfLengthM).toBeCloseTo(CFG.clouds.fieldZFarM, 9);
  });

  it('wrapToField keeps values inside the box unchanged and teleports out-of-box values to the opposite edge', () => {
    expect(wrapToField(0, field.centerX, field.halfWidthM)).toBeCloseTo(0, 9);
    const justOver = field.centerX + field.halfWidthM + 1;
    const wrapped = wrapToField(justOver, field.centerX, field.halfWidthM);
    expect(wrapped).toBeCloseTo(field.centerX - field.halfWidthM + 1, 9);
    expect(wrapped).toBeGreaterThanOrEqual(field.centerX - field.halfWidthM);
    expect(wrapped).toBeLessThanOrEqual(field.centerX + field.halfWidthM);
  });

  it('cloudEdgeOpacity is 1 at the field center and fades to 0 within marginM of an edge', () => {
    const marginM = CFG.clouds.fadeMarginM;
    expect(cloudEdgeOpacity(field.centerX, field.centerZ, field, marginM)).toBeCloseTo(1, 9);
    expect(cloudEdgeOpacity(field.centerX + field.halfWidthM, field.centerZ, field, marginM)).toBeCloseTo(0, 9);
    expect(cloudEdgeOpacity(field.centerX, field.centerZ - field.halfLengthM, field, marginM)).toBeCloseTo(0, 9);
  });
});
