// Game-state entry point (task 1.1). Components import from here.
export {
  useGameStore,
  defaultSession,
  defaultSettings,
  defaultScore,
  MIL_CLICK_RAD,
  MOA_CLICK_RAD,
  ZOOM_MIN,
  ZOOM_MAX,
  DEFAULT_MAGNIFICATION,
  DEFAULT_SHOT_BUDGET,
} from './store';
export type {
  GameStore,
  SessionState,
  SettingsState,
  ScopeState,
  WindState,
  UnitsPrimary,
  CommittedTarget,
  ScoreState,
} from './store';
export {
  settingsToSave,
  saveToSettings,
  loadSettingsInto,
  persistSettingsOnChange,
} from './persist-settings';
