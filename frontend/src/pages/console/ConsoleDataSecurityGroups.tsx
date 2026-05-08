import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { PERM_CONSOLE_GROUPS } from '../../config/permissions';
import {
  createAccessGroup,
  deleteAccessGroup,
  fetchAccessGroups,
  patchAccessGroup,
  type AccessGroupOut,
} from '../../data/securityAdminApi';
import './ConsoleDataSecurityGroups.css';

export function ConsoleDataSecurityGroups() {
  const { t } = useTranslation('console');
  const { hasPermission, authMode } = useAuth();
  const [groups, setGroups] = useState<AccessGroupOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAccessGroups();
      setGroups(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataSecurityGroups.toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!name.trim()) return;
    try {
      await createAccessGroup({ name: name.trim(), description: desc.trim() || null });
      toast.success(t('dataSecurityGroups.toastCreated'));
      setName('');
      setDesc('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataSecurityGroups.toastCreateFailed'));
    }
  };

  const onSaveEdit = async () => {
    if (!editId || !editName.trim()) return;
    try {
      await patchAccessGroup(editId, { name: editName.trim(), description: editDesc.trim() || null });
      toast.success(t('dataSecurityGroups.toastUpdated'));
      setEditId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataSecurityGroups.toastUpdateFailed'));
    }
  };

  const onDelete = async (g: AccessGroupOut) => {
    if (!window.confirm(t('dataSecurityGroups.deleteConfirm', { name: g.name }))) return;
    try {
      await deleteAccessGroup(g.id);
      toast.success(t('dataSecurityGroups.toastDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataSecurityGroups.toastDeleteFailed'));
    }
  };

  if (!hasPermission(PERM_CONSOLE_GROUPS)) {
    return <Navigate to="/console" replace />;
  }

  return (
    <div className="console-ds-groups">
      <div className="page-header">
        <h1>{t('dataSecurityGroups.pageTitle')}</h1>
        <p className="page-subtitle">
          {t('dataSecurityGroups.subtitleBefore')}
          <strong>{t('dataSecurityGroups.dataSecurityTerm')}</strong>
          {t('dataSecurityGroups.subtitleAfter')}
          {authMode === 'local' ? t('dataSecurityGroups.subtitleLocal') : t('dataSecurityGroups.subtitleOidc')}
        </p>
      </div>

      <form className="console-ds-groups-form" onSubmit={onCreate}>
        <h2>{t('dataSecurityGroups.newGroup')}</h2>
        <div className="console-ds-groups-row">
          <label>
            {t('dataSecurityGroups.name')}
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={256} />
          </label>
          <label className="console-ds-groups-grow">
            {t('dataSecurityGroups.description')}
            <input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </label>
          <button type="submit" className="btn-primary">
            {t('dataSecurityGroups.create')}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="console-ds-groups-muted">{t('dataSecurityGroups.loading')}</p>
      ) : (
        <ul className="console-ds-groups-list">
          {groups.map((g) => (
            <li key={g.id} className="console-ds-groups-item">
              {editId === g.id ? (
                <div className="console-ds-groups-edit">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder={t('dataSecurityGroups.descPlaceholder')} />
                  <button type="button" className="btn-primary" onClick={() => void onSaveEdit()}>
                    {t('dataSecurityGroups.save')}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setEditId(null)}>
                    {t('dataSecurityGroups.cancel')}
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <div className="console-ds-groups-name">{g.name}</div>
                    {g.description && <div className="console-ds-groups-desc">{g.description}</div>}
                  </div>
                  <div className="console-ds-groups-actions">
                    <Link to={`/console/data-security/groups/${g.id}/access`} className="btn-secondary">
                      {t('dataSecurityGroups.dataAccess')}
                    </Link>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setEditId(g.id);
                        setEditName(g.name);
                        setEditDesc(g.description ?? '');
                      }}
                    >
                      {t('dataSecurityGroups.edit')}
                    </button>
                    <button type="button" className="btn-ghost danger" onClick={() => void onDelete(g)}>
                      {t('dataSecurityGroups.delete')}
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
