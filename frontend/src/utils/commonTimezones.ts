/** Common IANA timezones for schedule forms (connectors, agent cron, etc.). */
export const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
] as const;

export function timezoneSelectOptions(selected?: string | null): string[] {
  const set = new Set<string>(COMMON_TIMEZONES);
  const tz = selected?.trim();
  if (tz) set.add(tz);
  return [...set];
}
