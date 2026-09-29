import { useEffect, useState } from "react";
import {
  AVAILABILITY_RESPONSE_TIMEOUT_MS,
  type AttendeeAvailability,
  type AttendeeAvailabilityArgs,
} from "@shared/attendee-availability";

type LoadAvailability = (args: AttendeeAvailabilityArgs) => Promise<AttendeeAvailability[]>;

function useAttendeeAvailability(args: AttendeeAvailabilityArgs | null, load: LoadAvailability) {
  const key = args ? JSON.stringify(args) : null;
  const [result, setResult] = useState<{
    key: string;
    items: AttendeeAvailability[];
  } | null>(null);

  useEffect(() => {
    setResult(null);
    if (!key) {
      return;
    }
    let cancelled = false;
    let deadlineTimer: ReturnType<typeof globalThis.setTimeout> | undefined = undefined;
    const finish = (items: AttendeeAvailability[]) => {
      if (cancelled) {
        return;
      }
      cancelled = true;
      globalThis.clearTimeout(deadlineTimer);
      setResult({
        key,
        items,
      });
    };
    const timer = globalThis.setTimeout(() => {
      deadlineTimer = globalThis.setTimeout(() => finish([]), AVAILABILITY_RESPONSE_TIMEOUT_MS);
      void Promise.resolve()
        .then(() => load(JSON.parse(key) as AttendeeAvailabilityArgs))
        .then(finish, () => finish([]));
    }, 300);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
      globalThis.clearTimeout(deadlineTimer);
    };
  }, [key, load]);

  const current = key && result?.key === key ? result : null;
  return {
    items: current?.items ?? [],
    loading: Boolean(key && !current),
  };
}

export default useAttendeeAvailability;
