import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  setWorkforceWebSearchConnector,
  addWorkforceKb,
  addWorkforceOntologyGroup,
  addWorkforceSemanticModel,
  removeWorkforceKb,
  removeWorkforceOntologyGroup,
  removeWorkforceSemanticModel,
} from '../../../data/workforceApi';
import { fetchKnowledgeBases } from '../../../data/knowledgeBasesApi';
import { fetchSemanticModels } from '../../../data/semanticModelsApi';
import { fetchOntologyGroups } from '../../../data/ontologyGroupsApi';
import { fetchConnectors } from '../../../data/connectorsApi';
import { FormField } from '../../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { ResourcePickerDialog, type PickableResource } from './ResourcePickerDialog';
import { useWorkforceDetail } from './workforceDetailContext';

/**
 * What this agent may *read* — all three kinds in one place, and the word is "knowledge" because all three are:
 * documents, metrics and the object graph are different shapes of what the agent knows.
 *
 * A corpus, a semantic model and an ontology group are the same kind of object from the agent's point of view: data it
 * is allowed to read, granted here, with the caller's permissions deciding what is offerable. They differ in role — the
 * corpus is what an answer is *drawn from*, the other two are what it may *consult* while answering — but not in how
 * they are granted. Splitting them put half of "what can this agent see" on another tab and let a binding disappear
 * when the capability that used it was switched off.
 *
 * Adding is one action: a picker with search and multi-select, then one submit. Each section used to be a dropdown
 * and a button — one decision in two steps, one resource per round trip.
 *
 * Retrieval depth stays on the corpus: the same documents should be searched the same way whichever agent asks, so
 * this screen links to the source's settings instead of offering a second place to set `top_k`.
 */
export function WorkforceKnowledgeTab() {
  const { t } = useTranslation('workforce');
  const { agent, reload } = useWorkforceDetail();
  const [kbs, setKbs] = useState<PickableResource[]>([]);
  const [models, setModels] = useState<PickableResource[]>([]);
  const [groups, setGroups] = useState<PickableResource[]>([]);
  const [searchConnectors, setSearchConnectors] = useState<{ id: string; label: string }[]>([]);
  const [open, setOpen] = useState<'kb' | 'model' | 'group' | null>(null);
  const [busy, setBusy] = useState(false);

  const loadOptions = useCallback(async () => {
    try {
      const [kbRes, modelRes, groupRes, connectorRes] = await Promise.all([
        fetchKnowledgeBases({ limit: 200, offset: 0 }),
        fetchSemanticModels(),
        fetchOntologyGroups(),
        fetchConnectors('search_tool'),
      ]);
      setKbs(
        kbRes.items.map((kb) => ({ id: kb.id, name: kb.name, meta: kb.description ?? undefined })),
      );
      setModels(
        modelRes.items.map((model) => ({
          id: model.id,
          name: model.name,
          meta: [model.description, t(`modelAccess_${model.access_mode}`)]
            .filter(Boolean)
            .join(' · '),
        })),
      );
      setSearchConnectors(
        connectorRes.items
          .filter((connector) => connector.enabled)
          .map((connector) => ({ id: connector.id, label: connector.name })),
      );
      setGroups(
        groupRes.map((group) => ({
          id: group.id,
          name: group.display_name,
          meta: group.description ?? undefined,
        })),
      );
    } catch {
      // Options are a convenience; the bindings below come from the agent.
    }
  }, [t]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('bindingFailed'));
    } finally {
      setBusy(false);
    }
  };

  const boundKbIds = new Set(agent.knowledge_bases.map((b) => b.knowledge_base_id));
  const boundModelIds = new Set(agent.semantic_models.map((b) => b.semantic_model_id));
  const boundGroupIds = new Set(agent.ontology_groups.map((b) => b.ontology_group_id));

  return (
    <>
      <EntityViewHeader title={t('knowledgeTabTitle')} subtitle={t('knowledgeTabLead')} />

      <EntityViewPanel
        id="knowledge-bases"
        title={t('knowledgeTitle')}
        description={t('knowledgeLead')}
      >
        {agent.knowledge_bases.length === 0 ? (
          <p className="ds-field__hint">{t('noKnowledge')}</p>
        ) : (
          <ul className="workforce-bindings">
            {agent.knowledge_bases.map((binding) => (
              <li key={binding.id}>
                <span>{binding.label || binding.knowledge_base_name || binding.knowledge_base_id}</span>
                <span className="workforce-bindings__actions">
                  <Link
                    className="btn btn-link btn-sm"
                    to={`/knowledge-bases/${binding.knowledge_base_id}/settings`}
                  >
                    {t('knowledgeSourceSettings')}
                  </Link>
                  <button
                    type="button"
                    className="btn btn-link btn-sm is-danger"
                    disabled={busy}
                    onClick={() => void run(() => removeWorkforceKb(agent.id, binding.id))}
                  >
                    <X size={14} aria-hidden />
                    {t('unbind')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="workforce-resource-add"
          disabled={busy}
          onClick={() => setOpen('kb')}
        >
          <Plus size={16} aria-hidden />
          {t('addKnowledge')}
        </button>
        {/* Says where the retrieval numbers live, because a reader will look for them here. */}
        <p className="ds-field__hint">{t('retrievalLivesOnKb')}</p>
      </EntityViewPanel>

      <EntityViewPanel
        id="semantic-models"
        title={t('modelsTitle')}
        description={t('modelsLead')}
      >
        {agent.semantic_models.length === 0 ? (
          <p className="ds-field__hint">{t('noModels')}</p>
        ) : (
          <ul className="workforce-bindings">
            {agent.semantic_models.map((binding) => (
              <li key={binding.id}>
                <span>{binding.name}</span>
                <button
                  type="button"
                  className="btn btn-link btn-sm is-danger"
                  disabled={busy}
                  onClick={() => void run(() => removeWorkforceSemanticModel(agent.id, binding.id))}
                >
                  <X size={14} aria-hidden />
                  {t('unbind')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="workforce-resource-add"
          disabled={busy}
          onClick={() => setOpen('model')}
        >
          <Plus size={16} aria-hidden />
          {t('addModel')}
        </button>
      </EntityViewPanel>

      <EntityViewPanel
        id="web-search-connector"
        title={t('webSearchConnectorTitle')}
        description={t('webSearchConnectorLead')}
      >
        {agent.web_search_connector_id ? (
          <ul className="workforce-bindings">
            <li>
              <span>
                {searchConnectors.find((c) => c.id === agent.web_search_connector_id)?.label ??
                  agent.web_search_connector_id}
              </span>
              <button
                type="button"
                className="btn btn-link btn-sm is-danger"
                disabled={busy}
                onClick={() => void run(() => setWorkforceWebSearchConnector(agent.id, null))}
              >
                <X size={14} aria-hidden />
                {t('unbind')}
              </button>
            </li>
          </ul>
        ) : null}
        <FormField
          label={t('webSearchConnectorPick')}
          hint={searchConnectors.length === 0 ? t('webSearchConnectorNone') : undefined}
        >
          <div className="workforce-inline-form">
            <select
              className="ds-control"
              value={agent.web_search_connector_id ?? ''}
              aria-label={t('webSearchConnectorPick')}
              onChange={(e) =>
                void run(() => setWorkforceWebSearchConnector(agent.id, e.target.value || null))
              }
            >
              <option value="">{t('webSearchConnectorChoose')}</option>
              {searchConnectors.map((connector) => (
                <option key={connector.id} value={connector.id}>
                  {connector.label}
                </option>
              ))}
            </select>
          </div>
        </FormField>
      </EntityViewPanel>

      <EntityViewPanel
        id="ontology-groups"
        title={t('groupsTitle')}
        description={t('groupsLead')}
      >
        {agent.ontology_groups.length === 0 ? (
          <p className="ds-field__hint">{t('noGroups')}</p>
        ) : (
          <ul className="workforce-bindings">
            {agent.ontology_groups.map((binding) => (
              <li key={binding.id}>
                <span>{binding.display_name}</span>
                <button
                  type="button"
                  className="btn btn-link btn-sm is-danger"
                  disabled={busy}
                  onClick={() => void run(() => removeWorkforceOntologyGroup(agent.id, binding.id))}
                >
                  <X size={14} aria-hidden />
                  {t('unbind')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="workforce-resource-add"
          disabled={busy}
          onClick={() => setOpen('group')}
        >
          <Plus size={16} aria-hidden />
          {t('addGroup')}
        </button>
      </EntityViewPanel>

      <ResourcePickerDialog
        open={open === 'kb'}
        title={t('addKnowledge')}
        addLabel={t('knowledgeTitle')}
        searchPlaceholder={t('pickerSearch')}
        emptyLabel={t('pickerNothingToAdd')}
        items={kbs.filter((kb) => !boundKbIds.has(kb.id))}
        busy={busy}
        onClose={() => setOpen(null)}
        onSubmit={(ids) =>
          run(async () => {
            for (const id of ids) await addWorkforceKb(agent.id, { knowledge_base_id: id });
          })
        }
      />

      <ResourcePickerDialog
        open={open === 'model'}
        title={t('addModel')}
        addLabel={t('modelsTitle')}
        searchPlaceholder={t('pickerSearch')}
        emptyLabel={t('pickerNothingToAdd')}
        items={models.filter((model) => !boundModelIds.has(model.id))}
        busy={busy}
        onClose={() => setOpen(null)}
        onSubmit={(ids) =>
          run(async () => {
            for (const id of ids) await addWorkforceSemanticModel(agent.id, id);
          })
        }
      />

      <ResourcePickerDialog
        open={open === 'group'}
        title={t('addGroup')}
        addLabel={t('groupsTitle')}
        searchPlaceholder={t('pickerSearch')}
        emptyLabel={t('pickerNothingToAdd')}
        items={groups.filter((group) => !boundGroupIds.has(group.id))}
        busy={busy}
        onClose={() => setOpen(null)}
        onSubmit={(ids) =>
          run(async () => {
            for (const id of ids) await addWorkforceOntologyGroup(agent.id, id);
          })
        }
      />
    </>
  );
}
