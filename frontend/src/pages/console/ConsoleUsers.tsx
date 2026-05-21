import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Users, Shield } from 'lucide-react';
import { toast } from 'sonner';
import {
  createLocalUser,
  deleteLocalUser,
  fetchAdminUsersPage,
  patchLocalUser,
  type AdminUsersPage,
  type LocalUserRow,
} from '../../data/adminUsersApi';
import './ConsoleUsers.scss';

export function ConsoleUsers() {
  const { t } = useTranslation('console');
  const [page, setPage] = useState<AdminUsersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addUsername, setAddUsername] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addAdmin, setAddAdmin] = useState(false);
  const [addPending, setAddPending] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await fetchAdminUsersPage();
      setPage(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('users.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredUsers = useMemo(() => {
    if (!page?.users.length) return [];
    const q = search.trim().toLowerCase();
    if (!q) return page.users;
    return page.users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [page?.users, search]);

  const onToggleAdmin = async (u: LocalUserRow, next: boolean) => {
    try {
      await patchLocalUser(u.id, next);
      toast.success(next ? t('users.toastGrantedAdmin') : t('users.toastRemovedAdmin'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('users.toastUpdateFailed'));
    }
  };

  const onDelete = async (u: LocalUserRow) => {
    if (!window.confirm(t('users.deleteConfirm', { username: u.username }))) return;
    try {
      await deleteLocalUser(u.id);
      toast.success(t('users.toastDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('users.toastDeleteFailed'));
    }
  };

  const onAddSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setAddPending(true);
    try {
      await createLocalUser({
        email: addEmail.trim(),
        username: addUsername.trim(),
        password: addPassword,
        is_admin: addAdmin,
      });
      toast.success(t('users.toastCreated'));
      setAddOpen(false);
      setAddEmail('');
      setAddUsername('');
      setAddPassword('');
      setAddAdmin(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('users.toastCreateFailed'));
    } finally {
      setAddPending(false);
    }
  };

  return (
    <div className="console-users">
      <div className="page-header console-users-header">
        <div>
          <h1>{t('users.pageTitle')}</h1>
          <p className="page-subtitle">
            {page?.managed_in_console ? t('users.subtitleManaged') : t('users.subtitleOidc')}
          </p>
        </div>
        {page?.managed_in_console && (
          <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
            <Plus size={18} />
            <span>{t('users.addUser')}</span>
          </button>
        )}
      </div>

      {loading && <p className="console-users-muted">{t('users.loading')}</p>}
      {error && <p className="console-users-error">{error}</p>}

      {!loading && page && (
        <>
          {page.idp_notice && (
            <div className="console-users-notice" role="status">
              <Shield size={20} />
              <p>{page.idp_notice}</p>
            </div>
          )}

          {page.managed_in_console && (
            <>
              <div className="console-users-toolbar">
                <div className="console-users-search">
                  <Search size={18} />
                  <input
                    type="search"
                    aria-label={t('users.searchAria')}
                    placeholder={t('users.searchPlaceholder')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="console-users-table-wrap">
                <table className="console-users-table">
                  <thead>
                    <tr>
                      <th>{t('users.colUser')}</th>
                      <th>{t('users.colEmail')}</th>
                      <th>{t('users.colAdmin')}</th>
                      <th>{t('users.colCreated')}</th>
                      <th aria-label={t('users.colActionsAria')} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="console-users-empty">
                          {t('users.emptyFilter')}
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <div className="console-users-table-name">
                              <Users size={18} strokeWidth={1.5} />
                              <span>{u.username}</span>
                            </div>
                          </td>
                          <td>{u.email}</td>
                          <td>
                            <label className="console-users-admin-toggle">
                              <input
                                type="checkbox"
                                checked={u.is_admin}
                                onChange={(e) => void onToggleAdmin(u, e.target.checked)}
                                aria-label={t('users.adminAria', { username: u.username })}
                              />
                              <span>{u.is_admin ? t('users.yes') : t('users.no')}</span>
                            </label>
                          </td>
                          <td className="console-users-date">
                            {u.created_at
                              ? new Date(u.created_at).toLocaleString(undefined, {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })
                              : t('users.dash')}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm console-users-delete"
                              onClick={() => void onDelete(u)}
                            >
                              {t('users.delete')}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {addOpen && (
        <div className="console-users-modal-backdrop" role="presentation" onClick={() => !addPending && setAddOpen(false)}>
          <div
            className="console-users-modal"
            role="dialog"
            aria-labelledby="add-user-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="add-user-title">{t('users.modalTitle')}</h2>
            <p className="console-users-modal-sub">{t('users.modalSubtitle')}</p>
            <form onSubmit={onAddSubmit}>
              <div className="auth-local-field">
                <label htmlFor="add-email">{t('users.email')}</label>
                <input
                  id="add-email"
                  type="email"
                  autoComplete="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  required
                />
              </div>
              <div className="auth-local-field">
                <label htmlFor="add-username">{t('users.username')}</label>
                <input
                  id="add-username"
                  type="text"
                  autoComplete="username"
                  value={addUsername}
                  onChange={(e) => setAddUsername(e.target.value)}
                  required
                  minLength={2}
                />
              </div>
              <div className="auth-local-field">
                <label htmlFor="add-password">{t('users.password')}</label>
                <input
                  id="add-password"
                  type="password"
                  autoComplete="new-password"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <label className="console-users-modal-check">
                <input type="checkbox" checked={addAdmin} onChange={(e) => setAddAdmin(e.target.checked)} />
                {t('users.grantAdmin')}
              </label>
              <div className="console-users-modal-actions">
                <button type="button" className="btn btn-secondary" disabled={addPending} onClick={() => setAddOpen(false)}>
                  {t('users.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={addPending}>
                  {addPending ? t('users.creating') : t('users.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
