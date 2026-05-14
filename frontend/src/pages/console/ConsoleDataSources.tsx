import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, X, Wifi, Loader2, Eraser } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchDataSources,
  createDataSource,
  updateDataSource,
  deleteDataSource,
  testDataSourceConnection,
  neo4jDeleteAll,
  type DataSourceResponse,
} from '../../data/dataSourcesApi';
import '../ontology/ontology-admin.css';

const KINDS = ['postgresql', 'neo4j'] as const;

export function ConsoleDataSources() {
  const { t } = useTranslation('console');
  const [items, setItems] = useState<DataSourceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<DataSourceResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formKind, setFormKind] = useState<string>('postgresql');
  const [formHost, setFormHost] = useState('');
  const [formPort, setFormPort] = useState<string>('5432');
  const [formDatabase, setFormDatabase] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState<string | null>(null);
  const [deleteAllConfirmId, setDeleteAllConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchDataSources();
      setItems(res.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataSources.toastLoadFailed'));
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
    if (!window.confirm(t('dataSources.deleteConfirm'))) return;
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

      <div className="ontology-admin-content">
        <div className="ontology-admin-table-wrap">
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
                <th>{t('dataSources.colHost')}</th>
                <th>{t('dataSources.colPort')}</th>
                <th>{t('dataSources.colDatabase')}</th>
                <th className="console-table-actions">{t('dataSources.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="console-table-empty">
                    {t('dataSources.empty')}
                  </td>
                </tr>
              ) : (
                items.map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.name}</strong></td>
                    <td>{d.kind}</td>
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

      {showForm && (
        <div className="console-modal-overlay" onClick={(e) => e.target === e.currentTarget && !submitting && setShowForm(false)}>
          <div className="console-modal" onClick={(e) => e.stopPropagation()}>
            <div className="console-modal-header">
              <h2>{editItem ? t('dataSources.modalEditTitle') : t('dataSources.modalNewTitle')}</h2>
              <button
                type="button"
                onClick={() => !submitting && setShowForm(false)}
                disabled={submitting}
                aria-label={t('dataSources.closeAria')}
              >
                <X size={20} />
              </button>
            </div>
            <div className="console-modal-body">
              <label>
                <span>{t('dataSources.fieldName')}</span>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('dataSources.placeholderName')}
                />
              </label>
              <label>
                <span>{t('dataSources.fieldKind')}</span>
                <select value={formKind} onChange={(e) => setFormKind(e.target.value)}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('dataSources.fieldHost')}</span>
                <input
                  type="text"
                  value={formHost}
                  onChange={(e) => setFormHost(e.target.value)}
                  placeholder={t('dataSources.placeholderHost')}
                />
              </label>
              <label>
                <span>{t('dataSources.fieldPort')}</span>
                <input
                  type="text"
                  value={formPort}
                  onChange={(e) => setFormPort(e.target.value)}
                  placeholder={formKind === 'postgresql' ? '5432' : '7687'}
                />
              </label>
              {formKind === 'postgresql' && (
                <label>
                  <span>{t('dataSources.fieldDatabase')}</span>
                  <input
                    type="text"
                    value={formDatabase}
                    onChange={(e) => setFormDatabase(e.target.value)}
                    placeholder={t('dataSources.placeholderDb')}
                  />
                </label>
              )}
              <label>
                <span>{t('dataSources.fieldUsername')}</span>
                <input
                  type="text"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder={t('dataSources.placeholderUser')}
                />
              </label>
              <label>
                <span>
                  {t('dataSources.fieldPassword')}
                  {editItem ? ` ${t('dataSources.passwordLeaveBlank')}` : ''}
                </span>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder={editItem ? t('dataSources.placeholderPasswordEdit') : t('dataSources.placeholderPasswordNew')}
                />
              </label>
            </div>
            <div className="console-modal-actions">
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
            </div>
          </div>
        </div>
      )}

      {deleteAllConfirmId && (
        <div
          className="console-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && !deletingAll && setDeleteAllConfirmId(null)}
        >
          <div className="console-modal" onClick={(e) => e.stopPropagation()}>
            <div className="console-modal-header">
              <h2>{t('dataSources.neo4jDeleteAllHeading')}</h2>
              <button
                type="button"
                onClick={() => !deletingAll && setDeleteAllConfirmId(null)}
                disabled={!!deletingAll}
                aria-label={t('dataSources.closeAria')}
              >
                <X size={20} />
              </button>
            </div>
            <div className="console-modal-body">
              <p className="console-modal-hint">{t('dataSources.neo4jDeleteAllBody')}</p>
            </div>
            <div className="console-modal-actions">
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
