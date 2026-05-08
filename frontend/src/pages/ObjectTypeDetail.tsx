import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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

export function ObjectTypeDetail() {
  const { t } = useTranslation('explore');
  const displayValue = useCallback(
    (v: unknown): string => {
      if (v === null || v === undefined) return t('shared.dash');
      if (typeof v === 'boolean') return v ? t('ontology.objectTypeDetail.booleanYes') : t('ontology.objectTypeDetail.booleanNo');
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    },
    [t]
  );
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
      const data = await fetchObjectType(typeId, { countFromNeo4j: true });
      setObjectType(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('ontology.objectTypeDetail.toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [typeId, t]);

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
    const timer = setTimeout(() => loadInstances(search), delay);
    return () => clearTimeout(timer);
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
          toast.error(t('ontology.objectTypeDetail.fieldRequired', { field: p.name }));
          return;
        }
      }
    }
    setSaving(true);
    try {
      if (editInstance) {
        await updateObjectInstance(typeId, editInstance.id, formData);
        toast.success(t('ontology.objectTypeDetail.toastObjectUpdated'));
      } else {
        await createObjectInstance(typeId, formData);
        toast.success(t('ontology.objectTypeDetail.toastObjectCreated'));
      }
      closeForm();
      loadInstances();
      loadType();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('ontology.objectTypeDetail.toastSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (inst: ObjectInstanceResponse) => {
    if (!typeId) return;
    if (!confirm(t('ontology.objectTypeDetail.deleteConfirm'))) return;
    try {
      await deleteObjectInstance(typeId, inst.id);
      toast.success(t('ontology.objectTypeDetail.toastObjectDeleted'));
      loadInstances();
      loadType();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('ontology.objectTypeDetail.toastDeleteFailed'));
    }
  };

  const updateFormField = (name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  if (loading || !objectType) {
    return (
      <div className="object-type-detail">
        <p className="object-type-detail-loading">{t('ontology.objectTypeDetail.loading')}</p>
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
          <span>{t('ontology.objectTypeDetail.backObjects')}</span>
        </Link>
        <div className="object-type-detail-title-row">
          <h1>{objectType.name}</h1>
          {isAdmin && (
            <button type="button" className="btn btn-primary" onClick={openAdd}>
              <Plus size={18} />
              <span>{t('ontology.objectTypeDetail.addObject')}</span>
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
          placeholder={t('ontology.objectTypeDetail.searchPlaceholder')}
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
                    {search ? t('ontology.objectTypeDetail.loadingSearching') : t('ontology.objectTypeDetail.loadingInstances')}
                  </span>
                </td>
              </tr>
            ) : instances.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="object-type-empty">
                  {search
                    ? t('ontology.objectTypeDetail.noMatchingInstances')
                    : isAdmin
                      ? t('ontology.objectTypeDetail.emptyAdmin')
                      : t('ontology.objectTypeDetail.emptyUser')}
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
                        title={t('ontology.objectTypeDetail.editTitle')}
                        aria-label={t('ontology.objectTypeDetail.editTitle')}
                        onClick={() => openEdit(inst)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        title={t('ontology.objectTypeDetail.deleteTitle')}
                        aria-label={t('ontology.objectTypeDetail.deleteTitle')}
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
              <h2>{editInstance ? t('ontology.objectTypeDetail.dialogEditObject') : t('ontology.objectTypeDetail.dialogAddObject')}</h2>
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
                      <option value="false">{t('ontology.objectTypeDetail.booleanNo')}</option>
                      <option value="true">{t('ontology.objectTypeDetail.booleanYes')}</option>
                    </select>
                  ) : p.type === 'number' ? (
                    <input
                      type="number"
                      value={String(formData[p.name] ?? '')}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateFormField(p.name, v === '' ? undefined : Number(v));
                      }}
                      placeholder={p.required ? t('ontology.objectTypeDetail.placeholderRequired') : t('ontology.objectTypeDetail.placeholderOptional')}
                    />
                  ) : (
                    <input
                      type="text"
                      value={String(formData[p.name] ?? '')}
                      onChange={(e) => updateFormField(p.name, e.target.value)}
                      placeholder={p.required ? t('ontology.objectTypeDetail.placeholderRequired') : t('ontology.objectTypeDetail.placeholderOptional')}
                    />
                  )}
                </label>
              ))}
              {properties.length === 0 && (
                <p className="object-type-no-props">{t('ontology.objectTypeDetail.noPropertiesHint')}</p>
              )}
            </div>
            <div className="object-type-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeForm}>
                {t('ontology.objectTypeDetail.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? t('ontology.objectTypeDetail.saving') : editInstance ? t('ontology.objectTypeDetail.save') : t('ontology.objectTypeDetail.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
