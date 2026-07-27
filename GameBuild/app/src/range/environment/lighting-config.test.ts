// Lighting + aerial-perspective tests — Stage 3 of
// `Design/archive/mil-zero-range-plan.md`.
//
// These guard the two constraints that are easy to break by "just nudging the
// look", and whose failure modes are subtle enough to survive a device check:
//
//   1. The sun must stay BEHIND the firing line. Every prettier, more raking
//      azimuth in front of the shooter lights target boards edge-on, which
//      silently defeats §5's board-contrast requirement — the reason there are
//      no berms.
//   2. The fog must stay off the targets. Linear fog put the mountains at
//      99.6% fog colour and made two rounds of texture darkening produce no
//      visible change; the same mistake in the other direction would wash out
//      the 200 m board.
import { describe, expect, it } from 'vitest';
import {
  boardIllumination,
  shadowLengthFactor,
  sunDirection,
  type EnvironmentConfig,
} from './environment-config';
import { WOODED_ZERO_ENVIRONMENT } from '../wooded-zero-environment';
import { TEST_RANGE_ENVIRONMENT } from '../test-range-config';

const CONFIGS: Array<[string, EnvironmentConfig]> = [
  ['wooded zero', WOODED_ZERO_ENVIRONMENT],
  ['test range', TEST_RANGE_ENVIRONMENT],
];

/** FogExp2: 1 - exp(-(density * distance)^2). */
const fogAt = (density: number, distanceM: number) => 1 - Math.exp(-((density * distanceM) ** 2));

describe.each(CONFIGS)('%s — sun geometry', (_name, cfg) => {
  it('keeps the sun BEHIND the firing line so boards are lit, not silhouetted', () => {
    // Board normals point back at the shooter (+z), so illumination is the sun
    // direction's z component. Positive = behind the shooter.
    expect(sunDirection(cfg).z).toBeGreaterThan(0);
    expect(boardIllumination(cfg)).toBeGreaterThan(0.4);
  });

  it('keeps the sun LOW so the terrain relief reads', () => {
    // The old rig sat at ~54 deg (midday), which flattens relief and lights
    // canopy tops the shooter never sees. That is what three rounds of palette
    // brightening were unsuccessfully fighting. The upper bound exists to stop
    // a drift back toward that, not to pin a specific hour — 24 deg (owner,
    // 2026-07-26) is comfortably inside it.
    expect(cfg.lighting.sunElevationDeg).toBeGreaterThan(5);
    expect(cfg.lighting.sunElevationDeg).toBeLessThan(35);
  });

  it('throws long shadows, but not so long they leave the shadow frustum', () => {
    const factor = shadowLengthFactor(cfg);
    // Lower bound relaxed 2.5 -> 1.8 when the owner raised the sun to 24 deg
    // (2026-07-26, "an hour or so later"). 2.25x still reads as raking morning
    // light; the value this guards against is the ~54 deg midday rig, which
    // throws 0.7x and flattens everything.
    expect(factor).toBeGreaterThan(1.8);
    const shadows = cfg.lighting.shadows;
    if (!shadows) return;
    // A 15 m tree at this sun angle must still fit inside the ortho half-extent,
    // or tall trees lose their shadow tips at the frustum edge.
    expect(15 * factor).toBeLessThan(shadows.extentM * 2);
  });

  it('uses a warm key against a cool fill — the thing that reads as morning', () => {
    const warm = (hex: number) => (hex >> 16 & 0xff) - (hex & 0xff); // R minus B
    expect(warm(cfg.lighting.sunHex)).toBeGreaterThan(0);
    expect(warm(cfg.lighting.hemiSkyHex)).toBeLessThan(0);
  });

  it('returns a unit sun direction', () => {
    const d = sunDirection(cfg);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 10);
  });
});

describe.each(CONFIGS)('%s — aerial perspective', (_name, cfg) => {
  it('leaves the target field essentially unfogged', () => {
    // Board contrast (plan §5.2) is what replaces the berms. If haze eats the
    // 200 m board, the range loses its readability at the longest station.
    expect(fogAt(cfg.fog.density, 200)).toBeLessThan(0.05);
  });

  it('hazes the distant ridge without saturating it', () => {
    // The linear-fog failure was saturation: ~99.6% fog colour at 1350 m meant
    // the mountain's own albedo was irrelevant. Exponential-squared keeps real
    // gradient there.
    const near = fogAt(cfg.fog.density, 1000);
    const far = fogAt(cfg.fog.density, 1350);
    expect(near).toBeGreaterThan(0.25);
    expect(far).toBeLessThan(0.8);
    expect(far - near).toBeGreaterThan(0.1); // an actual gradient, not a wall
  });

  it('matches fog colour to the sky horizon so distance dissolves into sky', () => {
    expect(cfg.fog.colorHex).toBe(cfg.sky.horizonHex);
  });

  it('keeps every ridge inside the sky dome and the camera far plane', () => {
    // A ridge outside the dome renders behind it (the dome is BackSide and draws
    // first); one outside the 3000 m camera far plane is clipped away entirely.
    for (const layer of cfg.ridges.layers) {
      expect(layer.distanceM).toBeLessThan(cfg.sky.domeRadiusM);
      expect(layer.distanceM).toBeLessThan(3000);
    }
  });
});

describe('shadow configuration', () => {
  it.each(CONFIGS)('%s carries a bias tuned for a grazing sun', (_name, cfg) => {
    const shadows = cfg.lighting.shadows;
    expect(shadows).toBeDefined();
    // normalBias is the one that matters at low sun angles over flat ground;
    // leaving it at 0 stripes the entire lane with acne.
    expect(shadows!.normalBias).toBeGreaterThan(0);
    expect(shadows!.bias).toBeLessThanOrEqual(0);
  });

  it.each(CONFIGS)('%s uses a power-of-two shadow map', (_name, cfg) => {
    const n = cfg.lighting.shadows!.mapSize;
    expect(Number.isInteger(Math.log2(n))).toBe(true);
  });
});
