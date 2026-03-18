import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchObjectTypes,
  createObjectType,
  updateObjectType,
  deleteObjectType,
  type ObjectTypeResponse,
  type PropertyDef,
} from '../../data/ontologyApi';
import './ConsoleObjectTypes.css';

const PROPERTY_TYPES = ['string', 'number', 'boolean'];

function PropertyRow({
  prop,
  onChange,
  onRemove,
}: {
  prop: PropertyDef;
  onChange: (p: PropertyDef) => void;
  onRemove: () => void;
}) {
  return (
    <div className="console-obj-property-row">
      <input
        type="text"
        placeholder="Property name"
        value={prop.name}
        onChange={(e) => onChange({ ...prop, name: e.target.value })}
      />
      <select
        value={prop.type}
        onChange={(e) => onChange({ ...prop, type: e.target.value })}
      >
        {PROPERTY_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <label className="console-obj-property-required">
        <input
          type="checkbox"
          checked={prop.required}
          onChange={(e) => onChange({ ...prop, required: e.target.checked })}
        />
        Required
      </label>
      <button type="button" onClick={onRemove} aria-label="Remove property">
        <X size={14} />
      </button>
    </div>
  );
}

export function ConsoleObjectTypes() {
  const [types, setTypes] = useState<ObjectTypeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editType, setEditType] = useState<ObjectTypeResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formProperties, setFormProperties] = useState<PropertyDef[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchObjectTypes();
      setTypes(res.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load object types');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditType(null);
    setFormName('');
    setFormDescription('');
    setFormProperties([]);
    setShowForm(true);
  };

  const openEdit = (t: ObjectTypeResponse) => {
    setEditType(t);
    setFormName(t.name);
    setFormDescription(t.description || '');
    setFormProperties(
      (t.properties || []).map((p) =>
        typeof p === 'object' && 'name' in p
          ? { name: p.name, type: p.type || 'string', required: !!p.required }
          : { name: '', type: 'string', required: false }
      )
    );
    setShowForm(true);
  };

  const addProperty = () => {
    setFormProperties((prev) => [...prev, { name: '', type: 'string', required: false }]);
  };

  const updateProperty = (idx: number, p: PropertyDef) => {
    setFormProperties((prev) => {
      const next = [...prev];
      next[idx] = p;
      return next;
    });
  };

  const removeProperty = (idx: number) => {
    setFormProperties((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!formName.trim()) return;
    const props = formProperties.filter((p) => p.name.trim());
    setSubmitting(true);
    try {
      if (editType) {
        await updateObjectType(editType.id, {
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          properties: props,
        });
        toast.success('Object type updated');
      } else {
        await createObjectType({
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          properties: props,
        });
        toast.success('Object type created');
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
    if (!window.confirm('Delete this object type? All instances will be deleted.')) return;
    try {
      await deleteObjectType(id);
      toast.success('Object type deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="console-object-types">
      <div className="page-header">
        <div>
          <h1>Object Types</h1>
          <p className="page-subtitle">
            Define schema for entity types (e.g. Disease, InsuranceProduct). Admin only.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={18} />
          <span>New Object Type</span>
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
                <th>Description</th>
                <th>Properties</th>
                <th>Instances</th>
                <th className="console-table-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.length === 0 ? (
                <tr>
                  <td colSpan={5} className="console-table-empty">
                    No object types yet. Create one to get started.
                  </td>
                </tr>
              ) : (
                types.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong></td>
                    <td>{t.description || '—'}</td>
                    <td>{(t.properties || []).length}</td>
                    <td>{t.instance_count}</td>
                    <td className="console-table-actions">
                      <div className="console-table-btns">
                        <button type="button" title="Edit" onClick={() => openEdit(t)}>
                          <Pencil size={16} />
                        </button>
                        <button type="button" title="Delete" onClick={() => handleDelete(t.id)}>
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
        <div className="console-modal-overlay" onClick={() => !submitting && setShowForm(false)}>
          <div className="console-modal" onClick={(e) => e.stopPropagation()}>
            <div className="console-modal-header">
              <h2>{editType ? 'Edit Object Type' : 'New Object Type'}</h2>
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
                Name
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Disease"
                />
              </label>
              <label>
                Description
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <div className="console-modal-section">
                <div className="console-modal-section-header">
                  <span>Properties</span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addProperty}>
                    <Plus size={14} />
                    Add
                  </button>
                </div>
                {formProperties.length === 0 ? (
                  <p className="console-modal-hint">No properties. Add one to define fields.</p>
                ) : (
                  <div className="console-obj-properties-list">
                    {formProperties.map((p, i) => (
                      <PropertyRow
                        key={i}
                        prop={p}
                        onChange={(np) => updateProperty(i, np)}
                        onRemove={() => removeProperty(i)}
                      />
                    ))}
                  </div>
                )}
              </div>
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
                disabled={!formName.trim() || submitting}
              >
                {submitting ? 'Saving…' : editType ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
