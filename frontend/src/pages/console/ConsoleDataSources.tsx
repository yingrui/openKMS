import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, Wifi, Loader2, Eraser } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '../../components/ErrorBanner';
import { Dialog, FormField } from '../../styles/design-system';
import {
  fetchDataSources,
  createDataSource,
  updateDataSource,
  deleteDataSource,
  testDataSourceConnection,
  neo4jDeleteAll,
  type DataSourceResponse,
} from '../../data/dataSourcesApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import '../ontology/ontology-admin.scss';

const KINDS = ['postgresql', 'neo4j'] as const;
const LAYERS = ['', 'data', 'ontology'] as const;
const LAYER_LABEL_KEY: Record<string, string> = {
  data: 'layerData',
  ontology: 'layerOntology',
};

export function ConsoleDataSources() {
  const { t } = useTranslation('console');
  const confirm = useConfirm();
  const [items, setItems] = useState<DataSourceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<DataSourceResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formKind, setFormKind] = useState<string>('postgresql');
  const [formLayer, setFormLayer] = useState<string>('');
  const [formHost, setFormHost] = useState('');
  const [formPort, setFormPort] = useState<string>('5432');
  const [formDatabase, setFormDatabase] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState<string | null>(null);
  const [deleteAllConfirmId, setDeleteAllConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDataSources({ limit: 200, offset: 0 });
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dataSources.toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditItem(null);
    setFormName('');
    setFormKind('postgresql');
    setFormLayer('');
    setFormHost('');
    setFormPort('5432');
    setFormDatabase('');
    setFormUsername('');
    setFormPassword('');
    setShowForm(true);
  };

  const openEdit = (d: DataSourceResponse) => {
    setEditItem(d);
    setFormName(d.name);
    setFormKind(d.kind);
    setFormLayer(d.layer ?? '');
    setFormHost(d.host);
    setFormPort(String(d.port ?? 5432));
    setFormDatabase(d.database ?? '');
    setFormUsername(d.username);
    setFormPassword(''); // Never send current password; user enters if changing
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim() || !formHost.trim() || !formUsername.trim()) {
      toast.error(t('dataSources.toastRequiredFields'));
      return;
    }
    setSubmitting(true);
    try {
      const portNum = formPort.trim() ? parseInt(formPort, 10) : undefined;
      if (editItem) {
        await updateDataSource(editItem.id, {
          name: formName.trim(),
          kind: formKind,
          host: formHost.trim(),
          port: portNum,
          database: formDatabase.trim() || undefined,
          username: formUsername.trim(),
          password: formPassword || undefined,
          layer: formLayer || null,
        });
        toast.success(t('dataSources.toastUpdated'));
      } else {
        await createDataSource({
          name: formName.trim(),
          kind: formKind,
          host: formHost.trim(),
          port: portNum ?? (formKind === 'postgresql' ? 5432 : 7687),
          database: formDatabase.trim() || undefined,
          username: formUsername.trim(),
          password: formPassword || undefined,
          layer: formLayer || null,
        });
        toast.success(t('dataSources.toastCreated'));
      }
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataSources.toastOperationFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirm({
        title: t('dataSources.deleteTitle'),
        message: t('dataSources.deleteConfirm'),
        confirmLabel: t('dataSources.deleteTitle'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteDataSource(id);
      toast.success(t('dataSources.toastDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataSources.toastDeleteFailed'));
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const res = await testDataSourceConnection(id);
      if (res.ok) {
        toast.success(t('dataSources.toastConnectionOk'));
      } else {
        toast.error(res.message || t('dataSources.toastConnectionFailed'));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataSources.toastTestFailed'));
    } finally {
      setTesting(null);
    }
  };

  const handleNeo4jDeleteAllConfirm = async () => {
    if (!deleteAllConfirmId) return;
    const id = deleteAllConfirmId;
    setDeleteAllConfirmId(null);
    setDeletingAll(id);
    try {
      const res = await neo4jDeleteAll(id);
      if (res.ok) {
        toast.success(t('dataSources.toastNeo4jAllDeleted'));
      } else {
        toast.error(res.message || t('dataSources.toastNeo4jDeleteAllFailed'));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataSources.toastNeo4jDeleteAllFailed'));
    } finally {
      setDeletingAll(null);
    }
  };

  return (
    <div className="ontology-admin">
      <div className="page-header">
        <div>
          <h1>{t('dataSources.pageTitle')}</h1>
          <p className="page-subtitle">{t('dataSources.subtitle')}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={18} />
          <span>{t('dataSources.newDataSource')}</span>
        </button>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="ontology-admin-content">
        <div className="ds-table-wrap">
          {loading ? (
            <div className="console-loading">
              <Loader2 size={32} className="console-loading-spinner" />
              <p>{t('dataSources.loading')}</p>
            </div>
          ) : (
            <table className="console-table">
            <thead>
              <tr>
                <th>{t('dataSources.colName')}</th>
                <th>{t('dataSources.colKind')}</th>
                <th>{t('dataSources.colLayer')}</th>
                <th>{t('dataSources.colHost')}</th>
                <th>{t('dataSources.colPort')}</th>
                <th>{t('dataSources.colDatabase')}</th>
                <th className="console-table-actions">{t('dataSources.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="console-table-empty">
                    {t('dataSources.empty')}
                  </td>
                </tr>
              ) : (
                items.map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.name}</strong></td>
                    <td>{d.kind}</td>
                    <td>
                      {d.layer
                        ? t(`dataSources.${LAYER_LABEL_KEY[d.layer] ?? 'layerNone'}`)
                        : t('dataSources.dash')}
                    </td>
                    <td>{d.host}</td>
                    <td>{d.port ?? t('dataSources.dash')}</td>
                    <td>{d.database ?? t('dataSources.dash')}</td>
                    <td className="console-table-actions">
                      <div className="console-table-btns">
                        <button
                          type="button"
                          title={t('dataSources.testTitle')}
                          onClick={() => handleTest(d.id)}
                          disabled={testing === d.id}
                        >
                          <Wifi size={16} />
                        </button>
                        {d.kind === 'neo4j' && (
                          <button
                            type="button"
                            title={t('dataSources.deleteAllNeo4jTitle')}
                            onClick={() => setDeleteAllConfirmId(d.id)}
                            disabled={deletingAll === d.id}
                          >
                            {deletingAll === d.id ? (
                              <Loader2 size={16} className="console-loading-spinner" />
                            ) : (
                              <Eraser size={16} />
                            )}
                          </button>
                        )}
                        <button type="button" title={t('dataSources.editTitle')} onClick={() => openEdit(d)}>
                          <Pencil size={16} />
                        </button>
                        <button type="button" title={t('dataSources.deleteTitle')} onClick={() => handleDelete(d.id)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          )}
        </div>
      </div>

      <Dialog
        open={showForm}
        onClose={() => !submitting && setShowForm(false)}
        closeDisabled={submitting}
        title={editItem ? t('dataSources.modalEditTitle') : t('dataSources.modalNewTitle')}
        closeAriaLabel={t('dataSources.closeAria')}
        size="md"
        footer={
          <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => !submitting && setShowForm(false)}
                disabled={submitting}
              >
                {t('dataSources.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={!formName.trim() || !formHost.trim() || !formUsername.trim() || submitting}
              >
                {submitting ? t('dataSources.saving') : editItem ? t('dataSources.update') : t('dataSources.create')}
              </button>
            
          </>
        }
      >
              <FormField label={t('dataSources.fieldName')}>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('dataSources.placeholderName')}
                />
              </FormField>
              <FormField label={t('dataSources.fieldKind')}>
                <select value={formKind} onChange={(e) => setFormKind(e.target.value)}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </FormField>
              <FormField label={t('dataSources.fieldLayer')}>
                <select value={formLayer} onChange={(e) => setFormLayer(e.target.value)}>
                  {LAYERS.map((l) => (
                    <option key={l || 'none'} value={l}>
                      {l ? t(`dataSources.${LAYER_LABEL_KEY[l]}`) : t('dataSources.layerNone')}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={t('dataSources.fieldHost')}>
                <input
                  type="text"
                  value={formHost}
                  onChange={(e) => setFormHost(e.target.value)}
                  placeholder={t('dataSources.placeholderHost')}
                />
              </FormField>
              <FormField label={t('dataSources.fieldPort')}>
                <input
                  type="text"
                  value={formPort}
                  onChange={(e) => setFormPort(e.target.value)}
                  placeholder={formKind === 'postgresql' ? '5432' : '7687'}
                />
              </FormField>
              {formKind === 'postgresql' && (
                <FormField label={t('dataSources.fieldDatabase')}>
                  <input
                    type="text"
                    value={formDatabase}
                    onChange={(e) => setFormDatabase(e.target.value)}
                    placeholder={t('dataSources.placeholderDb')}
                  />
                </FormField>
              )}
              <FormField label={t('dataSources.fieldUsername')}>
                <input
                  type="text"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder={t('dataSources.placeholderUser')}
                />
              </FormField>
              <FormField
                label={
                  <>
                    {t('dataSources.fieldPassword')}
                    {editItem ? ` ${t('dataSources.passwordLeaveBlank')}` : ''}
                  </>
                }
              >
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder={editItem ? t('dataSources.placeholderPasswordEdit') : t('dataSources.placeholderPasswordNew')}
                />
              </FormField>
            
      </Dialog>
      <Dialog
        open={Boolean(deleteAllConfirmId)}
        onClose={() => !deletingAll && setDeleteAllConfirmId(null)}
        closeDisabled={Boolean(deletingAll)}
        title={t('dataSources.neo4jDeleteAllHeading')}
        closeAriaLabel={t('dataSources.closeAria')}
        size="md"
        footer={
          <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => !deletingAll && setDeleteAllConfirmId(null)}
                disabled={!!deletingAll}
              >
                {t('dataSources.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleNeo4jDeleteAllConfirm}
                disabled={!!deletingAll}
              >
                {deletingAll ? (
                  <>
                    <Loader2 size={18} className="console-loading-spinner" />
                    <span>{t('dataSources.deleting')}</span>
                  </>
                ) : (
                  t('dataSources.confirmDeleteAll')
                )}
              </button>
            
          </>
        }
      >
        <p className="page-subtitle">{t('dataSources.neo4jDeleteAllBody')}</p>
      </Dialog>
    </div>
  );
}
