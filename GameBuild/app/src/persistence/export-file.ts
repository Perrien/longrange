// Export/import as a JSON file (task 0.8; hard constraint §0.3). iOS-first:
// try the share sheet (navigator.share with a File), fall back to a download
// link. Import reads a user-picked file and returns its text; the caller runs
// parseSave (validate → migrate) before applying.

import { serializeSave } from './save-store';
import type { SaveData } from './schema';

export function exportFileName(now = new Date()): string {
  const d = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `longrange-save-${d}.json`;
}

export async function exportSaveToFile(data: SaveData): Promise<'shared' | 'downloaded'> {
  const json = serializeSave(data);
  const file = new File([json], exportFileName(), { type: 'application/json' });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'LongRange save' });
      return 'shared';
    } catch {
      // user cancelled or share failed — fall through to download
    }
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName();
  a.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}

export function readPickedFile(file: File): Promise<string> {
  return file.text();
}
