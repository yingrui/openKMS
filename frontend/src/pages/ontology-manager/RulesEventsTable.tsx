/**
 * Events table — one row per occurrence, with the three moves a person actually makes.
 *
 * Its own file for two reasons: the list page already renders one row-action group (the rules table),
 * and the same table is reused by the rule detail page. The rows are ontology objects, so this is a
 * view over `Event`, not a second store.
 */

import { useTranslation } from 'react-i18next';
import { BellRing, CheckCircle2, XCircle } from 'lucide-react';
import {
  StatusChip,
  TableRowActionButton,
  TableRowActionCell,
  TableRowActions,
} from '../../styles/design-system';
import type { EventOut } from '../../data/eventsApi';
import '../../styles/rules.scss';

function severityTone(severity: string | null): 'warn' | 'accent' | 'neutral' {
  if (severity === 'P0') return 'warn';
  if (severity === 'P1') return 'accent';
  return 'neutral';
}

function stateTone(status: string | null): 'ok' | 'warn' | 'neutral' | 'accent' {
  if (status === 'resolved') return 'ok';
  if (status === 'acknowledged') return 'accent';
  if (status === 'dismissed') return 'neutral';
  return 'warn';
}

export function RulesEventsTable({
  events,
  busyEventId,
  onTransition,
  showPeriod = true,
}: {
  events: EventOut[];
  busyEventId: string | null;
  onTransition: (event: EventOut, status: 'acknowledged' | 'resolved' | 'dismissed') => void;
  showPeriod?: boolean;
}) {
  const { t } = useTranslation('ontology');
  return (
    <div className="ds-table-wrap ds-table-wrap--flush">
      <table className="console-table">
        <thead>
          <tr>
            <th>{t('rules.colEvent')}</th>
            {showPeriod ? <th>{t('rules.colPeriod')}</th> : null}
            <th>{t('rules.colSeverity')}</th>
            <th>{t('rules.colState')}</th>
            <TableRowActionCell as="th">{t('shared.actions')}</TableRowActionCell>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const closed = Boolean(event.event_end_time);
            return (
              <tr key={event.id}>
                <td>
                  <span className="rules-event-title">{event.title ?? '—'}</span>
                  {event.description ? (
                    <span className="rules-event-advice">{event.description}</span>
                  ) : null}
                </td>
                {showPeriod ? (
                  <td className="rules-condition">
                    {event.period_start || '—'}
                    {event.scope ? (
                      <span className="rules-event-scope"> · {event.scope.slice(0, 8)}</span>
                    ) : null}
                  </td>
                ) : null}
                <td>
                  <StatusChip tone={severityTone(event.severity)}>{event.severity ?? '—'}</StatusChip>
                </td>
                <td>
                  <StatusChip tone={stateTone(event.status)}>{event.status ?? '—'}</StatusChip>
                  <span className="rules-last-run">
                    {event.event_start_time ? new Date(event.event_start_time).toLocaleString() : '—'}
                  </span>
                </td>
                <TableRowActionCell>
                  <TableRowActions>
                    <TableRowActionButton
                      title={t('rules.acknowledge')}
                      aria-label={t('rules.acknowledge')}
                      icon={<BellRing size={16} aria-hidden />}
                      disabled={closed || event.status === 'acknowledged'}
                      loading={busyEventId === event.id}
                      onClick={() => onTransition(event, 'acknowledged')}
                    />
                    <TableRowActionButton
                      title={t('rules.resolve')}
                      aria-label={t('rules.resolve')}
                      icon={<CheckCircle2 size={16} aria-hidden />}
                      disabled={closed}
                      onClick={() => onTransition(event, 'resolved')}
                    />
                    <TableRowActionButton
                      title={t('rules.dismiss')}
                      aria-label={t('rules.dismiss')}
                      icon={<XCircle size={16} aria-hidden />}
                      variant="danger"
                      disabled={closed}
                      onClick={() => onTransition(event, 'dismissed')}
                    />
                  </TableRowActions>
                </TableRowActionCell>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
