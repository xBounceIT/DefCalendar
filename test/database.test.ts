import { describe, expect, it, vi } from "vitest";

import AppDatabase from "../src/main/db/database";

describe("database", () => {
  it("clears only the signed-out account data with parameterized statements", () => {
    const targetAccountId = "account-1'; DELETE FROM settings; --";
    const exec = vi.fn();
    const runs = new Map<string, ReturnType<typeof vi.fn>>();
    const alls = new Map<string, ReturnType<typeof vi.fn>>();
    const prepare = vi.fn((sql: string) => {
      const run = vi.fn();
      const all = vi.fn();
      if (sql === "SELECT id FROM calendars WHERE home_account_id = ?") {
        all.mockReturnValue([{ id: "calendar-%_1" }]);
      }
      runs.set(sql, run);
      alls.set(sql, all);
      return { all, run };
    });
    const transaction = vi.fn((execute: (accountId: string) => void) => execute);

    const db = Object.create(AppDatabase.prototype) as AppDatabase;

    (
      db as unknown as {
        db: {
          exec: typeof exec;
          prepare: typeof prepare;
          transaction: typeof transaction;
        };
      }
    ).db = {
      exec,
      prepare,
      transaction,
    };

    db.clearUserData(targetAccountId);

    expect(exec).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledOnce();

    const preparedSql = prepare.mock.calls.map(([sql]) => sql);
    expect(preparedSql).toStrictEqual([
      "SELECT id FROM calendars WHERE home_account_id = ?",
      String.raw`DELETE FROM notification_state WHERE dedupe_key LIKE ? ESCAPE '\'`,
      "DELETE FROM sync_state WHERE calendar_id IN (SELECT id FROM calendars WHERE home_account_id = ?)",
      "DELETE FROM events WHERE calendar_id IN (SELECT id FROM calendars WHERE home_account_id = ?)",
      "DELETE FROM calendars WHERE home_account_id = ?",
      "DELETE FROM accounts WHERE home_account_id = ?",
    ]);
    expect(preparedSql.filter((sql) => sql.includes(targetAccountId))).toHaveLength(0);
    expect(alls.get("SELECT id FROM calendars WHERE home_account_id = ?")).toHaveBeenCalledWith(
      targetAccountId,
    );
    expect(
      runs.get(String.raw`DELETE FROM notification_state WHERE dedupe_key LIKE ? ESCAPE '\'`),
    ).toHaveBeenCalledWith(String.raw`calendar-\%\_1:%`);
    expect(
      runs.get(
        "DELETE FROM sync_state WHERE calendar_id IN (SELECT id FROM calendars WHERE home_account_id = ?)",
      ),
    ).toHaveBeenCalledWith(targetAccountId);
    expect(
      runs.get(
        "DELETE FROM events WHERE calendar_id IN (SELECT id FROM calendars WHERE home_account_id = ?)",
      ),
    ).toHaveBeenCalledWith(targetAccountId);
    expect(runs.get("DELETE FROM calendars WHERE home_account_id = ?")).toHaveBeenCalledWith(
      targetAccountId,
    );
    expect(runs.get("DELETE FROM accounts WHERE home_account_id = ?")).toHaveBeenCalledWith(
      targetAccountId,
    );
  });

  it("reads calendar ownership from database columns for legacy payloads", () => {
    const prepare = vi.fn((sql: string) => {
      if (!sql.includes("FROM calendars")) {
        throw new Error(`Unexpected SQL: ${sql}`);
      }

      return {
        all: vi.fn().mockReturnValue([
          {
            can_edit: 1,
            can_share: 0,
            color: "#5b7cfa",
            home_account_id: "account-1",
            id: "calendar-1",
            is_default_calendar: 1,
            name: "Primary",
            owner_address: "user@example.com",
            owner_name: "Test User",
            payload_json: JSON.stringify({
              canEdit: true,
              canShare: false,
              color: "#5b7cfa",
              id: "calendar-1",
              isDefaultCalendar: true,
              isVisible: true,
              name: "Primary",
              ownerAddress: "user@example.com",
              ownerName: "Test User",
            }),
          },
        ]),
      };
    });

    const db = Object.create(AppDatabase.prototype) as AppDatabase;
    (db as unknown as { db: { prepare: typeof prepare } }).db = { prepare };

    expect(db.listCalendars()).toStrictEqual([
      {
        canEdit: true,
        canShare: false,
        color: "#5b7cfa",
        homeAccountId: "account-1",
        id: "calendar-1",
        isDefaultCalendar: true,
        isVisible: true,
        name: "Primary",
        ownerAddress: "user@example.com",
        ownerName: "Test User",
      },
    ]);
  });
});
