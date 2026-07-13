// Guards the lockfile against corporate-mirror URLs (task 0.5 CI fix).
//
// npm on the corp machine resolves packages via the internal mirror and writes
// those URLs into package-lock.json's `resolved` fields; GitHub CI can't reach
// them (ENOTFOUND artifacts.apple.com — seen 2026-07-13). The lockfile must
// stay canonicalized to the public registry: npm substitutes the locally
// configured mirror for public URLs automatically, so public URLs work
// everywhere; internal URLs work only inside the corp network.
//
// If this fails after adding a dependency, re-canonicalize:
//   sed -i '' -e 's#https://artifacts.apple.com/artifactory/api/npm/npm-apple/#https://registry.npmjs.org/#g' \
//             -e 's#https://npm.apple.com/#https://registry.npmjs.org/#g' package-lock.json
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const lockPath = fileURLToPath(new URL('../package-lock.json', import.meta.url));
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

const bad = [];
for (const [name, pkg] of Object.entries(lock.packages ?? {})) {
  if (pkg.resolved && !pkg.resolved.startsWith('https://registry.npmjs.org/')) {
    bad.push(`${name || '(root)'} -> ${pkg.resolved}`);
  }
}

if (bad.length > 0) {
  console.error(
    `\n[lockfile] ${bad.length} non-public registry URL(s) in package-lock.json — ` +
      `CI cannot fetch these. Re-canonicalize (see comment in scripts/check-lockfile.mjs):\n\n` +
      bad.slice(0, 10).map((l) => `  ${l}`).join('\n') +
      (bad.length > 10 ? `\n  … and ${bad.length - 10} more` : '') +
      '\n',
  );
  process.exit(1);
}
console.log('[lockfile] OK — all resolved URLs point at the public registry.');
