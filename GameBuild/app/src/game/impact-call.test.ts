import { describe, expect, it } from 'vitest';
import { callImpact } from './impact-call';
import type { ShotResult } from './shot';

const CENTER = { x: 10, y: 5 };

const shot = (dx: number, dy: number, hitPlateId: number | null): ShotResult => ({
  impact: { x: CENTER.x + dx, y: CENTER.y + dy },
  distanceM: 300,
  hitPlateId,
  aimedPlateId: hitPlateId ?? 7,
});

describe('impact-call (task 1.6c)', () => {
  it('reports hit=true only when hitPlateId is set', () => {
    expect(callImpact(shot(0.01, 0.02, 7), CENTER).hit).toBe(true);
    expect(callImpact(shot(0.01, 0.02, null), CENTER).hit).toBe(false);
  });

  it('straight up from centre calls 12 o\'clock', () => {
    expect(callImpact(shot(0, 0.05, 7), CENTER).clock).toBe(12);
  });

  it('straight right from centre calls 3 o\'clock', () => {
    expect(callImpact(shot(0.05, 0, 7), CENTER).clock).toBe(3);
  });

  it('straight down from centre calls 6 o\'clock', () => {
    expect(callImpact(shot(0, -0.05, 7), CENTER).clock).toBe(6);
  });

  it('straight left from centre calls 9 o\'clock', () => {
    expect(callImpact(shot(-0.05, 0, 7), CENTER).clock).toBe(9);
  });

  it('high-right calls 1-2 o\'clock', () => {
    const call = callImpact(shot(0.05, 0.05, 7), CENTER);
    expect(call.clock).toBeGreaterThanOrEqual(1);
    expect(call.clock).toBeLessThanOrEqual(2);
  });

  it('a dead-centre impact reports clock 12 by convention (no undefined direction)', () => {
    expect(callImpact(shot(0, 0, 7), CENTER).clock).toBe(12);
  });

  it('distanceLabel reflects the known offset in both units (1 in offset)', () => {
    // 1 inch = 0.0254 m offset, straight right.
    const call = callImpact(shot(0.0254, 0, 7), CENTER);
    expect(call.distanceLabel).toContain('25 mm');
    expect(call.distanceLabel).toContain('1.0 in');
  });

  it('a miss still gets a directional call relative to the supplied plate centre', () => {
    const call = callImpact(shot(0.05, 0, null), CENTER);
    expect(call.hit).toBe(false);
    expect(call.clock).toBe(3);
  });
});
