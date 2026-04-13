import { useCallback, useEffect, useState } from 'react';
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
  const { hasPermission } = useAuth();
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
      toast.error(e instanceof Error ? e.message : 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!name.trim()) return;
    try {
      await createAccessGroup({ name: name.trim(), description: desc.trim() || null });
      toast.success('Group created');
      setName('');
      setDesc('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    }
  };

  const onSaveEdit = async () => {
    if (!editId || !editName.trim()) return;
    try {
      await patchAccessGroup(editId, { name: editName.trim(), description: editDesc.trim() || null });
      toast.success('Group updated');
      setEditId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const onDelete = async (g: AccessGroupOut) => {
    if (!window.confirm(`Delete group "${g.name}"?`)) return;
    try {
      await deleteAccessGroup(g.id);
      toast.success('Group deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  if (!hasPermission(PERM_CONSOLE_GROUPS)) {
    return <Navigate to="/console" replace />;
  }

  return (
    <div className="console-ds-groups">
      <div className="page-header">
        <h1>Access groups</h1>
        <p className="page-subtitle">
          Local users only in this release. Assign members and resource scopes per group under{' '}
          <strong>Data security</strong>.
        </p>
      </div>

      <form className="console-ds-groups-form" onSubmit={onCreate}>
        <h2>New group</h2>
        <div className="console-ds-groups-row">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={256} />
          </label>
          <label className="console-ds-groups-grow">
            Description
            <input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </label>
          <button type="submit" className="btn-primary">
            Create
          </button>
        </div>
      </form>

      {loading ? (
        <p className="console-ds-groups-muted">Loading…</p>
      ) : (
        <ul className="console-ds-groups-list">
          {groups.map((g) => (
            <li key={g.id} className="console-ds-groups-item">
              {editId === g.id ? (
                <div className="console-ds-groups-edit">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description" />
                  <button type="button" className="btn-primary" onClick={() => void onSaveEdit()}>
                    Save
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setEditId(null)}>
                    Cancel
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
                      Data access
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
                      Edit
                    </button>
                    <button type="button" className="btn-ghost danger" onClick={() => void onDelete(g)}>
                      Delete
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
