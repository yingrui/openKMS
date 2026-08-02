import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Save, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchObjectTypes, type ObjectTypeResponse } from '../../data/ontologyApi';
import {
  deleteOntologyGroup,
  fetchOntologyGroup,
  updateOntologyGroup,
  type OntologyGroupResponse,
} from '../../data/ontologyFunctionsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { CheckList, CheckListItem } from '../../styles/design-system';
import {
  EntityViewField,
  EntityViewLoading,
  EntityViewPanel,
  EntityViewShell,
} from './EntityViewShell';
import '../ontology/ontology-admin.scss';

export function GroupDetailPage() {
  const { t } = useTranslation('ontology');
  const { groupId = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [group, setGroup] = useState<OntologyGroupResponse | null>(null);
  const [objectTypes, setObjectTypes] = useState<ObjectTypeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTypeIds, setSelectedTypeIds] = useState<Set<string>>(new Set());
  const [typeQuery, setTypeQuery] = useState('');

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const [g, typesRes] = await Promise.all([fetchOntologyGroup(groupId), fetchObjectTypes()]);
      setGroup(g);
      setObjectTypes(typesRes.items);
      setDisplayName(g.display_name);
      setDescription(g.description ?? '');
      setSelectedTypeIds(new Set(g.object_type_ids));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('groups.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [groupId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const setTypeSelected = (typeId: string, checked: boolean) => {
    setSelectedTypeIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(typeId);
      else next.delete(typeId);
      return next;
    });
  };

  const selectedTypes = useMemo(
    () =>
      objectTypes
        .filter((ot) => selectedTypeIds.has(ot.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [objectTypes, selectedTypeIds],
  );

  const filteredTypes = useMemo(() => {
    const q = typeQuery.trim().toLowerCase();
    const list = q
      ? objectTypes.filter((ot) => ot.name.toLowerCase().includes(q))
      : objectTypes;
    return [...list].sort((a, b) => {
      const aSel = selectedTypeIds.has(a.id) ? 0 : 1;
      const bSel = selectedTypeIds.has(b.id) ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      return a.name.localeCompare(b.name);
    });
  }, [objectTypes, selectedTypeIds, typeQuery]);

  const onSave = async () => {
    if (!groupId) return;
    setSaving(true);
    try {
      const updated = await updateOntologyGroup(groupId, {
        display_name: displayName.trim(),
        description: description.trim() || undefined,
        object_type_ids: [...selectedTypeIds],
      });
      setGroup(updated);
      toast.success(t('groups.saved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('groups.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!groupId) return;
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('groups.deleteConfirm', { name: displayName }),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteOntologyGroup(groupId);
      toast.success(t('groups.deleted'));
      navigate('/ontology-manager/groups');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('groups.loadFailed'));
    }
  };

  if (loading || !group) {
    return <EntityViewLoading label={t('shared.loading')} />;
  }

  return (
    <EntityViewShell
      backTo="/ontology-manager/groups"
      backLabel={t('groups.backToList')}
      kind={t('groups.kind')}
      title={group.display_name}
      meta={`${t('groups.objectTypes')}: ${selectedTypeIds.size}`}
      sectionTitle={t('groups.overview')}
      sectionSubtitle={t('groups.detailSubtitle')}
      toolbar={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => void onDelete()}>
            <Trash2 size={16} aria-hidden />
            {t('shared.delete')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={saving}>
            <Save size={16} aria-hidden />
            {saving ? t('shared.saving') : t('shared.save')}
          </button>
        </>
      }
    >
      <EntityViewPanel>
        <div className="entity-view__form">
          <EntityViewField label={t('groups.displayName')}>
            <input
              className="console-form-control"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </EntityViewField>
          <EntityViewField label={t('groups.description')}>
            <textarea
              className="console-form-control"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </EntityViewField>
        </div>
      </EntityViewPanel>

      <EntityViewPanel
        title={t('groups.assignObjectTypes')}
        description={t('groups.assignObjectTypesHint', { count: selectedTypeIds.size })}
      >
        {objectTypes.length === 0 ? (
          <p className="entity-view__field-hint">
            {t('groups.noObjectTypes')}{' '}
            <Link to="/ontology-manager/object-types">{t('groups.createObjectTypes')}</Link>
          </p>
        ) : (
          <div className="entity-view__assign">
            {selectedTypes.length > 0 && (
              <div className="entity-view__assign-selected">
                <span className="entity-view__assign-selected-label">{t('groups.selectedTypes')}</span>
                <ul className="entity-view__assign-chips">
                  {selectedTypes.map((ot) => (
                    <li key={ot.id}>
                      <span className="account-pill account-pill--accent entity-view__assign-chip">
                        <Link to={`/ontology-manager/object-types/${ot.id}`}>{ot.name}</Link>
                        <button
                          type="button"
                          className="entity-view__assign-chip-remove"
                          onClick={() => setTypeSelected(ot.id, false)}
                          aria-label={t('groups.removeType', { name: ot.name })}
                        >
                          <X size={14} aria-hidden />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="entity-view__assign-search">
              <Search size={16} aria-hidden />
              <input
                type="search"
                value={typeQuery}
                onChange={(e) => setTypeQuery(e.target.value)}
                placeholder={t('groups.searchObjectTypesPlaceholder')}
                aria-label={t('groups.searchObjectTypes')}
              />
            </div>

            {filteredTypes.length === 0 ? (
              <p className="entity-view__field-hint">{t('groups.noMatchingTypes')}</p>
            ) : (
              <CheckList className="entity-view__assign-list">
                {filteredTypes.map((ot) => (
                  <CheckListItem
                    key={ot.id}
                    checked={selectedTypeIds.has(ot.id)}
                    onChange={(checked) => setTypeSelected(ot.id, checked)}
                  >
                    {ot.name}
                  </CheckListItem>
                ))}
              </CheckList>
            )}
          </div>
        )}
      </EntityViewPanel>
    </EntityViewShell>
  );
}
