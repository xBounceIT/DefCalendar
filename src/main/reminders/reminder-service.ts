import type AppDatabase from "@main/db/database";
import { Notification } from "electron";

class ReminderService {
  private readonly db: AppDatabase;
  private timer: NodeJS.Timeout | null = null;

  constructor(db: AppDatabase) {
    this.db = db;
  }

  start(): void {
    if (this.timer) {
      return;
    }

    void this.checkNow();
    this.timer = setInterval(() => {
      void this.checkNow();
    }, 60_000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async checkNow(): Promise<void> {
    if (!Notification.isSupported()) {
      return;
    }

    const now = Date.now();
    const lookAhead = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    const lookBack = new Date(now - 60 * 60 * 1000).toISOString();
    const dueWindowStart = now - 90_000;
    const dueWindowEnd = now + 60_000;

    const candidates = this.db.listReminderCandidates(lookBack, lookAhead);
    for (const event of candidates) {
      if (event.isReminderOn && event.reminderMinutesBeforeStart !== null) {
        const reminderAt =
          new Date(event.start).getTime() - event.reminderMinutesBeforeStart * 60_000;
        const isDue = reminderAt >= dueWindowStart && reminderAt <= dueWindowEnd;

        if (isDue) {
          const dedupeKey = `${event.calendarId}:${event.id}:${event.start}`;
          if (!this.db.hasNotificationFired(dedupeKey)) {
            const bodyParts = [event.location, formatTime(event.start)];
            new Notification({
              title: event.subject,
              body: bodyParts.filter(Boolean).join(" · ") || "Exchange 365 reminder",
              silent: false,
            }).show();

            this.db.markNotificationFired(dedupeKey);
          }
        }
      }
    }

    this.db.pruneNotificationState(new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString());
  }
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default ReminderService;
