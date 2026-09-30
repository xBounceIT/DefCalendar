import { useEffect, useMemo, useRef, useState } from "react";
import {
  AVAILABILITY_RESPONSE_TIMEOUT_MS,
  type AttendeeAvailability,
  type AttendeeAvailabilityArgs,
} from "@shared/attendee-availability";
import { getAvailabilityInRange } from "../meeting-planner";

type LoadAvailability = (args: AttendeeAvailabilityArgs) => Promise<AttendeeAvailability[]>;
interface CachedAvailability {
  args: AttendeeAvailabilityArgs;
  items: AttendeeAvailability[];
  updatedAt: number;
}
const CACHE_TTL_MS = 30_000;
const MAX_CACHED_REQUESTS = 8;

function findRecentAvailability(cache: Map<string, CachedAvailability>, key: string) {
  function recent(item: CachedAvailability) {
    return Date.now() - item.updatedAt < CACHE_TTL_MS;
  }
  const exact = cache.get(key);
  if (exact && recent(exact)) {
    return exact;
  }
  const args = JSON.parse(key) as AttendeeAvailabilityArgs;
  if (!args.includeSchedule) {
    return null;
  }
  const start = Date.parse(args.start),
    end = Date.parse(args.end);
  const saved = [...cache.values()].findLast(
    (item) =>
      recent(item) &&
      item.args.includeSchedule &&
      item.args.emails.join(";") === args.emails.join(";") &&
      args.emails.every((email) => {
        const schedule = item.items.find((person) => person.email === email)?.schedule;
        return schedule && Date.parse(schedule.start) <= start && Date.parse(schedule.end) >= end;
      }),
  );
  return saved
    ? {
        ...saved,
        items: saved.items.map((item) => ({
          ...item,
          status: getAvailabilityInRange(item, start, end),
        })),
      }
    : null;
}

function useAttendeeAvailability(
  args: AttendeeAvailabilityArgs | null,
  load: LoadAvailability,
  refreshMs = 0,
) {
  const key = args ? JSON.stringify(args) : null;
  const cache = useMemo(() => {
    return new Map<string, CachedAvailability>();
  }, [load, args?.calendarId]);
  const previousCache = useRef<typeof cache | null>(null);
  const [refresh, setRefresh] = useState(0);
  const previousRefresh = useRef(refresh);
  const [result, setResult] = useState<{
    key: string;
    items: AttendeeAvailability[];
    cache: typeof cache;
  } | null>(null);
  const recent = key ? findRecentAvailability(cache, key) : null;

  useEffect(() => {
    const periodicRefresh = previousRefresh.current !== refresh;
    previousRefresh.current = refresh;
    setResult((previous) => (previous?.key === key && previous.cache === cache ? previous : null));
    if (!key) {
      cache.clear();
      previousCache.current = null;
      return;
    }
    const immediate = previousCache.current !== cache;
    const saved = findRecentAvailability(cache, key);
    if (!periodicRefresh && saved) {
      setResult({ key, items: saved.items, cache });
      return;
    }
    let cancelled = false;
    let deadlineTimer: ReturnType<typeof globalThis.setTimeout> | undefined = undefined;
    const finish = (items: AttendeeAvailability[], reusable = false) => {
      if (cancelled) {
        return;
      }
      cancelled = true;
      globalThis.clearTimeout(deadlineTimer);
      if (reusable && items.length && !items.some((item) => item.error === "requestFailed")) {
        cache.delete(key);
        cache.set(key, {
          args: JSON.parse(key) as AttendeeAvailabilityArgs,
          items,
          updatedAt: Date.now(),
        });
        if (cache.size > MAX_CACHED_REQUESTS) {
          cache.delete(cache.keys().next().value!);
        }
      }
      setResult({
        key,
        items,
        cache,
      });
    };
    const timer = globalThis.setTimeout(
      () => {
        previousCache.current = cache;
        deadlineTimer = globalThis.setTimeout(() => finish([]), AVAILABILITY_RESPONSE_TIMEOUT_MS);
        void Promise.resolve()
          .then(() => (cancelled ? [] : load(JSON.parse(key) as AttendeeAvailabilityArgs)))
          .then(
            (items) => finish(items, true),
            () => finish([]),
          );
      },
      immediate ? 0 : 300,
    );
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
      globalThis.clearTimeout(deadlineTimer);
    };
  }, [key, load, refresh, cache]);

  useEffect(() => {
    if (!key || !refreshMs) {
      return;
    }
    const timer = globalThis.setInterval(() => {
      if (document.visibilityState !== "hidden") {
        setRefresh((value) => value + 1);
      }
    }, refreshMs);
    return () => globalThis.clearInterval(timer);
  }, [key, refreshMs]);

  const current = key && result?.key === key && result.cache === cache ? result : recent;
  return {
    items: current?.items ?? [],
    loading: Boolean(key && !current),
  };
}

export default useAttendeeAvailability;
