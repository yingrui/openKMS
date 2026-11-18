import type { TFunction } from 'i18next';
import type {
  KBOntologyGroupResponse,
  KBSemanticModelResponse,
} from '../../../../data/knowledgeBasesApi';
import { PanelToolbar } from '../../../../styles/design-system';

/**
 * What the agent may consult beyond the corpus: Catalog models and ontology groups.
 *
 * Scope for the agent's tools only — it scopes what can be *queried*, not what may be read: row and table
 * authorisation for those tools is the data resource grant the calling user holds.
 *
 * The two blocks are the same shape (a picker, then what is bound), which is why they are rendered by one
 * component twice rather than written out twice.
 */
export function DataScopeTab({
  t,
  semanticModels,
  ontologyGroups,
  allSemanticModels,
  allOntologyGroups,
  busyId,
  onAddSemanticModel,
  onRemoveSemanticModel,
  onAddOntologyGroup,
  onRemoveOntologyGroup,
}: {
  t: TFunction;
  semanticModels: KBSemanticModelResponse[];
  ontologyGroups: KBOntologyGroupResponse[];
  allSemanticModels: { id: string; name: string }[];
  allOntologyGroups: { id: string; display_name: string }[];
  /** The id currently being linked or unlinked; the picker closes while it runs. */
  busyId: string | null;
  onAddSemanticModel: (id: string) => void;
  onRemoveSemanticModel: (id: string) => void;
  onAddOntologyGroup: (id: string) => void;
  onRemoveOntologyGroup: (id: string) => void;
}) {
  return (
    <section className="kb-section">
      <PanelToolbar
        className="kb-section-header"
        leading={<span>{t('detail.dataScopeTitle')}</span>}
      />
      <p className="kb-section-desc">{t('detail.dataScopeHint')}</p>
      <div className="kb-agent-scope-panel">
        <div className="kb-agent-scope-block">
          <div className="kb-agent-scope-heading">{t('detail.agentScopeSemanticModels')}</div>
          <div className="kb-agent-scope-add">
            <select
              className="ds-control"
              aria-label={t('detail.agentScopeAddSemanticModel')}
              defaultValue=""
              disabled={!!busyId}
              onChange={(e) => {
                const id = e.target.value;
                e.target.value = '';
                if (id) onAddSemanticModel(id);
              }}
            >
              <option value="">{t('detail.agentScopeAddSemanticModel')}</option>
              {allSemanticModels
                .filter((m) => !semanticModels.some((k) => k.semantic_model_id === m.id))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </div>
          {semanticModels.length === 0 ? (
            <p className="kb-empty-text">{t('detail.agentScopeEmptySemanticModels')}</p>
          ) : (
            <ul className="kb-agent-scope-list">
              {semanticModels.map((m) => (
                <li key={m.id} className="kb-agent-scope-item">
                  <div className="kb-agent-scope-item-main">
                    <span className="kb-agent-scope-item-name">{m.name}</span>
                    {m.metric_names.length > 0 ? (
                      <span className="kb-agent-scope-item-meta">
                        {t('detail.agentScopeMetricCount', { count: m.metric_names.length })}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === m.semantic_model_id}
                    onClick={() => onRemoveSemanticModel(m.semantic_model_id)}
                  >
                    {t('detail.remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="kb-agent-scope-block">
          <div className="kb-agent-scope-heading">{t('detail.agentScopeOntologyGroups')}</div>
          <div className="kb-agent-scope-add">
            <select
              className="ds-control"
              aria-label={t('detail.agentScopeAddOntologyGroup')}
              defaultValue=""
              disabled={!!busyId}
              onChange={(e) => {
                const id = e.target.value;
                e.target.value = '';
                if (id) onAddOntologyGroup(id);
              }}
            >
              <option value="">{t('detail.agentScopeAddOntologyGroup')}</option>
              {allOntologyGroups
                .filter((g) => !ontologyGroups.some((k) => k.ontology_group_id === g.id))
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.display_name}
                  </option>
                ))}
            </select>
          </div>
          {ontologyGroups.length === 0 ? (
            <p className="kb-empty-text">{t('detail.agentScopeEmptyOntologyGroups')}</p>
          ) : (
            <ul className="kb-agent-scope-list">
              {ontologyGroups.map((g) => (
                <li key={g.id} className="kb-agent-scope-item">
                  <div className="kb-agent-scope-item-main">
                    <span className="kb-agent-scope-item-name">{g.display_name}</span>
                    <span className="kb-agent-scope-item-meta">
                      {t('detail.agentScopeObjectTypeCount', { count: g.object_type_count })}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === g.ontology_group_id}
                    onClick={() => onRemoveOntologyGroup(g.ontology_group_id)}
                  >
                    {t('detail.remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
