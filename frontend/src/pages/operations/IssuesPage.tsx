import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Bot, CircleSlash, ShieldAlert, ThumbsDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchWorkforceAgents,
  fetchWorkforceIssues,
  updateWorkforceIssue,
  type WorkforceAgentResponse,
  type WorkforceIssue,
} from '../../data/workforceApi';
import { Dialog, FilterSelect, FormField, ListToolbar, StatusChip } from '../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from '../shared/EntityViewShell';
import './operations.scss';

type StatusFilter = 'open' | 'resolved' | 'ignored';

/**
 * Operations › Issues: the problems that need a person.
 *
 * Two sources write here today — a reader pressing 👎, and the answer policy refusing a question — and Guardrails will
 * write the third group (violations, risk, prompt-injection attempts). The page is a work queue, not a dashboard: one
 * row per case, three statuses, and a sentence saying what was done before it can be closed.
 *
 * The agent table under it is read-only status plus pause and delete: stopping a service is an operational act, and it
 * does not belong on the screen where an agent is configured.
 */
export function IssuesPage() {
  const { t } = useTranslation('operations');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [agentFilter, setAgentFilter] = useState('');
  const [issues, setIssues] = useState<WorkforceIssue[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [agents, setAgents] = useState<WorkforceAgentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState<WorkforceIssue | null>(null);
  const [closingStatus, setClosingStatus] = useState<'resolved' | 'ignored'>('resolved');
  const [resolution, setResolution] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [queue, fleet] = await Promise.all([
        fetchWorkforceIssues({ status, agentId: agentFilter || undefined, limit: 100 }),
        fetchWorkforceAgents({ limit: 200 }),
      ]);
      setIssues(queue.items);
      setCounts(queue.counts);
      setAgents(fleet.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('queue.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [status, agentFilter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const startClose = (issue: WorkforceIssue, next: 'resolved' | 'ignored') => {
    setClosing(issue);
    setClosingStatus(next);
    setResolution('');
  };

  const submitClose = async () => {
    if (!closing) return;
    if (closingStatus === 'resolved' && !resolution.trim()) {
      toast.error(t('queue.resolutionRequired'));
      return;
    }
    setSaving(true);
    try {
      await updateWorkforceIssue(closing.id, {
        status: closingStatus,
        resolution: resolution.trim() || null,
      });
      setClosing(null);
      toast.success(closingStatus === 'resolved' ? t('queue.resolvedToast') : t('queue.ignoredToast'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('queue.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const reopen = async (issue: WorkforceIssue) => {
    try {
      await updateWorkforceIssue(issue.id, { status: 'open', resolution: null });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('queue.saveFailed'));
    }
  };

  const openCount = counts.open ?? 0;

  return (
    <>
      <EntityViewHeader
        title={t('queue.title')}
        subtitle={t('queue.lead')}
        actions={
          <span className="page-subtitle">{t('queue.openCount', { count: openCount })}</span>
        }
      />
      {/* Filters narrow the list, so they sit above it — a row of their own, wide enough for Chinese labels. Inside the
          panel's actions slot they wrapped: three chips and a select do not fit the right-hand corner of a head. */}
      <ListToolbar>
        <div className="ops-filters" role="group" aria-label={t('queue.statusFilter')}>
          {(['open', 'resolved', 'ignored'] as StatusFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`ops-filter${status === key ? ' ops-filter--active' : ''}`}
              aria-pressed={status === key}
              onClick={() => setStatus(key)}
            >
              {t(`queue.status.${key}`)}
              {counts[key] ? <span className="ops-filter__count">{counts[key]}</span> : null}
            </button>
          ))}
        </div>
        <FilterSelect label={t('queue.agent')} value={agentFilter} onChange={setAgentFilter}>
          <option value="">{t('queue.allAgents')}</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </FilterSelect>
      </ListToolbar>

      <EntityViewPanel>
        {loading ? <p className="ds-resource-list-loading">{t('loading')}</p> : null}

        {!loading && issues.length === 0 ? (
          <p className="ops-empty">{t(`queue.empty.${status}`)}</p>
        ) : null}

        {!loading && issues.length > 0 ? (
          <ul className="ops-queue">
            {issues.map((issue) => (
              <li key={issue.id} className="ops-queue__item">
                <div className="ops-queue__head">
                  <span className="ops-queue__kind">
                    <IssueIcon kind={issue.kind} />
                    {t(`queue.kind.${issue.kind}`, { defaultValue: issue.kind })}
                  </span>
                  {issue.severity === 'high' ? (
                    <StatusChip tone="warn">{t('queue.high')}</StatusChip>
                  ) : null}
                  <span className="ops-queue__agent">
                    <Link to={`/workforce/${issue.agent_id}`}>{issue.agent_name || issue.agent_id}</Link>
                  </span>
                  <span className="ops-queue__when">
                    {new Date(issue.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="ops-queue__summary">{issue.summary}</p>
                {issue.detail ? <IssueDetail detail={issue.detail} t={t} /> : null}
                {issue.resolution ? (
                  <p className="ops-queue__resolution">
                    {issue.resolution}
                    {issue.resolved_by ? <span> — {issue.resolved_by}</span> : null}
                  </p>
                ) : null}
                <div className="ops-queue__actions">
                  {issue.status === 'open' ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => startClose(issue, 'resolved')}
                      >
                        {t('queue.resolve')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => startClose(issue, 'ignored')}
                      >
                        {t('queue.ignore')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void reopen(issue)}
                    >
                      {t('queue.reopen')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </EntityViewPanel>
      <Dialog
        open={closing !== null}
        onClose={() => setClosing(null)}
        title={closingStatus === 'resolved' ? t('queue.resolveTitle') : t('queue.ignoreTitle')}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setClosing(null)}>
              {t('queue.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={() => void submitClose()}
            >
              {saving ? t('queue.saving') : t('queue.confirm')}
            </button>
          </>
        }
      >
        <FormField
          label={t('queue.resolutionLabel')}
          hint={
            closingStatus === 'resolved'
              ? t('queue.resolutionHint')
              : t('queue.ignoreHint')
          }
        >
          <textarea
            className="ds-control"
            rows={4}
            value={resolution}
            placeholder={t('queue.resolutionPlaceholder')}
            onChange={(e) => setResolution(e.target.value)}
          />
        </FormField>
      </Dialog>
    </>
  );
}

function IssueIcon({ kind }: { kind: string }) {
  if (kind === 'negative_feedback') return <ThumbsDown size={14} aria-hidden />;
  if (kind === 'refusal') return <CircleSlash size={14} aria-hidden />;
  if (kind === 'prompt_injection' || kind === 'violation' || kind === 'risk') {
    return <ShieldAlert size={14} aria-hidden />;
  }
  return <Bot size={14} aria-hidden />;
}

/** The evidence: what was asked, what came back, and why it was flagged. */
function IssueDetail({
  detail,
  t,
}: {
  detail: Record<string, unknown>;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const text = (key: string): string =>
    typeof detail[key] === 'string' ? (detail[key] as string) : '';
  const rows: Array<[string, string]> = [
    [t('queue.question'), text('question')],
    [t('queue.answer'), text('answer')],
    [t('queue.reason'), text('reason')],
    [t('queue.voter'), text('voter')],
  ].filter(([, value]) => value) as Array<[string, string]>;

  if (rows.length === 0) return null;
  return (
    <dl className="ops-queue__detail">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
