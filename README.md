# DefCalendar

Desktop calendar app for Microsoft 365 Exchange Online built with Electron.

- Microsoft sign-in via `@azure/msal-node` with encrypted token cache
- Multi-account support with calendar selection and custom colors
- Full event CRUD with drag-and-drop move/resize
- Meeting responses (accept/tentative/decline)
- Local SQLite cache with configurable periodic sync
- Desktop reminder popup with snooze/dismiss and meeting join
- System tray integration
- React 19 renderer with month/week/day views and mini calendar
- Internationalization (English/Italian)
- Auto-updates via GitHub Releases (stable/prerelease channels)

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
   - `User.Read`, `Calendars.ReadWrite`, `MailboxSettings.Read`
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

## Notes

- Targets Microsoft 365 work/school accounts only.
- `AADSTS500113` means the Entra app registration is missing the localhost redirect or public client flows are disabled.
- Shared/delegate calendars are not implemented.
- Recurring events and attendee-managed meetings are shown but edited as read-only, with an Outlook handoff.
- Build Windows installers on native Windows or CI (WSL2 is not suitable).
- Auto-updates use GitHub Releases and are user-initiated from `Settings > Sync`.
- Publishing updates requires a `GH_TOKEN` with repository release permissions.
