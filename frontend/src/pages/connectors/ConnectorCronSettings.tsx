import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConnectorSyncSchedule } from '../../data/connectorsApi';
import { dailyCronFromForm, type SyncScheduleFormState } from './connectorScheduleUtils';

const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDateTime(iso: string | null | undefined, timezone: string, dash: string): string {
  if (!iso) return dash;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone || 'UTC',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ConnectorCronSettings({
  value,
  onChange,
  savedSchedule,
  readOnly,
}: {
  value: SyncScheduleFormState;
  onChange: (next: SyncScheduleFormState) => void;
  savedSchedule: ConnectorSyncSchedule | null | undefined;
  readOnly: boolean;
}) {
  const { t } = useTranslation('console');
  const dash = t('connectors.dash');

  const timeValue = `${pad2(value.hour)}:${pad2(value.minute)}`;
  const cronPreview = value.enabled ? dailyCronFromForm(value) : null;

  const timezoneOptions = useMemo(() => {
    const set = new Set(COMMON_TIMEZONES);
    if (value.timezone) set.add(value.timezone);
    return [...set];
  }, [value.timezone]);

  return (
    <div className="connector-cron-settings">
      <p className="console-modal-hint">{t('connectors.cronHint')}</p>

      <label className="console-modal-checkbox-row">
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={readOnly}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        <span>{t('connectors.cronEnabled')}</span>
      </label>

      <div className={`connector-cron-fields${!value.enabled ? ' connector-cron-fields--disabled' : ''}`}>
        <div className="console-form-field">
          <label htmlFor="connector-cron-time">{t('connectors.cronTime')}</label>
          <input
            id="connector-cron-time"
            type="time"
            className="console-form-control"
            value={timeValue}
            disabled={readOnly || !value.enabled}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':').map((x) => Number(x));
              if (Number.isFinite(h) && Number.isFinite(m)) {
                onChange({ ...value, hour: h, minute: m });
              }
            }}
          />
        </div>
        <div className="console-form-field">
          <label htmlFor="connector-cron-timezone">{t('connectors.cronTimezone')}</label>
          <select
            id="connector-cron-timezone"
            className="console-form-control"
            value={value.timezone}
            disabled={readOnly || !value.enabled}
            onChange={(e) => onChange({ ...value, timezone: e.target.value })}
          >
            {timezoneOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </div>

      {value.enabled && cronPreview ? (
        <p className="console-modal-hint connector-cron-cron-preview">
          {t('connectors.cronExpression', { cron: cronPreview })}
        </p>
      ) : null}

      {savedSchedule?.enabled && savedSchedule.next_run_at ? (
        <dl className="connector-cron-status">
          <div>
            <dt>{t('connectors.cronNextRun')}</dt>
            <dd>{formatDateTime(savedSchedule.next_run_at, value.timezone, dash)}</dd>
          </div>
        </dl>
      ) : null}

      {savedSchedule?.last_run_at ? (
        <dl className="connector-cron-status">
          <div>
            <dt>{t('connectors.cronLastRun')}</dt>
            <dd>{formatDateTime(savedSchedule.last_run_at, value.timezone, dash)}</dd>
          </div>
          {savedSchedule.last_status ? (
            <div>
              <dt>{t('connectors.cronLastStatus')}</dt>
              <dd>{savedSchedule.last_status}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
