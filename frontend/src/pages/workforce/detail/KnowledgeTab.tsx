import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  addWorkforceKb,
  addWorkforceOntologyGroup,
  addWorkforceSemanticModel,
  removeWorkforceKb,
  removeWorkforceOntologyGroup,
  removeWorkforceSemanticModel,
} from '../../../data/workforceApi';
import { fetchKnowledgeBases, type KnowledgeBaseResponse } from '../../../data/knowledgeBasesApi';
import { fetchSemanticModels, type SemanticModelResponse } from '../../../data/semanticModelsApi';
import { fetchOntologyGroups, type OntologyGroupResponse } from '../../../data/ontologyGroupsApi';
import { FormField } from '../../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { useWorkforceDetail } from './workforceDetailContext';

/**
 * What this agent may *read* — all three kinds in one place, and the word is "knowledge" because all three are:
 * documents, metrics and the object graph are different shapes of what the agent knows.
 *
 * A corpus, a semantic model and an ontology group are the same kind of object from the agent's point of view: data
 * it is allowed to read, bound here, with the caller's permissions deciding what is offerable. They differ in role —
 * the corpus is what an answer is *drawn from*, the other two are what it may *consult* while answering — but not in
 * how they are granted. Splitting them put half of "what can this agent see" on another tab and let a binding
 * disappear when the capability that used it was switched off.
 *
 * Retrieval depth stays on the corpus: the same documents should be searched the same way whichever agent asks, so
 * this screen links to the source's settings instead of offering a second place to set `top_k`.
 */
export function WorkforceKnowledgeTab() {
  const { t } = useTranslation('workforce');
  const { agent, reload } = useWorkforceDetail();
  const [kbs, setKbs] = useState<KnowledgeBaseResponse[]>([]);
  const [models, setModels] = useState<SemanticModelResponse[]>([]);
  const [groups, setGroups] = useState<OntologyGroupResponse[]>([]);
  const [kbPick, setKbPick] = useState('');
  const [modelPick, setModelPick] = useState('');
  const [groupPick, setGroupPick] = useState('');
  const [busy, setBusy] = useState(false);

  const loadOptions = useCallback(async () => {
    try {
      const [kbRes, modelRes, groupRes] = await Promise.all([
        fetchKnowledgeBases({ limit: 200, offset: 0 }),
        fetchSemanticModels(),
        fetchOntologyGroups(),
      ]);
      setKbs(kbRes.items);
      setModels(modelRes.items);
      setGroups(groupRes);
    } catch {
      // Options are a convenience; the bindings below come from the agent.
    }
  }, []);

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
                <span>
                  {binding.label || binding.knowledge_base_name || binding.knowledge_base_id}
                </span>
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
        <FormField
          label={t('addKnowledge')}
          hint={kbs.length === 0 ? t('noReadableKbs') : undefined}
        >
          <div className="workforce-inline-form">
            <select
              className="ds-control"
              value={kbPick}
              aria-label={t('addKnowledge')}
              onChange={(e) => setKbPick(e.target.value)}
            >
              <option value="">{t('pickKnowledgeBase')}</option>
              {kbs
                .filter((kb) => !boundKbIds.has(kb.id))
                .map((kb) => (
                  <option key={kb.id} value={kb.id}>
                    {kb.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || !kbPick}
              onClick={() =>
                void run(async () => {
                  await addWorkforceKb(agent.id, { knowledge_base_id: kbPick });
                  setKbPick('');
                })
              }
            >
              <Plus size={16} aria-hidden />
              {t('bind')}
            </button>
          </div>
        </FormField>
        {/* Says where the retrieval numbers live, because a reader will look for them here. */}
        <p className="ds-field__hint">{t('retrievalLivesOnKb')}</p>
      </EntityViewPanel>

      <EntityViewPanel id="semantic-models" title={t('modelsTitle')} description={t('modelsLead')}>
        <BindingRows
          rows={agent.semantic_models.map((binding) => ({
            id: binding.id,
            label: binding.name,
            onRemove: () => removeWorkforceSemanticModel(agent.id, binding.id),
          }))}
          empty={t('noModels')}
          addLabel={t('addModel')}
          pick={modelPick}
          onPick={setModelPick}
          pickPlaceholder={t('toolsPickModelPlaceholder')}
          nothingLeft={t('toolsNothingLeftToBind')}
          options={models
            .filter((model) => !boundModelIds.has(model.id))
            .map((model) => ({ id: model.id, label: model.name }))}
          onAdd={async () => {
            await addWorkforceSemanticModel(agent.id, modelPick);
            setModelPick('');
          }}
          busy={busy}
          run={run}
        />
      </EntityViewPanel>

      <EntityViewPanel id="ontology-groups" title={t('groupsTitle')} description={t('groupsLead')}>
        <BindingRows
          rows={agent.ontology_groups.map((binding) => ({
            id: binding.id,
            label: binding.display_name,
            onRemove: () => removeWorkforceOntologyGroup(agent.id, binding.id),
          }))}
          empty={t('noGroups')}
          addLabel={t('addGroup')}
          pick={groupPick}
          onPick={setGroupPick}
          pickPlaceholder={t('toolsPickGroupPlaceholder')}
          nothingLeft={t('toolsNothingLeftToBind')}
          options={groups
            .filter((group) => !boundGroupIds.has(group.id))
            .map((group) => ({ id: group.id, label: group.display_name }))}
          onAdd={async () => {
            await addWorkforceOntologyGroup(agent.id, groupPick);
            setGroupPick('');
          }}
          busy={busy}
          run={run}
        />
      </EntityViewPanel>
    </>
  );
}

/** The bound list and the control that adds another — one component, so the three lists cannot drift. */
function BindingRows({
  rows,
  empty,
  addLabel,
  pick,
  onPick,
  pickPlaceholder,
  nothingLeft,
  options,
  onAdd,
  busy,
  run,
}: {
  rows: { id: string; label: string; onRemove: () => Promise<unknown> }[];
  empty: string;
  addLabel: string;
  pick: string;
  onPick: (value: string) => void;
  pickPlaceholder: string;
  nothingLeft: string;
  options: { id: string; label: string }[];
  onAdd: () => Promise<void>;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const { t } = useTranslation('workforce');

  return (
    <>
      {rows.length === 0 ? (
        <p className="ds-field__hint">{empty}</p>
      ) : (
        <ul className="workforce-bindings">
          {rows.map((row) => (
            <li key={row.id}>
              <span>{row.label}</span>
              <button
                type="button"
                className="btn btn-link btn-sm is-danger"
                disabled={busy}
                onClick={() => void run(row.onRemove)}
              >
                <X size={14} aria-hidden />
                {t('unbind')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <FormField label={addLabel} hint={options.length === 0 ? nothingLeft : undefined}>
        <div className="workforce-inline-form">
          <select
            className="ds-control"
            value={pick}
            aria-label={addLabel}
            onChange={(e) => onPick(e.target.value)}
          >
            <option value="">{pickPlaceholder}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || !pick}
            onClick={() => void run(onAdd)}
          >
            <Plus size={16} aria-hidden />
            {t('bind')}
          </button>
        </div>
      </FormField>
    </>
  );
}
