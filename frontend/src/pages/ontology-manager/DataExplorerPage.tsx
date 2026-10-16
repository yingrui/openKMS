import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { createDashboard, fetchDashboards, type DashboardSummary } from '../../data/dashboardsApi';
import { Dialog, EmptyState, FormField, StatusChip } from '../../styles/design-system';
import '../../styles/resource-list.scss';

/**
 * All dashboards — the app's shared card list (`resource-list.scss`, the same chrome as Knowledge
 * Bases and Wiki spaces): one page header with the primary action, a card grid, and a card whose
 * top row is an icon, then a title, a description and a meta line.
 *
 * What is specific to a dashboard lives *inside* that grammar: the question is the description, and
 * the meta line carries the state, the report count and the sources the reports read.
 */
export function DataExplorerPage() {
  const { t } = useTranslation('ontology');
  const navigate = useNavigate();
  const [dashboards, setDashboards] = useState<DashboardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDashboards((await fetchDashboards()).items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setName('');
    setQuestion('');
    setShowForm(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error(t('dataExplorer.nameRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const created = await createDashboard({
        name: name.trim(),
        question: question.trim() || null,
      });
      toast.success(t('dataExplorer.created'));
      setShowForm(false);
      navigate(`/data-explorer/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataExplorer.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="resource-list">
      <div className="page-header resource-list-header">
        <div>
          <h1>{t('dataExplorer.title')}</h1>
          <p className="page-subtitle">{t('dataExplorer.subtitle')}</p>
        </div>
        <div className="resource-list-header-actions">
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={18} aria-hidden />
            <span>{t('dataExplorer.newDashboard')}</span>
          </button>
        </div>
      </div>

      {loading && (
        <p className="resource-list-loading">
          <Loader2 size={18} className="spin" aria-hidden /> {t('shared.loading')}
        </p>
      )}

      {!loading && dashboards.length === 0 && (
        <EmptyState
          icon={<Sparkles size={48} strokeWidth={1} />}
          title={t('dataExplorer.empty')}
          description={t('dataExplorer.subtitle')}
          action={
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              <Plus size={18} aria-hidden />
              <span>{t('dataExplorer.newDashboard')}</span>
            </button>
          }
        />
      )}

      {!loading && dashboards.length > 0 && (
        <div className="resource-list-grid">
          {dashboards.map((dashboard) => {
            const sources = dashboard.sources.map((s) => s.label);
            return (
              <Link
                key={dashboard.id}
                to={`/data-explorer/${dashboard.id}`}
                className="resource-list-card"
              >
                <div className="resource-list-card-top">
                  <div className="resource-list-icon">
                    <Sparkles size={28} strokeWidth={1.5} />
                  </div>
                </div>
                <h3>{dashboard.name}</h3>
                <p
                  className="resource-list-desc"
                  title={dashboard.question?.trim() || undefined}
                >
                  {dashboard.question || t('dataExplorer.noQuestion')}
                </p>
                <div className="resource-list-meta">
                  <StatusChip tone={dashboard.status === 'ready' ? 'ok' : 'neutral'}>
                    {t(`dataExplorer.status_${dashboard.status}`, { defaultValue: dashboard.status })}
                  </StatusChip>
                  <span>{t('dataExplorer.reportCount', { count: dashboard.report_count })}</span>
                  {sources.length > 0 && <span>{sources.join(' + ')}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Dialog
        open={showForm}
        onClose={() => !submitting && setShowForm(false)}
        closeDisabled={submitting}
        title={t('dataExplorer.newDashboard')}
        closeAriaLabel={t('shared.cancel')}
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => !submitting && setShowForm(false)}
              disabled={submitting}
            >
              {t('shared.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleCreate()}
              disabled={!name.trim() || submitting}
            >
              {submitting ? t('shared.saving') : t('shared.create')}
            </button>
          </>
        }
      >
        <FormField label={t('dataExplorer.dashboardName')}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label={t('dataExplorer.question')}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('dataExplorer.questionPlaceholder')}
          />
        </FormField>
      </Dialog>
    </div>
  );
}
