// Game-state entry point (task 1.1). Components import from here.
export {
  useGameStore,
  defaultSession,
  defaultSettings,
  defaultScore,
  defaultInventory,
  MIL_CLICK_RAD,
  MOA_CLICK_RAD,
  ZOOM_MIN,
  ZOOM_MAX,
  DEFAULT_MAGNIFICATION,
  DEFAULT_SHOT_BUDGET,
  DEFAULT_WIND_PRESET,
} from './store';
export type {
  GameStore,
  SessionState,
  SettingsState,
  ScopeState,
  WindState,
  WindRealism,
  MarkerStyle,
  UnitsPrimary,
  CommittedTarget,
  ScoreState,
  InventoryState,
} from './store';
export {
  settingsToSave,
  saveToSettings,
  storeToSave,
  saveToInventory,
  loadSettingsInto,
  persistSettingsOnChange,
} from './persist-settings';
