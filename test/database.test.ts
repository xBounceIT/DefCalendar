import { describe, expect, it, vi } from "vitest";

import AppDatabase from "../src/main/db/database";

describe("database", () => {
  it("clears user data with parameterized statements", () => {
    const targetAccountId = "account-1'; DELETE FROM settings; --";
    const exec = vi.fn();
    const runs = new Map<string, ReturnType<typeof vi.fn>>();
    const prepare = vi.fn((sql: string) => {
      const run = vi.fn();
      runs.set(sql, run);
      return { run };
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
      "DELETE FROM notification_state",
      "DELETE FROM sync_state WHERE calendar_id IN (SELECT id FROM calendars WHERE home_account_id = ?)",
      "DELETE FROM events WHERE calendar_id IN (SELECT id FROM calendars WHERE home_account_id = ?)",
      "DELETE FROM calendars WHERE home_account_id = ?",
      "DELETE FROM accounts WHERE home_account_id = ?",
    ]);
    expect(preparedSql.filter((sql) => sql.includes(targetAccountId))).toHaveLength(0);
    expect(runs.get("DELETE FROM notification_state")).toHaveBeenCalledWith();
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
});
