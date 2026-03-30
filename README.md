# Project Calendar

Electron desktop calendar app for Microsoft 365 Exchange Online with:

- system-browser Microsoft sign-in via `@azure/msal-node`
- read/write access to the signed-in user's own Exchange calendars
- local SQLite cache for fast startup
- tray presence and desktop reminders
- React + TypeScript renderer with month/week/day calendar views

## Stack

- Electron
- electron-vite
- React
- TypeScript
- Microsoft Graph
- better-sqlite3
- FullCalendar

## Local Setup

1. Register a Microsoft Entra application for Project Calendar.
2. Point `src/main/auth/app-registration.ts` at your public-client app registration, or use `MSAL_CLIENT_ID` only as a development override.
3. Configure the app for accounts in any organizational directory.
4. Enable the public client desktop/mobile flow.
5. Under `Authentication > Add a platform`, add `Mobile and desktop applications` with the exact redirect URI `http://localhost`.
6. Grant delegated Microsoft Graph permissions:
   - `openid`
   - `profile`
   - `offline_access`
   - `User.Read`
   - `Calendars.ReadWrite`
   - `MailboxSettings.Read`
7. Use `.env.example` only for optional development overrides; packaged end users should use the bundled app registration instead of tenant/client env setup.
8. If you need tenant-specific development behavior, override `MSAL_AUTHORITY`; do not rely on a separate tenant ID or redirect URI setting.

## Scripts

- `npm run dev`: start the Electron app in development mode
- `npm run lint`: run the Oxlint lint + type-check gate for main/preload/renderer/tests
- `npm run lint:fix`: apply Oxlint autofixes where available
- `npm run test`: run the Vitest suite
- `npm run build`: compile main, preload, and renderer output into `out/`
- `npm run package`: compile the app and create an unpacked distributable
- `npm run dist`: create installer artifacts with `electron-builder`
- `npm run dist:publish`: create installer artifacts and publish a GitHub Release update

## Notes

- The current scaffold targets Microsoft 365 work/school accounts only.
- Multitenant rollouts work best with publisher verification; otherwise some tenants will require admin approval before users can connect.
- `@azure/msal-node` uses a loopback `http://localhost:{port}` redirect for this system-browser flow. Microsoft Entra matches localhost redirects without requiring a fixed port, so the app registration only needs `http://localhost`.
- If sign-in fails with `AADSTS500113`, the Entra app registration is missing that localhost mobile/desktop redirect or public client flows are disabled.
- If the window opens blank, the preload script failed to load; the app now surfaces that as a startup error instead of an empty shell.
- Shared/delegate calendars are not implemented in this version.
- Recurring events and attendee-managed meetings are shown but edited as read-only, with an Outlook handoff.
- On WSL2, native Windows packaging is not the right verification environment. Build Windows installers on native Windows or CI.
- Auto-updates use GitHub Releases and are user-initiated from `Settings > Sync`.
- Publishing updates requires a `GH_TOKEN` environment variable with repository release permissions.
