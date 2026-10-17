import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDatasetDetail } from './useDatasetDetail';
import {
  deleteQualityRule,
  fetchQualityRules,
  runQualityRule,
  type QualityRuleResponse,
} from '../../data/qualityApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { EmptyState } from '../../styles/design-system';
import { EntityViewHeader, EntityViewLoading, EntityViewPanel } from './EntityViewShell';

/**
 * A dataset's quality rules — the list half of list ↔ detail.
 *
 * The rule itself lives on its own page (`/quality/:ruleId`), because it is a query to iterate on;
 * that page is also where its run history is. This page only answers "what do I have, and what is
 * broken", plus the two actions that need no editing: run and delete.
 */
export function DatasetQualityTab() {
  const { t } = useTranslation('ontology');
  const { dataset } = useDatasetDetail();
  const datasetId = dataset.id;
  const base = `/datasets/${datasetId}`;
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [rules, setRules] = useState<QualityRuleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRules(await fetchQualityRules(datasetId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [datasetId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRun = async (ruleId: string) => {
    setBusyId(ruleId);
    try {
      const updated = await runQualityRule(datasetId, ruleId);
      setRules((prev) => prev.map((r) => (r.id === ruleId ? updated : r)));
      toast.success(
        updated.last_status === 'passed'
          ? t('datasets.qualityPassed')
          : t('datasets.qualityFailed'),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.qualityRunFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('datasets.qualityDeleteConfirm'),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteQualityRule(datasetId, ruleId);
      toast.success(t('datasets.qualityDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.qualityDeleteFailed'));
    }
  };

  if (loading) return <EntityViewLoading label={t('shared.loading')} />;

  return (
    <>
      <EntityViewHeader
        title={t('datasets.quality')}
        subtitle={t('datasets.qualityHint')}
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void navigate(`${base}/quality/new`)}
          >
            <Plus size={16} aria-hidden />
            {t('datasets.addQualityRule')}
          </button>
        }
      />
      <EntityViewPanel>
        {rules.length === 0 ? (
          <EmptyState title={t('datasets.qualityEmpty')} description={t('datasets.qualityHint')} />
        ) : (
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('datasets.colName')}</th>
                  <th>{t('datasets.qualityType')}</th>
                  <th>{t('datasets.colColumn')}</th>
                  <th>{t('datasets.qualityStatus')}</th>
                  <th className="console-table-actions">{t('datasets.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {/* The name is the way into the rule — a row is a thing you can open. */}
                      <Link to={`${base}/quality/${r.id}`} className="console-table-link">
                        {r.name}
                      </Link>
                    </td>
                    <td>{t(`datasets.qualityType_${r.rule_type}`, { defaultValue: r.rule_type })}</td>
                    <td>{r.column_name ?? t('datasets.dash')}</td>
                    <td>
                      {r.last_status ? (
                        <span className={`quality-pill quality-pill--${r.last_status}`}>
                          {r.last_status}
                        </span>
                      ) : (
                        t('datasets.qualityNotRun')
                      )}
                    </td>
                    <td className="console-table-actions">
                      <div className="console-table-btns">
                        <button
                          type="button"
                          title={t('datasets.editQualityRule')}
                          aria-label={t('datasets.editQualityRule')}
                          onClick={() => void navigate(`${base}/quality/${r.id}`)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          title={t('datasets.qualityRun')}
                          aria-label={t('datasets.qualityRun')}
                          onClick={() => void handleRun(r.id)}
                          disabled={busyId === r.id}
                        >
                          <Play size={16} />
                        </button>
                        <button
                          type="button"
                          title={t('shared.delete')}
                          aria-label={t('shared.delete')}
                          onClick={() => void handleDelete(r.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </EntityViewPanel>
    </>
  );
}
