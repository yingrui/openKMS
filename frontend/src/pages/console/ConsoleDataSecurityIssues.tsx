import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { PERM_CONSOLE_GROUPS } from '../../config/permissions';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import {
  fetchDataResourcesMigrationReport,
  fetchResourceAclIssuesPage,
  fetchResourceAclIssuesSummary,
  RESOURCE_ACL_ISSUE_CRITICAL_ORDER,
  RESOURCE_ACL_ISSUE_REVIEW,
  type DataResourceMigrationReportOut,
  type ResourceAclIssueCode,
  type ResourceAclIssueItem,
  type ResourceAclIssuesSummaryOut,
} from '../../data/securityAdminApi';
import './ConsoleDataSecurityIssues.scss';

const PAGE_SIZE_OPTIONS = [5, 25, 50, 100] as const;

function resourceKey(item: ResourceAclIssueItem): string {
  return `${item.resource_type}:${item.resource_id}`;
}

function groupLabels(item: ResourceAclIssueItem, ids: string[]): string {
  if (!ids.length) return '—';
  return ids
    .map((id) => item.grants.find((g) => g.grantee_id === id)?.grantee_label ?? id)
    .join(', ');
}

function issueDetail(
  item: ResourceAclIssueItem,
  kind: ResourceAclIssueCode,
  notAssigned: string
): string {
  switch (kind) {
    case 'others_manage':
    case 'others_write':
    case 'others_read':
      return item.others_permissions ?? '—';
    case 'implicit_others':
      return item.inherited_others_permissions ?? '—';
    case 'unknown_group':
      return groupLabels(item, item.broken_group_ids);
    case 'empty_group':
      return groupLabels(item, item.empty_group_ids);
    case 'missing_owner':
      return notAssigned;
    case 'unknown_owner':
    case 'owner_no_manage': {
      const owner = item.grants.find((g) => g.grantee_type === 'user');
      return owner?.grantee_label ?? owner?.grantee_id ?? item.owner_label ?? '—';
    }
    case 'owner_no_permissions': {
      const owner = item.grants.find((g) => g.grantee_type === 'user');
      const name = owner?.grantee_label ?? owner?.grantee_id ?? item.owner_label ?? '—';
      return `${name} (${item.owner_permissions ?? '—'})`;
    }
    default:
      return '—';
  }
}

type IssueTableProps = {
  items: ResourceAclIssueItem[];
  expandedKey: string | null;
  onToggleReview: (key: string) => void;
  onSaved: () => void;
  issueKind: ResourceAclIssueCode;
  loading: boolean;
};

function IssueTable({
  items,
  expandedKey,
  onToggleReview,
  onSaved,
  issueKind,
  loading,
}: IssueTableProps) {
  const { t } = useTranslation('console');

  if (loading && items.length === 0) {
    return <p className="console-group-access-muted">{t('dataSecurityIssues.loading')}</p>;
  }

  if (!items.length) {
    return null;
  }

  return (
    <table className="console-dso-table">
      <thead>
        <tr>
          <th>{t('dataSecurityIssues.colType')}</th>
          <th>{t('dataSecurityIssues.colName')}</th>
          <th>{t('dataSecurityIssues.colDetail')}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const key = resourceKey(item);
          const isExpanded = expandedKey === key;
          return (
            <Fragment key={`${issueKind}-${key}`}>
              <tr>
                <td>{item.resource_type_label}</td>
                <td>{item.resource_label}</td>
                <td>{issueDetail(item, issueKind, t('dataSecurityIssues.notAssigned'))}</td>
                <td className="console-dso-actions">
                  <button type="button" className="btn-link" onClick={() => onToggleReview(key)}>
                    {isExpanded
                      ? t('dataSecurityIssues.hideSharing')
                      : t('dataSecurityIssues.fixSharing')}
                  </button>
                  {item.share_path && (
                    <>
                      {' · '}
                      <Link to={item.share_path} className="btn-link">
                        {t('dataSecurityIssues.openInApp')}
                      </Link>
                    </>
                  )}
                </td>
              </tr>
              {isExpanded && (
                <tr className="console-dso-detail-row">
                  <td colSpan={4}>
                    <ResourceSharePanel
                      resourceType={item.resource_type}
                      resourceId={item.resource_id}
                      title={t('dataSecurityIssues.sharingPanelTitle', { name: item.resource_label })}
                      consoleAudit
                      onSaved={onSaved}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

type IssuePaginationProps = {
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

function IssuePagination({
  total,
  page,
  pageSize,
  loading,
  onPageChange,
  onPageSizeChange,
}: IssuePaginationProps) {
  const { t } = useTranslation('console');
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
  const startRow = total > 0 ? page * pageSize + 1 : 0;
  const endRow = total > 0 ? Math.min((page + 1) * pageSize, total) : 0;

  if (total === 0) {
    return null;
  }

  return (
    <div className="console-dso-pagination">
      <div className="console-dso-pagination-info">
        <span>{t('datasetDetail.paginationRange', { start: startRow, end: endRow, total })}</span>
        <label>
          <span>{t('datasetDetail.pageSize')}</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={loading}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {totalPages > 1 && (
        <div className="console-dso-pagination-btns">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onPageChange(0)}
            disabled={page === 0 || loading}
            title={t('datasetDetail.firstPageTitle')}
          >
            «
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onPageChange(Math.max(0, page - 1))}
            disabled={page === 0 || loading}
          >
            {t('datasetDetail.previous')}
          </button>
          <span className="console-dso-page-nums">
            {t('datasetDetail.pageOf', { current: page + 1, total: totalPages })}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1 || loading}
          >
            {t('datasetDetail.next')}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onPageChange(totalPages - 1)}
            disabled={page >= totalPages - 1 || loading}
            title={t('datasetDetail.lastPageTitle')}
          >
            »
          </button>
        </div>
      )}
    </div>
  );
}

type IssueTypeSectionProps = {
  kind: ResourceAclIssueCode;
  expandedKey: string | null;
  onToggleReview: (key: string) => void;
  refreshToken: number;
  onSummaryUpdate: (summary: ResourceAclIssuesSummaryOut) => void;
  onSaved: () => void;
};

function IssueTypeSection({
  kind,
  expandedKey,
  onToggleReview,
  refreshToken,
  onSummaryUpdate,
  onSaved,
}: IssueTypeSectionProps) {
  const { t } = useTranslation('console');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [items, setItems] = useState<ResourceAclIssueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchResourceAclIssuesPage(kind, pageSize, page * pageSize);
      setItems(res.items);
      setTotal(res.total);
      onSummaryUpdate({
        issue_count: res.issue_count,
        by_issue: res.by_issue,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataSecurityIssues.toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [kind, page, pageSize, onSummaryUpdate, t]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  useEffect(() => {
    const maxPage = total > 0 ? Math.ceil(total / pageSize) - 1 : 0;
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [total, pageSize, page]);

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(0);
  };

  return (
    <section className="console-group-access-section">
      <h2>{t(`dataSecurityIssues.issueTypes.${kind}.heading`)}</h2>
      <p className="console-group-access-hint">{t(`dataSecurityIssues.issueTypes.${kind}.hint`)}</p>
      <IssueTable
        items={items}
        expandedKey={expandedKey}
        onToggleReview={onToggleReview}
        onSaved={onSaved}
        issueKind={kind}
        loading={loading}
      />
      <IssuePagination
        total={total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
      />
    </section>
  );
}

export function ConsoleDataSecurityIssues() {
  const { t } = useTranslation('console');
  const { hasPermission } = useAuth();
  const [summary, setSummary] = useState<ResourceAclIssuesSummaryOut | null>(null);
  const [legacy, setLegacy] = useState<DataResourceMigrationReportOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const loadSummary = useCallback(async () => {
    try {
      const [sum, mig] = await Promise.all([
        fetchResourceAclIssuesSummary(),
        fetchDataResourcesMigrationReport(),
      ]);
      setSummary(sum);
      setLegacy(mig);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataSecurityIssues.toastLoadFailed'));
    }
  }, [t]);

  useEffect(() => {
    setLoading(true);
    void loadSummary().finally(() => setLoading(false));
  }, [loadSummary, refreshToken]);

  const handleSummaryUpdate = useCallback((next: ResourceAclIssuesSummaryOut) => {
    setSummary(next);
  }, []);

  const handleSaved = useCallback(() => {
    setRefreshToken((n) => n + 1);
  }, []);

  const toggleReview = (key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  if (!hasPermission(PERM_CONSOLE_GROUPS)) {
    return <Navigate to="/console" replace />;
  }

  const activeCriticalKinds = RESOURCE_ACL_ISSUE_CRITICAL_ORDER.filter(
    (code) => (summary?.by_issue[code] ?? 0) > 0
  );
  const activeReviewKinds = RESOURCE_ACL_ISSUE_REVIEW.filter(
    (code) => (summary?.by_issue[code] ?? 0) > 0
  );
  const hasAclIssues = (summary?.issue_count ?? 0) > 0;

  return (
    <div className="console-group-access">
      <div className="page-header">
        <h1>{t('dataSecurityIssues.pageTitle')}</h1>
        <p className="page-subtitle">{t('dataSecurityIssues.subtitle')}</p>
      </div>

      {loading && !summary ? (
        <p className="console-group-access-muted">{t('dataSecurityIssues.loading')}</p>
      ) : (
        <>
          {summary && (
            <>
              {!hasAclIssues && !(legacy && legacy.row_count > 0) ? (
                <p className="console-group-access-muted">{t('dataSecurityIssues.allClear')}</p>
              ) : (
                <>
                  {hasAclIssues && (
                    <p className="console-group-access-hint">
                      {t('dataSecurityIssues.issueSummary', { count: summary.issue_count })}
                    </p>
                  )}

                  {activeCriticalKinds.map((kind) => (
                    <IssueTypeSection
                      key={kind}
                      kind={kind}
                      expandedKey={expandedKey}
                      onToggleReview={toggleReview}
                      refreshToken={refreshToken}
                      onSummaryUpdate={handleSummaryUpdate}
                      onSaved={handleSaved}
                    />
                  ))}

                  {activeReviewKinds.length > 0 && (
                    <div className="console-dso-review-block">
                      <h2 className="console-dso-review-title">
                        {t('dataSecurityIssues.reviewRecommendedHeading')}
                      </h2>
                      <p className="console-group-access-hint">
                        {t('dataSecurityIssues.reviewRecommendedHint')}
                      </p>
                      {activeReviewKinds.map((kind) => (
                        <IssueTypeSection
                          key={kind}
                          kind={kind}
                          expandedKey={expandedKey}
                          onToggleReview={toggleReview}
                          refreshToken={refreshToken}
                          onSummaryUpdate={handleSummaryUpdate}
                          onSaved={handleSaved}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {legacy && legacy.row_count > 0 && (
            <section className="console-group-access-section console-dso-legacy">
              <h2>{t('dataSecurityIssues.legacyHeading')}</h2>
              <p className="console-group-access-hint">{legacy.message}</p>
              <p className="console-group-access-muted">
                {t('dataSecurityIssues.legacyCount', { count: legacy.row_count })}
              </p>
              <ul className="console-dso-legacy-list">
                {legacy.rows.map((row) => (
                  <li key={row.id}>
                    <strong>{row.name}</strong>{' '}
                    <span className="console-group-access-muted">({row.resource_kind})</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="console-group-access-hint">
            <Link to="/console/data-security/groups">{t('dataSecurityIssues.manageGroups')}</Link>
          </p>
        </>
      )}
    </div>
  );
}
