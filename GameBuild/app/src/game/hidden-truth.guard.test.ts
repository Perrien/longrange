// Task 2.1c — encapsulation guard (increment-2.md §2.1 Done-when: "grep-style
// check that no UI/HUD module imports hidden-truth internals"). Hidden truth may
// enter solves ONLY through engine-bridge (protocol §4.8 / catalog §0); it must
// never reach the UI/HUD/scene/shell/state layers, where it could leak to the
// player via display or logs. This test scans those directories' source and
// asserts none of them import `game/hidden-truth`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Directories that must NOT import hidden truth (UI / HUD / scene / shell / state). */
const GUARDED_DIRS = ['scope', 'range', 'shell', 'debug', 'state'];

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

describe('hidden-truth encapsulation (no-leak guard, task 2.1c)', () => {
  it('no UI/HUD/scene/shell/state module imports game/hidden-truth', () => {
    const offenders: string[] = [];
    for (const d of GUARDED_DIRS) {
      const dirPath = join(SRC_DIR, d);
      for (const file of collectSourceFiles(dirPath)) {
        if (IMPORT_RE.test(readFileSync(file, 'utf8'))) {
          offenders.push(file.slice(SRC_DIR.length + 1));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('actually scanned the guarded directories (sanity — the scan is not a no-op)', () => {
    const total = GUARDED_DIRS.reduce(
      (n, d) => n + collectSourceFiles(join(SRC_DIR, d)).length,
      0,
    );
    expect(total).toBeGreaterThan(0);
  });
});
