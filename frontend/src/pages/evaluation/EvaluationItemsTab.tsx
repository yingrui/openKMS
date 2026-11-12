import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  createEvaluationItem,
  deleteEvaluationItem,
  fetchEvaluationItems,
  importEvaluationItems,
  updateEvaluationItem,
  type EvaluationItemResponse,
} from '../../data/evaluationsApi';
import { Dialog, FormField, Pagination, PanelToolbar } from '../../styles/design-system';
import { useEvaluationDetail } from './EvaluationDetailContext';
import { isQueryKind } from './EvaluationDetailContext';
import { expectedQueryLines } from './expectedQueryText';

const PAGE_SIZE_DEFAULT = 25;

/** The questions themselves. This tab is a table and its editor — nothing about running it. */
export function EvaluationItemsTab() {
  const { t } = useTranslation('workspace');
  const { evaluationId, dataset, itemTotal, reload } = useEvaluationDetail();
  const isQuery = isQueryKind(dataset.kind);

  const [items, setItems] = useState<EvaluationItemResponse[]>([]);
  const [total, setTotal] = useState(itemTotal);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const [editing, setEditing] = useState<EvaluationItemResponse | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [query, setQuery] = useState('');
  const [expected, setExpected] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchEvaluationItems(evaluationId, { offset: page * pageSize, limit: pageSize });
      setItems(res.items);
      setTotal(res.total);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluationDetail.toastLoadDatasetFailed'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [evaluationId, page, pageSize, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setFormOpen(false);
    setEditing(null);
    setTopic('');
    setQuery('');
    setExpected('');
  };

  const openAdd = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (item: EvaluationItemResponse) => {
    setEditing(item);
    setTopic(item.topic ?? '');
    setQuery(item.query);
    setExpected(item.expected_answer ?? '');
    setFormOpen(true);
  };

  const save = async () => {
    if (!query.trim()) return;
    if (!isQuery && !expected.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateEvaluationItem(evaluationId, editing.id, {
          query: query.trim(),
          ...(isQuery ? {} : { expected_answer: expected.trim() }),
          topic: topic.trim() || undefined,
        });
        toast.success(t('evaluationDetail.toastUpdateSuccess'));
      } else {
        await createEvaluationItem(evaluationId, {
          query: query.trim(),
          expected_answer: isQuery ? null : expected.trim(),
          topic: topic.trim() || undefined,
        });
        toast.success(t('evaluationDetail.toastAddSuccess'));
      }
      resetForm();
      await load();
      reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluationDetail.toastAddFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: EvaluationItemResponse) => {
    try {
      await deleteEvaluationItem(evaluationId, item.id);
      toast.success(t('evaluationDetail.toastItemDeleted'));
      await load();
      reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluationDetail.toastDeleteItemFailed'));
    }
  };

  const importCsv = async (file: File) => {
    setImporting(true);
    try {
      const res = await importEvaluationItems(evaluationId, file);
      toast.success(t('evaluationDetail.toastImported', { count: res.imported }));
      await load();
      reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluationDetail.toastImportFailed'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="eval-tab">
      <PanelToolbar
        as="div"
        leading={
          <span>{isQuery ? t('evaluationDetail.itemsLeadQuery') : t('evaluationDetail.itemsLeadAnswer')}</span>
        }
        actions={
          <>
            {isQuery ? null : (
              <label className="btn btn-secondary eval-import-btn">
              {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              <span>{importing ? t('evaluationDetail.importing') : t('evaluationDetail.importData')}</span>
              <input
                type="file"
                accept=".csv"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void importCsv(file);
                }}
              />
            </label>
          )}
            {isQuery ? null : (
              <button type="button" className="btn btn-primary" onClick={openAdd}>
                <Plus size={16} />
                <span>{t('evaluationDetail.addItem')}</span>
              </button>
            )}
          </>
        }
      />

      <div className={`ds-table-wrap${loading ? ' ds-table-wrap--loading' : ''}`}>
        <table className="eval-items-table">
          <thead>
            <tr>
              <th>{t('evaluationDetail.colTopic')}</th>
              <th>{t('evaluationDetail.colQuery')}</th>
              <th>{isQuery ? t('evaluationDetail.colExpectedQuery') : t('evaluationDetail.colExpected')}</th>
              <th className="eval-items-actions-col" />
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={4} className="eval-items-empty">
                  <Loader2 size={18} className="animate-spin" /> {t('evaluationDetail.loadingItems')}
                </td>
              </tr>
            ) : total === 0 ? (
              <tr>
                <td colSpan={4} className="eval-items-empty">
                  {t('evaluationDetail.emptyItems')}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td className="eval-item-topic">{item.topic ?? t('shared.dash')}</td>
                  <td className="eval-item-query">{item.query}</td>
                  <td className="eval-item-expected">
                    {isQuery ? (
                      (() => {
                        const lines = expectedQueryLines(item.expected_query);
                        return lines.length === 0 ? (
                          <span className="eval-item-expected-missing">{t('evaluationDetail.expectedQueryMissing')}</span>
                        ) : (
                          <ul className="eval-item-expected-list">
                            {lines.map((line, i) => (
                              <li key={`${item.id}-${i}`} title={line}>
                                {line}
                              </li>
                            ))}
                          </ul>
                        );
                      })()
                    ) : (
                      item.expected_answer
                    )}
                  </td>
                  <td className="eval-items-actions-col">
                    <button type="button" title={t('shared.edit')} aria-label={t('shared.edit')} onClick={() => openEdit(item)}>
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      title={t('shared.delete')}
                      aria-label={t('shared.delete')}
                      onClick={() => void remove(item)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        total={total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(0);
        }}
      />

      <Dialog
        open={formOpen}
        onClose={resetForm}
        title={editing ? t('evaluationDetail.dialogEditItem') : t('evaluationDetail.dialogAddItem')}
        closeAriaLabel={t('shared.close')}
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={resetForm}>
              {t('evaluationDetail.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!query.trim() || (!isQuery && !expected.trim()) || saving}
              onClick={() => void save()}
            >
              {saving ? t('evaluationDetail.saving') : editing ? t('evaluationDetail.save') : t('evaluationDetail.add')}
            </button>
          </>
        }
      >
        <FormField label={t('evaluationDetail.topicOptional')}>
          <input type="text" className="ds-control" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </FormField>
        <FormField label={t('evaluationDetail.queryLabelForm')}>
          <textarea rows={3} className="ds-control" value={query} onChange={(e) => setQuery(e.target.value)} />
        </FormField>
        {isQuery ? (
          <div className="eval-dialog-expected-readonly">
            <span>{t('evaluationDetail.colExpectedQuery')}</span>
            <ul>
              {expectedQueryLines(editing?.expected_query).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <small>{t('evaluationDetail.expectedQueryEditHint')}</small>
          </div>
        ) : (
          <FormField label={t('evaluationDetail.expectedLabelForm')}>
            <textarea rows={4} className="ds-control" value={expected} onChange={(e) => setExpected(e.target.value)} />
          </FormField>
        )}
      </Dialog>
    </div>
  );
}
