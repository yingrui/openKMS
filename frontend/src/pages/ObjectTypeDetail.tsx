import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, X, Search as SearchIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchObjectType,
  fetchObjectInstances,
  createObjectInstance,
  updateObjectInstance,
  deleteObjectInstance,
  type ObjectTypeResponse,
  type ObjectInstanceResponse,
  type PropertyDef,
} from '../data/ontologyApi';
import './ObjectTypeDetail.css';

function displayValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function ObjectTypeDetail() {
  const { typeId } = useParams<{ typeId: string }>();
  const { isAdmin } = useAuth();
  const [objectType, setObjectType] = useState<ObjectTypeResponse | null>(null);
  const [instances, setInstances] = useState<ObjectInstanceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [instancesLoading, setInstancesLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editInstance, setEditInstance] = useState<ObjectInstanceResponse | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const loadType = useCallback(async () => {
    if (!typeId) return;
    try {
      const data = await fetchObjectType(typeId);
      setObjectType(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load object type');
    } finally {
      setLoading(false);
    }
  }, [typeId]);

  const loadInstances = useCallback(
    async (searchQuery?: string) => {
      if (!typeId) return;
      setInstancesLoading(true);
      try {
        const res = await fetchObjectInstances(typeId, {
          search: (searchQuery ?? search).trim() || undefined,
        });
        setInstances(res.items);
      } catch {
        /* noop */
      } finally {
        setInstancesLoading(false);
      }
    },
    [typeId, search]
  );

  useEffect(() => {
    loadType();
  }, [loadType]);

  const prevTypeIdRef = useRef<string | null>(null);
  const prevSearchRef = useRef<string | null>(null);
  useEffect(() => {
    if (!typeId) return;
    const typeChanged = prevTypeIdRef.current !== typeId;
    prevTypeIdRef.current = typeId;
    const isSearchChange = prevSearchRef.current !== null && !typeChanged;
    prevSearchRef.current = search;
    const delay = isSearchChange ? 300 : 0;
    const t = setTimeout(() => loadInstances(search), delay);
    return () => clearTimeout(t);
  }, [typeId, search, loadInstances]);

  const openAdd = () => {
    setEditInstance(null);
    const initial: Record<string, unknown> = {};
    for (const p of objectType?.properties ?? []) {
      initial[p.name] = p.type === 'boolean' ? false : p.type === 'number' ? 0 : '';
    }
    setFormData(initial);
    setShowForm(true);
  };

  const openEdit = (inst: ObjectInstanceResponse) => {
    setEditInstance(inst);
    setFormData({ ...inst.data });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditInstance(null);
    setFormData({});
  };

  const handleSave = async () => {
    if (!typeId || !objectType) return;
    for (const p of objectType.properties ?? []) {
      if (p.required) {
        const v = formData[p.name];
        if (v === undefined || v === null || v === '') {
          toast.error(`"${p.name}" is required`);
          return;
        }
      }
    }
    setSaving(true);
    try {
      if (editInstance) {
        await updateObjectInstance(typeId, editInstance.id, formData);
        toast.success('Object updated');
      } else {
        await createObjectInstance(typeId, formData);
        toast.success('Object created');
      }
      closeForm();
      loadInstances();
      loadType();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (inst: ObjectInstanceResponse) => {
    if (!typeId) return;
    if (!confirm('Delete this object?')) return;
    try {
      await deleteObjectInstance(typeId, inst.id);
      toast.success('Object deleted');
      loadInstances();
      loadType();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const updateFormField = (name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  if (loading || !objectType) {
    return (
      <div className="object-type-detail">
        <p className="object-type-detail-loading">Loading...</p>
      </div>
    );
  }

  const properties: PropertyDef[] = objectType.properties ?? [];
  const cols = [...properties.map((p) => p.name), 'actions'];

  return (
    <div className="object-type-detail">
      <div className="object-type-detail-header">
        <Link to="/objects" className="object-type-back">
          <ArrowLeft size={18} />
          <span>Objects</span>
        </Link>
        <div className="object-type-detail-title-row">
          <h1>{objectType.name}</h1>
          {isAdmin && (
            <button type="button" className="btn btn-primary" onClick={openAdd}>
              <Plus size={18} />
              <span>Add Object</span>
            </button>
          )}
        </div>
        {objectType.description && (
          <p className="object-type-detail-desc">{objectType.description}</p>
        )}
      </div>

      <div className="object-type-search-bar">
        <SearchIcon size={18} className="object-type-search-icon" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search instances..."
          className="object-type-search-input"
        />
      </div>

      <div className="object-type-table-wrapper">
        <table className="object-type-table">
          <thead>
            <tr>
              {properties.map((p) => (
                <th key={p.name}>{p.name}</th>
              ))}
              {isAdmin && <th className="object-type-actions-col" />}
            </tr>
          </thead>
          <tbody>
            {instancesLoading && instances.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="object-type-empty">
                  <span className="object-type-loading">
                    <Loader2 size={18} className="object-type-spinner" />
                    {search ? 'Searching...' : 'Loading instances...'}
                  </span>
                </td>
              </tr>
            ) : instances.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="object-type-empty">
                  {search ? 'No matching instances' : 'No instances yet.' + (isAdmin ? ' Click "Add Object" to create one.' : '')}
                </td>
              </tr>
            ) : (
              instances.map((inst) => (
                <tr key={inst.id}>
                  {properties.map((p) => (
                    <td key={p.name}>{displayValue(inst.data?.[p.name])}</td>
                  ))}
                  {isAdmin && (
                    <td className="object-type-actions-col">
                      <button
                        type="button"
                        title="Edit"
                        aria-label="Edit"
                        onClick={() => openEdit(inst)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        aria-label="Delete"
                        onClick={() => handleDelete(inst)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="object-type-dialog-overlay" onClick={closeForm}>
          <div className="object-type-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="object-type-dialog-header">
              <h2>{editInstance ? 'Edit Object' : 'Add Object'}</h2>
              <button type="button" className="object-type-dialog-close" onClick={closeForm}>
                <X size={20} />
              </button>
            </div>
            <div className="object-type-dialog-body">
              {(objectType.properties ?? []).map((p) => (
                <label key={p.name}>
                  <span>{p.name}{p.required ? ' *' : ''}</span>
                  {p.type === 'boolean' ? (
                    <select
                      value={String(formData[p.name] ?? false)}
                      onChange={(e) => updateFormField(p.name, e.target.value === 'true')}
                    >
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  ) : p.type === 'number' ? (
                    <input
                      type="number"
                      value={String(formData[p.name] ?? '')}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateFormField(p.name, v === '' ? undefined : Number(v));
                      }}
                      placeholder={p.required ? 'Required' : 'Optional'}
                    />
                  ) : (
                    <input
                      type="text"
                      value={String(formData[p.name] ?? '')}
                      onChange={(e) => updateFormField(p.name, e.target.value)}
                      placeholder={p.required ? 'Required' : 'Optional'}
                    />
                  )}
                </label>
              ))}
              {properties.length === 0 && (
                <p className="object-type-no-props">No properties defined. Add properties in Console → Object Types.</p>
              )}
            </div>
            <div className="object-type-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeForm}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? 'Saving...' : editInstance ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
