## Summary
- Adds a bottom-right popup that appears when an app update is available
- Shows version number and a link to the version-specific GitHub release changelog
- Two actions: "Download and Restart" (one-click flow) and "Remind me later" (session-only dismissal)
- Fully localized (en/it) and styled to match the existing app design

## Changes
- New component: `src/renderer/src/components/update-available-popup.tsx`
- Integrated into `src/renderer/src/app.tsx`
- Added CSS styles in `src/renderer/src/styles.css`
- Added i18n keys in `en.json` and `it.json`
