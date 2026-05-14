# Deferred Items

## Out of Scope Issues Discovered

### Missing lucide-react dependency
- **File:** apps/desktop/src/renderer/src/settings/SettingsLayout.tsx
- **Issue:** Import of "lucide-react" fails because package is not installed
- **Impact:** Renderer build fails with Rollup resolution error
- **Scope:** Pre-existing issue unrelated to 'open' externalization task
- **Action:** Deferred - not caused by current task changes
- **Note:** Main and preload bundles built successfully, confirming 'open' externalization works correctly
