// Phase 49 Wave 3: SettingsForm is now a thin re-export wrapper around SettingsLayout.
// The named export is preserved so SettingsApp.tsx (and tests) import paths are unchanged.
export { SettingsLayout as SettingsForm } from './SettingsLayout';
export { default } from './SettingsLayout';
