import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchQualityIssues, type QualityIssue } from '../../data/qualityApi';
import { EmptyState, StatusChip, type StatusTone } from '../../styles/design-system';
import { DatasetAppTabs } from '../../components/ontology/DatasetAppTabs';
import { ageOf } from './reportAge';
import '../ontology/ontology-admin.scss';

/** The three states worth telling apart: broken, unable to judge, never judged. */
const TONE: Record<string, StatusTone> = { failed: 'warn', error: 'warn', never: 'neutral', passed: 'ok' };
type Filter = 'all' | 'failing' | 'never';

/**
 * Every rule that is not passing, across datasets — the inbox.
 *
 * Fixing a rule happens on its dataset's Quality tab; *noticing* one is this page's job, because
 * nobody opens thirteen datasets to find out whether anything is broken. It reads with `data:read`
 * and the API filters by dataset ACL, so it shows exactly the datasets the reader may see.
 */
export function QualityIssuesPage() {
  const { t } = useTranslation('ontology');
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    let cancelled = false;
    void fetchQualityIssues()
      .then((page) => {
        if (!cancelled) setIssues(page.items);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : t('datasets.loadFailed')))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const failing = issues.filter((i) => i.status === 'failed' || i.status === 'error');
  const never = issues.filter((i) => i.status === 'never');
  // Derived inside the memo, so the dependencies are the whole truth.
  const shown = useMemo(() => {
    if (filter === 'failing') return issues.filter((i) => i.status === 'failed' || i.status === 'error');
    if (filter === 'never') return issues.filter((i) => i.status === 'never');
    return issues;
  }, [filter, issues]);

  const ageLabel = (at: string | null) => {
    if (!at) return t('qualityIssues.neverRun');
    const age = ageOf(at);
    if (!age) return t('datasets.dash');
    return age.bucket === 'just_now'
      ? t('shared.age_just_now')
      : t(`shared.age_${age.bucket}`, { count: age.count });
  };

  return (
    <div className="ontology-admin">
      <header className="page-header">
        <div>
          <h1>{t('qualityIssues.title')}</h1>
          <p className="page-subtitle">{t('qualityIssues.subtitle')}</p>
        </div>
      </header>
      <DatasetAppTabs />
      <div className="ontology-admin-content">
        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : issues.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={48} strokeWidth={1} />}
            title={t('qualityIssues.empty')}
            description={t('qualityIssues.emptyHint')}
          />
        ) : (
          <>
            <div className="console-datasets-toolbar">
              <span className="openkms-flex-row-gap">
                <span className="page-subtitle">
                  {t('qualityIssues.summary', { failing: failing.length, total: issues.length })}
                </span>
                {never.length > 0 && (
                  <StatusChip tone="neutral">
                    {t('qualityIssues.neverCount', { count: never.length })}
                  </StatusChip>
                )}
              </span>
              <label className="console-datasets-filter">
                {t('qualityIssues.filter')}
                {/* ds-control-exempt: `.console-datasets-filter` styles this select (its own sheet) */}
                <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                  <option value="all">{t('qualityIssues.filterAll')}</option>
                  <option value="failing">{t('qualityIssues.filterFailing')}</option>
                  <option value="never">{t('qualityIssues.filterNever')}</option>
                </select>
              </label>
            </div>
            <div className="ds-table-wrap">
              <table className="console-table">
                <thead>
                  <tr>
                    <th>{t('qualityIssues.dataset')}</th>
                    <th>{t('qualityIssues.rule')}</th>
                    <th>{t('qualityIssues.status')}</th>
                    <th>{t('qualityIssues.numbers')}</th>
                    <th>{t('qualityIssues.lastRun')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((issue) => (
                    <tr key={issue.id}>
                      <td>
                        {/* The fix lives on the dataset's Quality tab; this is where you notice it. */}
                        <Link
                          to={`/datasets/${issue.dataset_id}/quality`}
                          className="console-table-link"
                        >
                          {issue.dataset_name}
                        </Link>
                      </td>
                      <td>
                        {issue.name}
                        <p className="page-subtitle">
                          {issue.rule_type}
                          {issue.column_name ? ` · ${issue.column_name}` : ''}
                          {issue.severity === 'critical' ? ` · ${t('qualityIssues.critical')}` : ''}
                        </p>
                      </td>
                      <td>
                        <StatusChip tone={TONE[issue.status] ?? 'neutral'}>
                          {t(`qualityIssues.status_${issue.status}`)}
                        </StatusChip>
                      </td>
                      <td>
                        {issue.status === 'passed' ? (
                          <span className="page-subtitle">
                            {t('qualityIssues.checked', { count: issue.checked_count ?? 0 })}
                          </span>
                        ) : issue.failed_count != null && issue.checked_count ? (
                          <span>
                            {t('qualityIssues.failedOfChecked', {
                              failed: issue.failed_count,
                              checked: issue.checked_count,
                            })}
                          </span>
                        ) : (
                          <span className="page-subtitle">{t('datasets.dash')}</span>
                        )}
                      </td>
                      <td>
                        <span title={issue.last_run_at ?? undefined}>{ageLabel(issue.last_run_at)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
