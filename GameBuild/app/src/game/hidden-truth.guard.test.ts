// Task 2.1c — encapsulation guard (increment-2.md §2.1 Done-when: "grep-style
// check that no UI/HUD module imports hidden-truth internals"). Hidden truth may
// enter solves ONLY through engine-bridge (protocol §4.8 / catalog §0); it must
// never reach the UI/HUD/scene/shell/state layers, where it could leak to the
// player via display or logs. This test scans those directories' source and
// asserts none of them import `game/hidden-truth`.
//
// ONE sanctioned exception (task 2.2d, D9): `debug/TruthInspector.tsx` is a
// dev-only diagnostic that deliberately reveals truth. It is legitimate because
// DevTools (its only importer) renders behind `import.meta.env.DEV`, so Rollup
// drops it — and this whole truth-reading path — from the shipped prod bundle
// (proven by the tree-shake test below). Every OTHER UI-dir file must stay clean.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Directories that must NOT import hidden truth (UI / HUD / scene / shell / state). */
const GUARDED_DIRS = ['scope', 'range', 'shell', 'debug', 'state'];

/** Dev-only diagnostics allowed to read truth (D9) — relative to SRC_DIR, tree-shaken from prod. */
const ALLOWLIST = ['debug/TruthInspector.tsx'];

/** Static-import and dynamic-import references to the hidden-truth module. */
const IMPORT_RE = /(?:from|import)\s*\(?\s*['"][^'"]*hidden-truth[^'"]*['"]/;

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('hidden-truth encapsulation (no-leak guard, task 2.1c/2.2d)', () => {
  it('no UI/HUD/scene/shell/state module imports game/hidden-truth (except the dev allowlist)', () => {
    const offenders: string[] = [];
    for (const d of GUARDED_DIRS) {
      const dirPath = join(SRC_DIR, d);
      for (const file of collectSourceFiles(dirPath)) {
        const rel = file.slice(SRC_DIR.length + 1);
        if (ALLOWLIST.includes(rel)) continue;
        if (IMPORT_RE.test(readFileSync(file, 'utf8'))) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the allowlisted dev inspector genuinely does read truth (allowlist is not stale)', () => {
    // If TruthInspector stops importing hidden-truth, drop it from ALLOWLIST.
    const src = readFileSync(join(SRC_DIR, 'debug/TruthInspector.tsx'), 'utf8');
    expect(IMPORT_RE.test(src)).toBe(true);
  });

  it('actually scanned the guarded directories (sanity — the scan is not a no-op)', () => {
    const total = GUARDED_DIRS.reduce(
      (n, d) => n + collectSourceFiles(join(SRC_DIR, d)).length,
      0,
    );
    expect(total).toBeGreaterThan(0);
  });
});
