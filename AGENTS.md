# AGENTS.md

## Project Overview

DefCalendar - Electron desktop calendar app for Microsoft 365 Exchange Online.

## Tech Stack

- Electron + electron-vite + TypeScript
- React 19 + FullCalendar + Zustand + TanStack Query
- better-sqlite3 (local cache), MSAL Node (auth), Microsoft Graph API
- i18next for internationalization (en/it locales)

## Project Structure

- `src/main/` - Electron main process (auth, db, sync, reminders, tray, window)
- `src/preload/` - IPC bridge between main and renderer
- `src/renderer/` - React UI components and state management
- `src/shared/` - Shared types, utilities, and IPC channel definitions
- `test/` - Vitest test files

## Commands

- `npm run lint` - Run oxlint
- `npm run lint:fix` - Auto-fix lint issues
- `npm run format` - Format code with oxfmt
- `npm run format:check` - Check formatting without changes
- `npm run test` - Run Vitest tests
- `npm run test:watch` - Run tests in watch mode
- `npm run dev` - Start development server
- `npm run build` - Build for production

## Code Style

- TypeScript strict mode enabled
- oxlint for linting; `no-console` is an error
- **DO NOT add comments** unless explicitly requested
- Path aliases: `@main/*`, `@preload/*`, `@renderer/*`, `@shared/*`
- Import order: external packages first, then internal aliases

## Git Commit Standards

- Use conventional commit format: `type: description`
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`, `perf`
- Write concise, imperative descriptions (e.g., "add dark mode toggle" not "added dark mode toggle")
- Reference issues when applicable (e.g., `fix: resolve auth timeout #123`)

## Architecture Notes

- Main process handles: authentication (MSAL), database (SQLite), calendar sync, reminders, system tray
- Renderer uses Zustand for client state, TanStack Query for server/cache state
- IPC communication via channels defined in `src/shared/ipc-values.ts`
- Calendar event types defined in `src/shared/calendar.ts`
- Settings persisted via `SettingsService` in main process