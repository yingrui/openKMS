import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { PERM_CONSOLE_GROUPS } from '../../config/permissions';
import {
  createDataResource,
  deleteDataResource,
  fetchDataResources,
  fetchResourceKinds,
  patchDataResource,
  type DataResourceOut,
} from '../../data/securityAdminApi';
import './ConsoleDataSecurityGroups.css';
import './ConsoleDataResources.css';

export function ConsoleDataResources() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<DataResourceOut[]>([]);
  const [kinds, setKinds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [kind, setKind] = useState('document');
  const [attrsJson, setAttrsJson] = useState('{}');
  const [anchorCh, setAnchorCh] = useState('');
  const [anchorKb, setAnchorKb] = useState('');
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, k] = await Promise.all([fetchDataResources(), fetchResourceKinds()]);
      setRows(list);
      setKinds(k);
      setKind((prev) => (k.includes(prev) ? prev : k[0] ?? prev));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const parseAttrs = (): Record<string, unknown> => {
    const t = attrsJson.trim() || '{}';
    const o = JSON.parse(t) as unknown;
    if (typeof o !== 'object' || o === null || Array.isArray(o)) throw new Error('Attributes must be a JSON object');
    return o as Record<string, unknown>;
  };

  const onSubmitForm = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!name.trim()) return;
    if (editId) {
      await onSaveEdit();
      return;
    }
    try {
      const attributes = parseAttrs();
      await createDataResource({
        name: name.trim(),
        description: desc.trim() || null,
        resource_kind: kind,
        attributes,
        anchor_channel_id: anchorCh.trim() || null,
        anchor_knowledge_base_id: anchorKb.trim() || null,
      });
      toast.success('Data resource created');
      setName('');
      setDesc('');
      setAttrsJson('{}');
      setAnchorCh('');
      setAnchorKb('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    }
  };

  const startEdit = (r: DataResourceOut) => {
    setEditId(r.id);
    setName(r.name);
    setDesc(r.description ?? '');
    setKind(r.resource_kind);
    setAttrsJson(JSON.stringify(r.attributes ?? {}, null, 2));
    setAnchorCh(r.anchor_channel_id ?? '');
    setAnchorKb(r.anchor_knowledge_base_id ?? '');
  };

  const onSaveEdit = async () => {
    if (!editId || !name.trim()) return;
    try {
      const attributes = parseAttrs();
      await patchDataResource(editId, {
        name: name.trim(),
        description: desc.trim() || null,
        resource_kind: kind,
        attributes,
        anchor_channel_id: anchorCh.trim() || null,
        anchor_knowledge_base_id: anchorKb.trim() || null,
      });
      toast.success('Updated');
      setEditId(null);
      setName('');
      setDesc('');
      setAttrsJson('{}');
      setAnchorCh('');
      setAnchorKb('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const resetForm = () => {
    setEditId(null);
    setName('');
    setDesc('');
    setAttrsJson('{}');
    setAnchorCh('');
    setAnchorKb('');
  };

  const onDelete = async (r: DataResourceOut) => {
    if (!window.confirm(`Delete data resource "${r.name}"?`)) return;
    try {
      await deleteDataResource(r.id);
      toast.success('Deleted');
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
        <Link to="/console/data-security/groups" className="console-group-access-back">
          ← Access groups
        </Link>
        <h1>Data resources</h1>
        <p className="page-subtitle">
          Named policies with a <strong>resource kind</strong> and JSON <strong>attributes</strong> (whitelisted keys per
          kind). Grant access by attaching resources to an access group. With{' '}
          <code>OPENKMS_ENFORCE_GROUP_DATA_SCOPES</code>, visibility is the union of legacy ID scopes and matching data
          resources.
        </p>
      </div>

      {loading ? (
        <p className="console-group-access-muted">Loading…</p>
      ) : (
        <>
          <form className="console-ds-groups-form" onSubmit={(e) => void onSubmitForm(e)}>
            <h2>{editId ? 'Edit data resource' : 'New data resource'}</h2>
            <div className="console-ds-groups-row">
              <label>
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={256} />
              </label>
              <label>
                Kind
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="console-ds-groups-grow">
              Description
              <input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={2000} />
            </label>
            <div className="console-ds-groups-row">
              <label>
                Anchor channel ID (optional)
                <input value={anchorCh} onChange={(e) => setAnchorCh(e.target.value)} placeholder="document channel id" />
              </label>
              <label>
                Anchor KB ID (optional)
                <input value={anchorKb} onChange={(e) => setAnchorKb(e.target.value)} placeholder="knowledge base id" />
              </label>
            </div>
            <label className="console-ds-groups-grow">
              Attributes (JSON object)
              <textarea
                value={attrsJson}
                onChange={(e) => setAttrsJson(e.target.value)}
                rows={6}
                className="console-dr-json"
                spellCheck={false}
              />
            </label>
            <div className="console-ds-groups-actions">
              {editId ? (
                <>
                  <button type="submit" className="btn-primary">
                    Save changes
                  </button>
                  <button type="button" className="btn-secondary" onClick={resetForm}>
                    Cancel edit
                  </button>
                </>
              ) : (
                <button type="submit" className="btn-primary">
                  Create
                </button>
              )}
            </div>
          </form>

          <h2 className="console-dr-table-title">All data resources</h2>
          <table className="console-dr-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Attributes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>
                    <code>{r.resource_kind}</code>
                  </td>
                  <td className="console-dr-attr-cell">
                    <code>{JSON.stringify(r.attributes)}</code>
                  </td>
                  <td>
                    <button type="button" className="btn-link" onClick={() => startEdit(r)}>
                      Edit
                    </button>{' '}
                    <button type="button" className="btn-link danger" onClick={() => void onDelete(r)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
