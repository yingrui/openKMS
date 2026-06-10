import type { ConnectorSyncSchedule } from '../../data/connectorsApi';

export type SyncScheduleFormState = {
  enabled: boolean;
  hour: number;
  minute: number;
  timezone: string;
};

const DEFAULT_HOUR = 15;
const DEFAULT_MINUTE = 5;

export function defaultSyncScheduleForm(timezone: string): SyncScheduleFormState {
  return {
    enabled: false,
    hour: DEFAULT_HOUR,
    minute: DEFAULT_MINUTE,
    timezone: timezone || 'UTC',
  };
}

function parseDailyCron(cron: string | null | undefined): { hour: number; minute: number } | null {
  if (!cron) return null;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minuteS, hourS, dom, month, dow] = parts;
  if (dom !== '*' || month !== '*' || dow !== '*') return null;
  const minute = Number(minuteS);
  const hour = Number(hourS);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export function parseSyncScheduleForm(
  schedule: ConnectorSyncSchedule | null | undefined,
  defaultTimezone: string
): SyncScheduleFormState {
  const base = defaultSyncScheduleForm(defaultTimezone);
  if (!schedule) return base;
  const daily = parseDailyCron(schedule.cron);
  return {
    enabled: schedule.enabled,
    hour: daily?.hour ?? base.hour,
    minute: daily?.minute ?? base.minute,
    timezone: schedule.timezone?.trim() || defaultTimezone || 'UTC',
  };
}

export function dailyCronFromForm(state: SyncScheduleFormState): string {
  return `${state.minute} ${state.hour} * * *`;
}

export function syncScheduleToSettingsPayload(state: SyncScheduleFormState): Record<string, unknown> {
  if (!state.enabled) {
    return {
      enabled: false,
      cron: null,
      timezone: state.timezone.trim() || 'UTC',
    };
  }
  return {
    enabled: true,
    cron: dailyCronFromForm(state),
    timezone: state.timezone.trim() || 'UTC',
  };
}

export function stripSyncScheduleFromSettings(
  settings: Record<string, unknown> | null | undefined
): Record<string, unknown> | null | undefined {
  if (!settings || typeof settings !== 'object') return settings;
  const { sync_schedule: _ignored, ...rest } = settings;
  return rest;
}
