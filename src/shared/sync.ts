const DEFAULT_SYNC_LOOK_AHEAD_DAYS = 90;
const DEFAULT_SYNC_LOOK_BEHIND_DAYS = 365;

interface SyncWindowDays {
  lookAheadDays: number;
  lookBehindDays: number;
}

const DEFAULT_SYNC_WINDOW_DAYS: SyncWindowDays = {
  lookAheadDays: DEFAULT_SYNC_LOOK_AHEAD_DAYS,
  lookBehindDays: DEFAULT_SYNC_LOOK_BEHIND_DAYS,
};

export {
  DEFAULT_SYNC_LOOK_AHEAD_DAYS,
  DEFAULT_SYNC_LOOK_BEHIND_DAYS,
  DEFAULT_SYNC_WINDOW_DAYS,
  type SyncWindowDays,
};
