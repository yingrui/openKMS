import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Wifi, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchDataSources,
  createDataSource,
  updateDataSource,
  deleteDataSource,
  testDataSourceConnection,
  type DataSourceResponse,
} from '../../data/dataSourcesApi';
import './ConsoleObjectTypes.css';

const KINDS = ['postgresql', 'neo4j'] as const;

export function ConsoleDataSources() {
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchDataSources();
      setItems(res.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load data sources');
    } finally {
      setLoading(false);
    }
  }, []);

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
      toast.error('Name, host, and username are required');
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
        toast.success('Data source updated');
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
        toast.success('Data source created');
      }
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this data source? All datasets will be deleted.')) return;
    try {
      await deleteDataSource(id);
      toast.success('Data source deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const res = await testDataSourceConnection(id);
      if (res.ok) {
        toast.success('Connection successful');
      } else {
        toast.error(res.message || 'Connection failed');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="console-object-types">
      <div className="page-header">
        <div>
          <h1>Data Sources</h1>
          <p className="page-subtitle">
            Manage PostgreSQL and Neo4j connections. Credentials are encrypted at rest.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={18} />
          <span>New Data Source</span>
        </button>
      </div>

      <div className="console-object-types-content">
        <div className="console-object-types-table-wrap">
          {loading ? (
            <div className="console-loading">
              <Loader2 size={32} className="console-loading-spinner" />
              <p>Loading…</p>
            </div>
          ) : (
            <table className="console-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Host</th>
                <th>Port</th>
                <th>Database</th>
                <th className="console-table-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="console-table-empty">
                    No data sources yet. Create one to get started.
                  </td>
                </tr>
              ) : (
                items.map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.name}</strong></td>
                    <td>{d.kind}</td>
                    <td>{d.host}</td>
                    <td>{d.port ?? '—'}</td>
                    <td>{d.database ?? '—'}</td>
                    <td className="console-table-actions">
                      <div className="console-table-btns">
                        <button
                          type="button"
                          title="Test connection"
                          onClick={() => handleTest(d.id)}
                          disabled={testing === d.id}
                        >
                          <Wifi size={16} />
                        </button>
                        <button type="button" title="Edit" onClick={() => openEdit(d)}>
                          <Pencil size={16} />
                        </button>
                        <button type="button" title="Delete" onClick={() => handleDelete(d.id)}>
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
              <h2>{editItem ? 'Edit Data Source' : 'New Data Source'}</h2>
              <button
                type="button"
                onClick={() => !submitting && setShowForm(false)}
                disabled={submitting}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="console-modal-body">
              <label>
                <span>Name</span>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Clinical DB"
                />
              </label>
              <label>
                <span>Kind</span>
                <select value={formKind} onChange={(e) => setFormKind(e.target.value)}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Host</span>
                <input
                  type="text"
                  value={formHost}
                  onChange={(e) => setFormHost(e.target.value)}
                  placeholder="localhost"
                />
              </label>
              <label>
                <span>Port</span>
                <input
                  type="text"
                  value={formPort}
                  onChange={(e) => setFormPort(e.target.value)}
                  placeholder={formKind === 'postgresql' ? '5432' : '7687'}
                />
              </label>
              {formKind === 'postgresql' && (
                <label>
                  <span>Database</span>
                  <input
                    type="text"
                    value={formDatabase}
                    onChange={(e) => setFormDatabase(e.target.value)}
                    placeholder="postgres"
                  />
                </label>
              )}
              <label>
                <span>Username</span>
                <input
                  type="text"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="user"
                />
              </label>
              <label>
                <span>Password {editItem && '(leave empty to keep current)'}</span>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder={editItem ? '••••••••' : 'optional'}
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
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={!formName.trim() || !formHost.trim() || !formUsername.trim() || submitting}
              >
                {submitting ? 'Saving…' : editItem ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
