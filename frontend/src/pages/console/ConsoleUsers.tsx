import { useCallback, useEffect, useMemo, useState } from 'react';
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
import './ConsoleUsers.css';

export function ConsoleUsers() {
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
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

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
      toast.success(next ? 'Granted admin' : 'Removed admin');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const onDelete = async (u: LocalUserRow) => {
    if (!window.confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    try {
      await deleteLocalUser(u.id);
      toast.success('User deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
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
      toast.success('User created');
      setAddOpen(false);
      setAddEmail('');
      setAddUsername('');
      setAddPassword('');
      setAddAdmin(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setAddPending(false);
    }
  };

  return (
    <div className="console-users">
      <div className="page-header console-users-header">
        <div>
          <h1>Users &amp; Roles</h1>
          <p className="page-subtitle">
            {page?.managed_in_console
              ? 'Manage local accounts and the Admin role (console access).'
              : 'The user directory is managed in your OIDC identity provider, not in openKMS.'}
          </p>
        </div>
        {page?.managed_in_console && (
          <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
            <Plus size={18} />
            <span>Add user</span>
          </button>
        )}
      </div>

      {loading && <p className="console-users-muted">Loading…</p>}
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
                    aria-label="Search users"
                    placeholder="Search by username or email…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="console-users-table-wrap">
                <table className="console-users-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Admin</th>
                      <th>Created</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="console-users-empty">
                          No users match.
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
                                aria-label={`Admin for ${u.username}`}
                              />
                              <span>{u.is_admin ? 'Yes' : 'No'}</span>
                            </label>
                          </td>
                          <td className="console-users-date">
                            {u.created_at
                              ? new Date(u.created_at).toLocaleString(undefined, {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })
                              : '—'}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm console-users-delete"
                              onClick={() => void onDelete(u)}
                            >
                              Delete
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
            <h2 id="add-user-title">Add user</h2>
            <p className="console-users-modal-sub">Creates a local account with a password.</p>
            <form onSubmit={onAddSubmit}>
              <div className="auth-local-field">
                <label htmlFor="add-email">Email</label>
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
                <label htmlFor="add-username">Username</label>
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
                <label htmlFor="add-password">Password</label>
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
                Grant Admin (console access)
              </label>
              <div className="console-users-modal-actions">
                <button type="button" className="btn btn-secondary" disabled={addPending} onClick={() => setAddOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={addPending}>
                  {addPending ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
