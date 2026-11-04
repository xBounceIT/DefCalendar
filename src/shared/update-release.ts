export function buildReleaseUrl(version: string): string {
  const tag = version.startsWith("v") ? version : `v${version}`;
  return `https://github.com/xBounceIT/DefCalendar/releases/tag/${encodeURIComponent(tag)}`;
}
