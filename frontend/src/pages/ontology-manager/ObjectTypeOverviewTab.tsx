import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Database, ExternalLink, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '../../contexts/ConfirmContext';
import { purgeObjectTypeInstances } from '../../data/ontologyApi';
import {
  EntityViewField,
  EntityViewHeader,
  EntityViewPanel,
  EntityViewStat,
  EntityViewStats,
} from './EntityViewShell';
import { useObjectTypeDetail } from './useObjectTypeDetail';

export function ObjectTypeOverviewTab() {
  const { t } = useTranslation('ontology');
  const confirm = useConfirm();
  const {
    objectType,
    relatedLinks,
    relatedActions,
    relatedFunctions,
    name,
    setName,
    description,
    setDescription,
    isMasterData,
    setIsMasterData,
    displayProperty,
    setDisplayProperty,
    properties,
    neo4jDataSources,
    saving,
    indexing,
    onSave,
    onIndex,
    reload,
  } = useObjectTypeDetail();
  const [neo4jId, setNeo4jId] = useState(neo4jDataSources[0]?.id || '');
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [purging, setPurging] = useState(false);
  const purgePhrase = `PURGE ${objectType.name}`;

  useEffect(() => {
    if (!neo4jId && neo4jDataSources[0]) setNeo4jId(neo4jDataSources[0].id);
  }, [neo4jId, neo4jDataSources]);

  const handlePurgeType = async () => {
    if (purgeConfirm.trim() !== purgePhrase) {
      toast.error(t('objectTypes.purgeConfirmMismatch'));
      return;
    }
    if (
      !(await confirm({
        title: t('objectTypes.purgeTypeTitle'),
        message: t('objectTypes.purgeTypeHint'),
        confirmLabel: t('objectTypes.purgeTypeAction'),
        danger: true,
      }))
    ) {
      return;
    }
    setPurging(true);
    try {
      const res = await purgeObjectTypeInstances(objectType.id, {
        confirm: purgePhrase,
        neo4j_data_source_id: neo4jId || undefined,
      });
      toast.success(
        t('objectTypes.purgeSuccess', {
          objects: res.object_instances_deleted,
          links: res.link_instances_deleted,
          nodes: res.neo4j_nodes_deleted,
          rels: res.neo4j_relationships_deleted,
        }),
      );
      setPurgeConfirm('');
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('objectTypes.purgeFailed'));
    } finally {
      setPurging(false);
    }
  };

  const relatedLinksValue =
    relatedLinks.length === 0
      ? '—'
      : relatedLinks.map((lt, i) => (
          <span key={lt.id}>
            {i > 0 ? ', ' : ''}
            <Link to={`/ontology-manager/link-types/${lt.id}`}>{lt.name}</Link>
          </span>
        ));
  const relatedActionsValue =
    relatedActions.length === 0
      ? '—'
      : relatedActions.map((a, i) => (
          <span key={a.id}>
            {i > 0 ? ', ' : ''}
            <Link to={`/ontology-manager/action-types/${a.id}`}>{a.display_name}</Link>
          </span>
        ));
  const relatedFunctionsValue =
    relatedFunctions.length === 0
      ? '—'
      : relatedFunctions.map((fn, i) => (
          <span key={fn.id}>
            {i > 0 ? ', ' : ''}
            <Link to={`/ontology-manager/functions/${fn.id}`}>{fn.display_name}</Link>
          </span>
        ));

  return (
    <>
      <EntityViewHeader
        title={t('objectTypes.overview')}
        subtitle={objectType.description || t('objectTypes.noDescription')}
        actions={
          <>
            <Link to={`/object-explorer/objects/${objectType.id}`} className="btn btn-secondary">
              <ExternalLink size={16} aria-hidden />
              {t('objectTypes.openInExplorer')}
            </Link>
            <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={saving}>
              <Save size={16} aria-hidden />
              {saving ? t('shared.saving') : t('shared.save')}
            </button>
          </>
        }
      />
      <EntityViewStats>
        <EntityViewStat label={t('objectTypes.dataset')} value={objectType.dataset_name || '—'} />
        <EntityViewStat label={t('objectTypes.properties')} value={(objectType.properties || []).length} />
        <EntityViewStat label={t('objectTypes.instances')} value={objectType.instance_count} />
        <EntityViewStat label={t('objectTypes.relatedLinkTypes')} value={relatedLinksValue} />
        <EntityViewStat label={t('objectTypes.relatedActions')} value={relatedActionsValue} />
        <EntityViewStat label={t('objectTypes.relatedFunctions')} value={relatedFunctionsValue} />
      </EntityViewStats>
      <EntityViewPanel title={t('objectTypes.general')} description={t('objectTypes.generalHint')}>
        <div className="entity-view__form">
          <EntityViewField label={t('objectTypes.name')}>
            <input className="console-form-control" value={name} onChange={(e) => setName(e.target.value)} />
          </EntityViewField>
          <EntityViewField label={t('objectTypes.description')}>
            <textarea
              className="console-form-control"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </EntityViewField>
          <label
            className="console-modal-checkbox-row entity-view__checkbox-row"
            title={t('objectTypes.masterDataHint')}
          >
            <input
              type="checkbox"
              className="ds-checkbox"
              checked={isMasterData}
              onChange={(e) => setIsMasterData(e.target.checked)}
            />
            <span>{t('objectTypes.masterData')}</span>
          </label>
          <EntityViewField label={t('objectTypes.displayProperty')}>
            <select
              className="console-form-control"
              value={displayProperty}
              onChange={(e) => setDisplayProperty(e.target.value)}
            >
              <option value="">{t('objectTypes.none')}</option>
              {properties
                .filter((p) => p.name.trim() && p.enabled !== false)
                .map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
            </select>
          </EntityViewField>
        </div>
      </EntityViewPanel>
      {(objectType.dataset_id || objectType.instance_count > 0) && neo4jDataSources.length > 0 ? (
        <EntityViewPanel
          title={t('objectTypes.indexHeading')}
          description={t('objectTypes.indexHint')}
          footer={
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!neo4jId || indexing}
              onClick={() => void onIndex(neo4jId)}
            >
              <Database size={16} aria-hidden />
              {indexing ? t('objectTypes.indexing') : t('objectTypes.index')}
            </button>
          }
        >
          <div className="entity-view__form">
            <EntityViewField label={t('objectTypes.neo4jSource')}>
              <select
                className="console-form-control"
                value={neo4jId}
                onChange={(e) => setNeo4jId(e.target.value)}
                disabled={indexing}
              >
                {neo4jDataSources.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name} ({ds.host}:{ds.port ?? 7687})
                  </option>
                ))}
              </select>
            </EntityViewField>
          </div>
        </EntityViewPanel>
      ) : null}
      <EntityViewPanel
        title={t('objectTypes.purgeTypeTitle')}
        description={t('objectTypes.purgeTypeHint')}
        defaultCollapsed
      >
        <div className="entity-view__form ontology-danger-zone ontology-danger-zone--embedded">
          {neo4jDataSources.length > 0 ? (
            <EntityViewField label={t('objectTypes.neo4jSource')}>
              <select
                className="console-form-control"
                value={neo4jId}
                onChange={(e) => setNeo4jId(e.target.value)}
                disabled={purging}
              >
                {neo4jDataSources.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name} ({ds.host}:{ds.port ?? 7687})
                  </option>
                ))}
              </select>
            </EntityViewField>
          ) : null}
          <EntityViewField label={t('objectTypes.purgeTypeConfirm', { phrase: purgePhrase })}>
            <input
              className="console-form-control"
              type="text"
              value={purgeConfirm}
              onChange={(e) => setPurgeConfirm(e.target.value)}
              disabled={purging}
              autoComplete="off"
              spellCheck={false}
            />
          </EntityViewField>
          <button
            type="button"
            className="btn btn-danger"
            disabled={purging || purgeConfirm.trim() !== purgePhrase}
            onClick={() => void handlePurgeType()}
          >
            {purging ? t('objectTypes.purging') : t('objectTypes.purgeTypeAction')}
          </button>
        </div>
      </EntityViewPanel>
    </>
  );
}
