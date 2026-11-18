import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  addWorkforceKb,
  addWorkforceOntologyGroup,
  addWorkforceSemanticModel,
  removeWorkforceKb,
  removeWorkforceOntologyGroup,
  removeWorkforceSemanticModel,
  type WorkforceAgentDetail,
} from '../../data/workforceApi';
import { fetchKnowledgeBases, type KnowledgeBaseResponse } from '../../data/knowledgeBasesApi';
import { fetchSemanticModels, type SemanticModelResponse } from '../../data/semanticModelsApi';
import { fetchOntologyGroups, type OntologyGroupResponse } from '../../data/ontologyGroupsApi';
import { FormField } from '../../styles/design-system';
import { EntityViewPanel } from '../shared/EntityViewShell';

/**
 * What the agent may answer from, and what it may consult.
 *
 * Two panels because they answer two different questions: *which corpus* ("知识") and *which numbers
 * and objects* ("数据与本体"). Bindings are additive; removing one never touches the resource itself.
 */
export function WorkforceKnowledgePanel({
  agent,
  onChanged,
}: {
  agent: WorkforceAgentDetail;
  onChanged: () => void;
}) {
  const { t } = useTranslation('workforce');
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
      // The pickers are a convenience; a failed option load must not hide the agent's own bindings.
    }
  }, []);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      onChanged();
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
      <EntityViewPanel id="knowledge" title={t('knowledgeTitle')} description={t('knowledgeLead')}>
        {agent.knowledge_bases.length === 0 ? (
          <p className="ds-field__hint">{t('noKnowledge')}</p>
        ) : (
          <ul className="workforce-bindings">
            {agent.knowledge_bases.map((binding) => (
              <li key={binding.id}>
                <span>{binding.label || binding.knowledge_base_name || binding.knowledge_base_id}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => void run(() => removeWorkforceKb(agent.id, binding.id))}
                >
                  <X size={14} aria-hidden />
                  {t('unbind')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <FormField label={t('addKnowledge')} hint={kbs.length === 0 ? t('noReadableKbs') : undefined}>
          <div className="workforce-inline-form">
            <select
              className="ds-control"
              value={kbPick}
              onChange={(e) => setKbPick(e.target.value)}
            >
              <option value="">—</option>
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
      </EntityViewPanel>

      <EntityViewPanel id="data" title={t('dataTitle')} description={t('dataLead')}>
        <h3 className="account-card-title">{t('addModel')}</h3>
        <p className="ds-field__hint">{t('modelBound')}</p>
        {agent.semantic_models.length === 0 ? (
          <p className="ds-field__hint">{t('noModels')}</p>
        ) : (
          <ul className="workforce-bindings">
            {agent.semantic_models.map((binding) => (
              <li key={binding.id}>
                <span>{binding.name}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
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
        <div className="workforce-inline-form">
          <select
            className="ds-control"
            value={modelPick}
            onChange={(e) => setModelPick(e.target.value)}
          >
            <option value="">—</option>
            {models
              .filter((m) => !boundModelIds.has(m.id))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || !modelPick}
            onClick={() =>
              void run(async () => {
                await addWorkforceSemanticModel(agent.id, modelPick);
                setModelPick('');
              })
            }
          >
            <Plus size={16} aria-hidden />
            {t('bind')}
          </button>
        </div>

        <h3 className="account-card-title">{t('addGroup')}</h3>
        <p className="ds-field__hint">{t('groupBound')}</p>
        {agent.ontology_groups.length === 0 ? (
          <p className="ds-field__hint">{t('noGroups')}</p>
        ) : (
          <ul className="workforce-bindings">
            {agent.ontology_groups.map((binding) => (
              <li key={binding.id}>
                <span>{binding.display_name}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
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
        <div className="workforce-inline-form">
          <select
            className="ds-control"
            value={groupPick}
            onChange={(e) => setGroupPick(e.target.value)}
          >
            <option value="">—</option>
            {groups
              .filter((g) => !boundGroupIds.has(g.id))
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.display_name}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || !groupPick}
            onClick={() =>
              void run(async () => {
                await addWorkforceOntologyGroup(agent.id, groupPick);
                setGroupPick('');
              })
            }
          >
            <Plus size={16} aria-hidden />
            {t('bind')}
          </button>
        </div>
      </EntityViewPanel>
    </>
  );
}
