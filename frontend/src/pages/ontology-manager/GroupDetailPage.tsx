import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Save, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchObjectTypes, type ObjectTypeResponse } from '../../data/ontologyApi';
import {
  deleteOntologyGroup,
  fetchOntologyGroup,
  fetchOntologyGroupRelated,
  updateOntologyGroup,
  type OntologyGroupRelatedResponse,
  type OntologyGroupResponse,
} from '../../data/ontologyFunctionsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { CheckList, CheckListItem } from '../../styles/design-system';
import {
  EntityViewField,
  EntityViewHeader,
  EntityViewLoading,
  EntityViewPanel,
  EntityViewShell,
} from './EntityViewShell';
import '../ontology/ontology-admin.scss';

type GroupDetailContext = {
  group: OntologyGroupResponse;
  groupId: string;
  objectTypes: ObjectTypeResponse[];
  displayName: string;
  setDisplayName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  selectedTypeIds: Set<string>;
  setTypeSelected: (typeId: string, checked: boolean) => void;
  saving: boolean;
  onSave: () => Promise<void>;
  onDelete: () => Promise<void>;
  reload: () => Promise<void>;
};

const GroupDetailCtx = createContext<GroupDetailContext | null>(null);

function useGroupDetail(): GroupDetailContext {
  const ctx = useContext(GroupDetailCtx);
  if (!ctx) throw new Error('useGroupDetail requires GroupDetailPage');
  return ctx;
}

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

  const setTypeSelected = useCallback((typeId: string, checked: boolean) => {
    setSelectedTypeIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(typeId);
      else next.delete(typeId);
      return next;
    });
  }, []);

  const onSave = useCallback(async () => {
    if (!groupId) return;
    setSaving(true);
    try {
      const updated = await updateOntologyGroup(groupId, {
        display_name: displayName.trim(),
        description: description.trim() || undefined,
        object_type_ids: [...selectedTypeIds],
      });
      setGroup(updated);
      setSelectedTypeIds(new Set(updated.object_type_ids));
      toast.success(t('groups.saved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('groups.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [description, displayName, groupId, selectedTypeIds, t]);

  const onDelete = useCallback(async () => {
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
  }, [confirm, displayName, groupId, navigate, t]);

  const value = useMemo(
    () =>
      group
        ? {
            group,
            groupId,
            objectTypes,
            displayName,
            setDisplayName,
            description,
            setDescription,
            selectedTypeIds,
            setTypeSelected,
            saving,
            onSave,
            onDelete,
            reload: load,
          }
        : null,
    [
      description,
      displayName,
      group,
      groupId,
      load,
      objectTypes,
      onDelete,
      onSave,
      saving,
      selectedTypeIds,
      setTypeSelected,
    ],
  );

  if (loading || !group || !value) {
    return <EntityViewLoading label={t('shared.loading')} />;
  }

  const base = `/ontology-manager/groups/${groupId}`;

  return (
    <GroupDetailCtx.Provider value={value}>
      <EntityViewShell
        backTo="/ontology-manager/groups"
        backLabel={t('groups.backToList')}
        kind={t('groups.kind')}
        title={group.display_name}
        meta={`${t('groups.objectTypes')}: ${selectedTypeIds.size}`}
        navItems={[
          { to: base, label: t('groups.overview'), end: true },
          { to: `${base}/related`, label: t('groups.relatedResources') },
        ]}
      >
        <Outlet />
      </EntityViewShell>
    </GroupDetailCtx.Provider>
  );
}

export function GroupOverviewTab() {
  const { t } = useTranslation('ontology');
  const {
    groupId,
    objectTypes,
    displayName,
    setDisplayName,
    description,
    setDescription,
    selectedTypeIds,
    setTypeSelected,
    saving,
    onSave,
    onDelete,
  } = useGroupDetail();
  const [typeQuery, setTypeQuery] = useState('');

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

  return (
    <>
      <EntityViewHeader
        title={t('groups.overview')}
        subtitle={t('groups.detailSubtitle')}
        actions={
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
      />

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
            <Link to={`/ontology-manager/object-types?group=${encodeURIComponent(groupId)}`}>
              {t('groups.createObjectTypes')}
            </Link>
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
    </>
  );
}

export function GroupRelatedTab() {
  const { t } = useTranslation('ontology');
  const { groupId } = useGroupDetail();
  const [related, setRelated] = useState<OntologyGroupRelatedResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchOntologyGroupRelated(groupId)
      .then((res) => {
        if (!cancelled) setRelated(res);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : t('groups.relatedLoadFailed'));
          setRelated(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, t]);

  return (
    <>
      <EntityViewHeader
        title={t('groups.relatedResources')}
        subtitle={t('groups.relatedResourcesHint')}
      />
      {loading ? (
        <p className="ontology-admin-loading">
          <Loader2 className="spin" size={18} aria-hidden /> {t('shared.loading')}
        </p>
      ) : !related || related.object_type_ids.length === 0 ? (
        <EntityViewPanel>
          <p className="entity-view__field-hint">{t('groups.relatedEmptyNoTypes')}</p>
        </EntityViewPanel>
      ) : (
        <EntityViewPanel>
          <div className="entity-view__related">
            <RelatedResourceBlock
              label={t('groups.relatedLinkTypes')}
              empty={t('groups.relatedNone')}
              items={related.link_types.map((lt) => ({
                id: lt.id,
                to: `/ontology-manager/link-types/${lt.id}`,
                primary: lt.name,
                secondary:
                  lt.source_object_type_name && lt.target_object_type_name
                    ? `${lt.source_object_type_name} → ${lt.target_object_type_name}`
                    : undefined,
              }))}
            />
            <RelatedResourceBlock
              label={t('groups.relatedFunctions')}
              empty={t('groups.relatedNone')}
              items={related.functions.map((fn) => ({
                id: fn.id,
                to: `/ontology-manager/functions/${fn.id}`,
                primary: fn.display_name || fn.api_name,
                secondary: fn.api_name,
              }))}
            />
            <RelatedResourceBlock
              label={t('groups.relatedActions')}
              empty={t('groups.relatedNone')}
              items={related.action_types.map((at) => ({
                id: at.id,
                to: `/ontology-manager/action-types/${at.id}`,
                primary: at.display_name || at.api_name,
                secondary: at.status,
              }))}
            />
          </div>
        </EntityViewPanel>
      )}
    </>
  );
}

function RelatedResourceBlock({
  label,
  empty,
  items,
}: {
  label: string;
  empty: string;
  items: { id: string; to: string; primary: string; secondary?: string }[];
}) {
  return (
    <div className="entity-view__related-block">
      <h3 className="entity-view__related-heading">
        {label}
        <span className="entity-view__related-count">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="entity-view__field-hint">{empty}</p>
      ) : (
        <ul className="entity-view__related-list">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={item.to}>{item.primary}</Link>
              {item.secondary ? (
                <span className="entity-view__related-meta">{item.secondary}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
