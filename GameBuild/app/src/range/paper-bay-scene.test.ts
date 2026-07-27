// Paper-bay capability tests — Stage 2a of `Design/archive/mil-zero-range-plan.md`.
//
// These are structural guards, not behaviour tests. They exist because the whole
// point of `PaperBayScene` is that a second paper bay inherits the zeroing flow,
// Clean and Inspect WITHOUT anyone having to remember to update a gate. The
// failure mode is silent: a new range gets added, one `sceneType` check somewhere
// doesn't know about it, and that range quietly loses a feature.
import { describe, expect, it } from 'vitest';
import { getRangeDefinition, listRanges } from './ranges';
import type { PaperBayScene } from './paper-bay-scene';
import { SightInScene } from './SightInScene';
import { WoodedZeroScene } from './WoodedZeroScene';

/** Every member ScopeView reaches for through the interface. If ScopeView starts
 *  using another method, add it here — this list is the contract. */
const REQUIRED_METHODS = [
  'paintHit',
  'cleanTarget',
  'cleanAll',
  'setGroupCentroid',
  'clearGroupCentroid',
  'getFaceCanvas',
  'dispose',
] as const;

describe('PaperBayScene contract', () => {
  // Compile-time check: this file would not typecheck if either scene stopped
  // satisfying the interface. Runtime assertions below cover the shape.
  it.each([
    ['SightInScene', SightInScene],
    ['WoodedZeroScene', WoodedZeroScene],
  ])('is satisfied by %s', (_name, ctor) => {
    const proto = (ctor as unknown as { prototype: object }).prototype;
    for (const m of REQUIRED_METHODS) {
      expect(typeof (proto as Record<string, unknown>)[m]).toBe('function');
    }
    // `laneLengthM` is a getter on the prototype; the rest are instance fields
    // assigned in the constructor, so only the getter is visible here.
    expect(Object.getOwnPropertyDescriptors(proto).laneLengthM?.get).toBeTypeOf('function');
  });

  it('types SightInScene as assignable to PaperBayScene', () => {
    // Purely a type-level assertion — `tsc --noEmit` is the real check. Written
    // as a value so the import is not elided.
    const assignable: (s: PaperBayScene) => PaperBayScene = (s) => s;
    expect(assignable).toBeTypeOf('function');
  });
});

describe('landing screen only lists ranges that can actually be entered', () => {
  // The defect this guards (found 2026-07-26): `wooded-zero` was added to the
  // registry before it had a scene builder. `RangeSelect` renders one card per
  // `listRanges()` entry and D8 forbids "coming soon" slots, so selecting it fell
  // through ScopeView's scene branch to the steel `RangeScene` — Range A's world
  // under a Wooded Zero label. A range joins `listRanges()` only when its scene
  // exists. Stage 2b built that scene, so it is listed now; the guard stays for
  // the next range under construction.
  const SCENES_THAT_EXIST = ['steel-racks', 'sight-in', 'test-range', 'wooded-zero'];

  it('gives every listed range a scene builder that exists', () => {
    for (const r of listRanges()) {
      expect(SCENES_THAT_EXIST).toContain(r.sceneType);
    }
  });

  it('now lists wooded-zero, since Stage 2b gave it a scene', () => {
    expect(listRanges().map((r) => r.id)).toContain('wooded-zero');
    expect(getRangeDefinition('wooded-zero').id).toBe('wooded-zero');
  });
});

describe('targetKind drives the paper HUD, not sceneType', () => {
  it('agrees with sceneType for the bays that exist today', () => {
    // If these ever disagree, the capability gate and the scene branch have
    // drifted apart and one of them is wrong.
    for (const r of [...listRanges(), getRangeDefinition('wooded-zero')]) {
      const looksLikePaperBay = r.sceneType === 'sight-in' || r.sceneType === 'wooded-zero';
      expect(r.targetKind === 'paper').toBe(looksLikePaperBay);
    }
  });

  it('makes every zeroable range a paper bay', () => {
    // Zeroing needs a face to group on. The converse is not required — a paper
    // bay could exist that does not store zeros.
    for (const r of [...listRanges(), getRangeDefinition('wooded-zero')]) {
      if (r.zeroable) expect(r.targetKind).toBe('paper');
    }
  });
});
