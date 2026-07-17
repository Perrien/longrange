import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { UpdateToast } from './pwa/UpdateToast';
import { useGameStore } from './state/store';
import { loadSettingsInto, persistSettingsOnChange } from './state';
import { createSaveStore, requestPersistence } from './persistence';

// Wire settings persistence into the real app (task 2.1d fix). The player flow
// never wired the SaveStore glue — only the dev-only PersistencePanel did (task
// 0.8's force-quit/relaunch proof went through that panel), so once 1.8a gated
// the panel behind DevTools the shipped app silently stopped persisting any
// settings. Subscribe FIRST so subsequent changes autosave, then hydrate any
// existing save into the store (no-op on a first run — store keeps defaults).
// `requestPersistence()` asks the browser not to evict our IndexedDB.
const saveStore = createSaveStore();
persistSettingsOnChange(useGameStore, saveStore);
void loadSettingsInto(useGameStore, saveStore);
void requestPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdateToast />
  </StrictMode>,
);
