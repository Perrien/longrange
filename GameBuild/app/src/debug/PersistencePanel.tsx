// Task 0.8 debug panel: exercises the SaveStore end-to-end — autosaved test
// setting, storage-persistence status, JSON export/import. The owner check
// ("change setting → kill app → relaunch → persists", and export→import on a
// second browser) runs against this panel.
import { useEffect, useRef, useState } from 'react';
import {
  createSaveStore,
  DEFAULT_SAVE,
  parseSave,
  requestPersistence,
  type SaveData,
} from '../persistence';
import { exportSaveToFile, readPickedFile } from '../persistence/export-file';

const store = createSaveStore();

export function PersistencePanel() {
  const [save, setSave] = useState<SaveData | null>(null);
  const [storageInfo, setStorageInfo] = useState<string>('checking…');
  const [status, setStatus] = useState<string>('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    store.load().then((loaded) => setSave(loaded ?? DEFAULT_SAVE));
    requestPersistence().then((p) =>
      setStorageInfo(
        p.persisted === 'unsupported'
          ? 'storage API unsupported'
          : `persist(): ${p.persisted}` +
              (p.usage !== undefined
                ? ` · usage ${(p.usage / 1024).toFixed(0)} KiB of ${((p.quota ?? 0) / 1048576).toFixed(0)} MiB`
                : ''),
      ),
    );
  }, []);

  if (!save) return <p>Loading save…</p>;

  const apply = (next: SaveData, note: string) => {
    setSave(next);
    void store.save(next).then(() => setStatus(`${note} · saved ${new Date().toLocaleTimeString()}`));
  };

  return (
    <fieldset style={{ fontFamily: 'monospace', marginTop: '1rem', maxWidth: 640 }}>
      <legend>Persistence (task 0.8)</legend>
      <p>{storageInfo}</p>
      <label>
        Primary angular unit (test setting — survives relaunch):{' '}
        <select
          value={save.settings.unitsPrimary}
          onChange={(e) =>
            apply(
              { ...save, settings: { ...save.settings, unitsPrimary: e.target.value as 'MIL' | 'MOA' } },
              `unitsPrimary=${e.target.value}`,
            )
          }
        >
          <option value="MIL">MIL</option>
          <option value="MOA">MOA</option>
        </select>
      </label>
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
        <button onClick={() => void exportSaveToFile(save).then((how) => setStatus(`exported (${how})`))}>
          Export save
        </button>
        <button onClick={() => fileInput.current?.click()}>Import save…</button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void readPickedFile(file)
              .then((json) => {
                const imported = parseSave(json); // validate → migrate, THEN apply
                apply(imported, 'imported');
              })
              .catch((err: unknown) => setStatus(`import rejected: ${String(err)}`));
            e.target.value = '';
          }}
        />
      </div>
      <p style={{ color: '#888' }}>{status || 'no changes yet'} · schema v{save.schemaVersion}</p>
    </fieldset>
  );
}
