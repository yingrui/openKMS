/**
 * Alerts, grouped by the rule that raised them, each row expandable to its evidence.
 *
 * Six scenarios of one broken check are one problem, so the list groups by rule: a header carries the rule
 * (linked), the metric it watches, and how many alerts are open. The row itself stays one line — scope,
 * period, severity, state — and a chevron opens what a triager actually needs: **the numbers the verdict was
 * computed from** (each operand, and the residual against the tolerance), the run time, and the rule link.
 *
 * The evidence was always in the payload and never shown; an alert you cannot inspect is a notification, not
 * something you can resolve.
 */
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronRight, XCircle } from 'lucide-react';
import {
  StatusChip,
  StatusLine,
  StatusLineNote,
  TableRowActionButton,
  TableRowActionCell,
  TableRowActions,
} from '../../../styles/design-system';
import type { EventOut } from '../../../data/eventsApi';
import { valueRows, type LabelLookups } from './rulesLabels';
import '../../../styles/rules.scss';

function severityTone(severity: string | null): 'warn' | 'accent' | 'neutral' {
  if (severity === 'P0') return 'warn';
  if (severity === 'P1') return 'accent';
  return 'neutral';
}

function stateTone(status: string | null): 'ok' | 'warn' | 'neutral' | 'accent' {
  if (status === 'resolved') return 'ok';
  if (status === 'dismissed') return 'neutral';
  return 'warn';
}

/** The group value as it appears in an alert: a scenario id, shortened; the label when the rule has one. */
function scopeText(event: EventOut): string {
  const group = (event.evidence?.group ?? null) as { label?: string; value?: string } | null;
  const value = String(group?.value ?? event.scope ?? '');
  if (!value) return '—';
  const short = value.length <= 12 ? value : `${value.slice(0, 8)}…`;
  return group?.label ? `${group.label} ${short}` : short;
}

function groupByRule(events: EventOut[]): Array<{ ruleId: string; events: EventOut[] }> {
  const groups = new Map<string, EventOut[]>();
  for (const event of events) {
    const key = event.rule_id ?? '';
    const bucket = groups.get(key);
    if (bucket) bucket.push(event);
    else groups.set(key, [event]);
  }
  return [...groups].map(([ruleId, bucket]) => ({ ruleId, events: bucket }));
}

export function RulesEventsTable({
  events,
  busyEventId,
  onTransition,
  showPeriod = true,
  grouped = false,
  ruleNames = {},
  metricNames = {},
  lookups,
}: {
  events: EventOut[];
  busyEventId: string | null;
  onTransition: (event: EventOut, status: 'resolved' | 'dismissed') => void;
  showPeriod?: boolean;
  /** Collapse the list by rule (the alerts tab); a rule's own page leaves it off. */
  grouped?: boolean;
  ruleNames?: Record<string, string>;
  metricNames?: Record<string, string>;
  lookups?: LabelLookups;
}) {
  const { t } = useTranslation('ontology');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const columnCount = showPeriod ? 4 : 3;
  const groups = grouped ? groupByRule(events) : [{ ruleId: '', events }];

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="ds-table-wrap ds-table-wrap--flush">
      <table className="console-table">
        <thead>
          <tr>
            <th>{t('rules.colEvent')}</th>
            {showPeriod ? <th>{t('rules.colPeriod')}</th> : null}
            {/* Severity and state are one fact about the alert: one column, one row. */}
            <th>{t('rules.colState')}</th>
            <TableRowActionCell as="th">{t('shared.actions')}</TableRowActionCell>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.ruleId || 'all'}>
              {grouped && group.ruleId ? (
                <tr className="rules-events-group">
                  <td colSpan={columnCount}>
                    <div className="rules-events-group__head">
                      <Link
                        to={`/data-rules/${group.events[0]?.rule_object_id ?? ''}`}
                        className="rules-events-group__name"
                      >
                        {ruleNames[group.ruleId] ?? group.ruleId}
                      </Link>
                      {group.events[0]?.subject_id ? (
                        <span className="rules-events-group__metric">
                          {metricNames[group.events[0].subject_id] ?? ''}
                        </span>
                      ) : null}
                      <span className="rules-events-group__count">
                        {t('rules.groupEventCount', { count: group.events.length })}
                      </span>
                      <span className="rules-events-group__scopes">
                        {group.events
                          .filter((event) => event.event_end_time === null)
                          .map((event) => scopeText(event))
                          .join(' · ')}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : null}
              {group.events.map((event) => {
                const closed = Boolean(event.event_end_time);
                const expanded = open.has(event.id);
                const evidence = (event.evidence ?? null) as {
                  values?: Record<string, number | null>;
                  group?: { label?: string; value?: string } | null;
                  rule_version?: number;
                  at?: string;
                  status_note?: string;
                } | null;
                const rows = evidence?.values && lookups ? valueRows(evidence.values, lookups) : [];
                const residual = evidence?.values?.residual;
                const tolerance = evidence?.values?.tolerance;
                return (
                  <Fragment key={event.id}>
                    <tr className={expanded ? 'rules-events-row is-open' : 'rules-events-row'}>
                      <td>
                        <button
                          type="button"
                          className="rules-events-row__toggle"
                          aria-expanded={expanded}
                          aria-label={t(expanded ? 'rules.hideEvidence' : 'rules.showEvidence')}
                          onClick={() => toggle(event.id)}
                        >
                          {expanded ? (
                            <ChevronDown size={16} aria-hidden />
                          ) : (
                            <ChevronRight size={16} aria-hidden />
                          )}
                          <span className="rules-event-title">{event.title ?? '—'}</span>
                        </button>
                        {event.description ? (
                          <span className="rules-event-advice">{event.description}</span>
                        ) : null}
                      </td>
                      {showPeriod ? (
                        <td className="rules-condition">
                          {event.period_label || event.period_start || '—'}
                          {event.scope ? (
                            <span className="rules-event-scope"> · {scopeText(event)}</span>
                          ) : null}
                        </td>
                      ) : null}
                      <td>
                        <StatusLine>
                          <StatusChip tone={severityTone(event.severity)}>
                            {event.severity ?? '—'}
                          </StatusChip>
                          <StatusChip tone={stateTone(event.status)}>
                            {event.status ? t(`rules.eventStatus.${event.status}`) : '—'}
                          </StatusChip>
                          <StatusLineNote>
                            {event.event_start_time
                              ? new Date(event.event_start_time).toLocaleString()
                              : '—'}
                          </StatusLineNote>
                        </StatusLine>
                      </td>
                      <TableRowActionCell>
                        <TableRowActions>
                          <TableRowActionButton
                            title={t('rules.resolve')}
                            aria-label={t('rules.resolve')}
                            icon={<CheckCircle2 size={16} aria-hidden />}
                            disabled={closed}
                            loading={busyEventId === event.id}
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
                    {expanded ? (
                      <tr className="rules-evidence">
                        <td colSpan={columnCount}>
                          <div className="rules-evidence__body">
                            <h4>{t('rules.evidenceTitle')}</h4>
                            {rows.length > 0 ? (
                              <ul className="rules-evidence__values">
                                {rows.map((row) => (
                                  <li key={row.label}>
                                    <span className="rules-values-label">{row.label}</span>
                                    <span className="rules-values-value">{row.value}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="page-subtitle">{t('rules.evidenceEmpty')}</p>
                            )}
                            {typeof residual === 'number' ? (
                              <p className="rules-evidence__residual">
                                {t('rules.evidenceResidual', {
                                  residual: residual.toLocaleString(undefined, {
                                    maximumFractionDigits: 4,
                                  }),
                                  tolerance: typeof tolerance === 'number' ? tolerance : '—',
                                })}
                              </p>
                            ) : null}
                            <p className="page-subtitle">
                              {t('rules.evidenceMeta', {
                                version: evidence?.rule_version ?? event.rule_version ?? 1,
                                at: evidence?.at
                                  ? new Date(evidence.at).toLocaleString()
                                  : event.event_start_time
                                    ? new Date(event.event_start_time).toLocaleString()
                                    : '—',
                              })}
                            </p>
                            {evidence?.status_note ? (
                              <p className="page-subtitle">{evidence.status_note}</p>
                            ) : null}
                            <Link
                              to={`/data-rules/${event.rule_object_id ?? ''}`}
                              className="rules-evidence__link"
                            >
                              {t('rules.openRule')}
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
