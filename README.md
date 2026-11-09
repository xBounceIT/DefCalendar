# DefCalendar

Desktop calendar app for Microsoft 365 Exchange Online built with Electron.

- Microsoft sign-in via `@azure/msal-node` with encrypted token cache
- Multi-account support with calendar selection and custom colors
- Full event CRUD with drag-and-drop move/resize
- Optional physical-location autocomplete and map previews powered by Photon / OpenStreetMap, without an API key
- Meeting responses (accept/tentative/decline)
- Participant free/busy indicators when creating meetings, refreshed as attendees or times change
- Local SQLite cache with configurable periodic sync
- Desktop reminder popup with snooze/dismiss and meeting join
- In-app invitation popups on Windows and macOS, including new invitations synced at startup; popup and system notification preferences are independent in Settings > Notifications
- System tray integration
- React 19 renderer with month/week/day views and mini calendar
- Internationalization (English/Italian)
- Update checks via GitHub Releases (stable/prerelease channels), with automatic installation on Windows and manual DMG installation on macOS

## Stack

- Electron + electron-vite + TypeScript
- React 19 + FullCalendar + Zustand + TanStack Query
- better-sqlite3 (local cache), MSAL Node (auth), Microsoft Graph API
- Zod (validation), i18next (i18n), electron-updater (auto-updates)
- oxlint + oxfmt for linting/formatting, Vitest for testing, Husky for hooks

## Local Setup

1. Register a Microsoft Entra application for DefCalendar.
2. Point `src/main/auth/app-registration.ts` at your public-client app registration, or use `MSAL_CLIENT_ID` only as a development override.
3. Configure the app for accounts in any organizational directory.
4. Enable the public client desktop/mobile flow.
5. Under `Authentication > Add a platform`, add `Mobile and desktop applications` with the redirect URI `http://localhost`.
6. Grant delegated Microsoft Graph permissions:
   - `openid`, `profile`, `offline_access`
   - `User.Read`, `User.ReadBasic.All`, `Calendars.ReadWrite`, `MailboxSettings.Read`, `Contacts.Read`, `People.Read`
7. Use `.env.example` for optional development overrides; packaged end users should use the bundled app registration.
8. For tenant-specific development, override `MSAL_AUTHORITY`.

## Scripts

- `npm run dev` — Start development server
- `npm run build` — Compile main, preload, and renderer into `out/`
- `npm run lint` — Run oxlint
- `npm run lint:fix` — Apply oxlint autofixes
- `npm run format` — Format code with oxfmt
- `npm run format:check` — Check formatting without changes
- `npm run test` — Run Vitest suite
- `npm run test:watch` — Run tests in watch mode
- `npm run package` — Create unpacked distributable
- `npm run dist` — Create installer artifacts with electron-builder
- `npm run dist:publish` — Create installer artifacts and publish a GitHub Release

## Releases

Pushing a `v*` tag matching `package.json` creates a draft GitHub Release with generated notes, then builds Windows and macOS assets in parallel. The release becomes public only after both builds and uploads succeed.

- Windows: NSIS installer.
- macOS: universal DMG and ZIP containing both Intel (`x64`) and Apple Silicon (`arm64`) binaries, plus update metadata. The workflow checks both architectures in the app executable and the native SQLite module before publishing the release.
- To build the macOS artifacts locally on a Mac without a Developer ID certificate, run `npm run dist -- --mac --universal -c.mac.identity=- -c.mac.notarize=false`. The ad-hoc signature is required for native notifications. With signing credentials configured, use `npm run dist -- --mac --universal`.

For Developer ID signing and notarization, configure the repository Actions secrets `MAC_CSC_LINK` (base64-encoded `.p12` certificate), `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`. Without these credentials, the workflow still builds macOS artifacts, but they are not Developer ID signed or notarized; normal Gatekeeper distribution and macOS auto-updates require signing. See the [electron-builder macOS signing documentation](https://www.electron.build/v26/docs/features/code-signing/).

The app currently uses manual installation on macOS because releases are distributed without Developer ID signing. Both the update popup and Settings open the detected version's GitHub release page instead of invoking the native updater. Download its universal DMG, quit DefCalendar, and replace the app in Applications without deleting application data. This also recovers older installations showing `Code signature ... did not pass validation`. Configuring signing credentials alone does not enable automatic installation in the app; that mode must be enabled and tested separately after migrating existing installations to a compatible signing identity.

## Notes

- Targets Microsoft 365 work/school accounts only.
- Locations are plain text by default, including online meeting names. Use the icon selector to the left of the location field to switch from **Location** to **Map** for address suggestions and a small OpenStreetMap area preview. Hovering or focusing the preview reveals the link icon; clicking opens Google Maps. The physical-location choice and selected coordinates are saved locally for each event and retained through synchronization while the address remains unchanged. Map previews load only the visible tiles through Electron's HTTP cache, with an identifying DefCalendar User-Agent; no API key is required.
- Location suggestions use the public [Photon API](https://github.com/komoot/photon#demo-server). Searches send only the typed location to Photon after at least three characters and a 500 ms pause. Requests run in the main process, are limited to one per second, and results are cached in memory for five minutes. Returning to a cached query displays results immediately; switching away from the app preserves the open popup and pending search. Previous suggestions remain visible but cannot be selected while a new search is pending. Italian uses local place names; English requests translated names. Street addresses with house numbers use structured searches and exclude conflicting streets or house numbers. When Photon only knows the street, suggestions retain the entered number and explicitly mark it as unverified. The public service permits moderate usage, may throttle requests, and has no availability guarantee. Manual locations remain available when offline or when no result matches. Map data is attributed to [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
- Participant profile photos use delegated `User.ReadBasic.All` to read other organizational users' basic profiles, including photos, and `Contacts.Read` for personal contact photos. See the [Microsoft Graph photo permissions](https://learn.microsoft.com/en-us/graph/api/profilephoto-get?view=graph-rest-1.0). When upgrading an existing Entra app registration, add `User.ReadBasic.All` to its delegated permissions and sign in again to grant the additional consent. Tenant consent policies may require administrator approval. If `GRAPH_SCOPES` is overridden, include `User.ReadBasic.All` there as well; photos without sufficient permission retain initials.
- Participant availability uses Microsoft Graph `getSchedule` with the existing delegated `Calendars.ReadWrite` permission; no additional Microsoft 365 consent is required. Exchange calendar sharing and free/busy policies determine which schedules the signed-in account can see. Inaccessible or external mailboxes may show availability as unknown, never as free. Only availability is sent to the UI, without event titles or details. Recurring meetings check the selected time range only.
- `AADSTS500113` means the Entra app registration is missing the localhost redirect or public client flows are disabled.
- Shared/delegate calendars are not implemented.
- Recurring events and attendee-managed meetings are shown but edited as read-only, with an Outlook handoff.
- Build Windows installers on native Windows or CI (WSL2 is not suitable).
- Updates use GitHub Releases and are user-initiated from the update popup or `Settings > About`.
- Publishing updates requires a `GH_TOKEN` with repository release permissions.
