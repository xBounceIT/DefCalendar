import type { QueryClient } from "@tanstack/react-query";
import type { CalendarApi } from "@shared/ipc";
import type { UserSettings, UserSettingsPatch } from "@shared/schemas";

function createSettingsUpdater(
  client: QueryClient,
  update: CalendarApi["settings"]["update"],
  fallback: UserSettings,
) {
  let pending: Promise<unknown> = Promise.resolve();
  return (patch: UserSettingsPatch, optimistic = true): Promise<boolean> => {
    const operation = pending.then(async () => {
      await client.cancelQueries({ queryKey: ["settings"] });
      const previous = client.getQueryData<UserSettings>(["settings"]) ?? fallback;
      if (optimistic) {
        client.setQueryData(["settings"], { ...previous, ...patch });
      }
      try {
        client.setQueryData(["settings"], await update(patch));
        return true;
      } catch {
        if (optimistic) {
          client.setQueryData(["settings"], previous);
        }
        return false;
      }
    });
    pending = operation.catch(() => undefined);
    return operation;
  };
}

export default createSettingsUpdater;
