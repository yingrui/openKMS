import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  addWorkforceOntologyGroup,
  addWorkforceSemanticModel,
  removeWorkforceOntologyGroup,
  removeWorkforceSemanticModel,
  updateWorkforceAgent,
} from '../../../data/workforceApi';
import { fetchSemanticModels, type SemanticModelResponse } from '../../../data/semanticModelsApi';
import { fetchOntologyGroups, type OntologyGroupResponse } from '../../../data/ontologyGroupsApi';
import { CheckRow, FormField } from '../../../styles/design-system';
import { fetchToolCatalog, type ToolCapability } from '../../../data/workforceToolsApi';
import { useAsyncData } from '../../../hooks/useAsyncData';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { configFromDraft, draftFromConfig } from '../workforceConfigDraft';
import { useWorkforceDetail } from './workforceDetailContext';

/**
 * What the agent may *reach* — not what it knows.
 *
 * - **lookup tools** (Catalog models, ontology groups) are what it may *consult* when an answer needs numbers
 *   or objects;
 * - **environment** is what it may *run*: a folder for the session, and code execution in it.
 *
 * Knowledge sources used to live here and moved out: binding a corpus is a different decision from granting a
 * lookup, and mixing them made "Tools" mean two things (`KnowledgeTab`).
 */
export function WorkforceToolsTab() {
  const { t } = useTranslation('workforce');
  const { agent, reload } = useWorkforceDetail();
  // The capability list and every tool description come from the service that owns them, so the screen cannot
  // describe a tool the model no longer has — or miss one it gained.
  const catalog = useAsyncData(() => fetchToolCatalog(), []);
  const [openCapability, setOpenCapability] = useState<string | null>(null);
  const [models, setModels] = useState<SemanticModelResponse[]>([]);
  const [groups, setGroups] = useState<OntologyGroupResponse[]>([]);
  const [modelPick, setModelPick] = useState('');
  const [groupPick, setGroupPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(() => draftFromConfig(agent.agent_config));
  const [tools, setTools] = useState<string[]>(
    Array.isArray(agent.agent_skills) ? agent.agent_skills : []
  );
  // One command per line; the API takes a list that only *adds* to the built-in allow list.
  const [allowCommands, setAllowCommands] = useState(() =>
    (agent.agent_config?.sandbox?.allow_commands ?? []).join('\n')
  );

  const loadOptions = useCallback(async () => {
    try {
      const [modelRes, groupRes] = await Promise.all([
        fetchSemanticModels(),
        fetchOntologyGroups(),
      ]);
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

  const saveTools = async () => {
    setBusy(true);
    try {
      await updateWorkforceAgent(agent.id, { agent_skills: tools });
      await reload();
      toast.success(t('saved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const saveEnvironment = async () => {
    setBusy(true);
    try {
      const commands = allowCommands
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      await updateWorkforceAgent(agent.id, {
        agent_config: configFromDraft(agent.agent_config, draft, {
          sandbox: { allow_commands: commands.length ? commands : null },
        }),
      });
      await reload();
      toast.success(t('saved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const boundModelIds = new Set(agent.semantic_models.map((b) => b.semantic_model_id));
  const boundGroupIds = new Set(agent.ontology_groups.map((b) => b.ontology_group_id));

  return (
    <>
      <EntityViewHeader title={t('toolsTitle')} subtitle={t('toolsLead')} />

      <EntityViewPanel title={t('dataTitle')} description={t('dataLead')}>
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

      <EntityViewPanel title={t('toolsSwitchesTitle')} description={t('toolsSwitchesLead')}>
        {catalog.error ? <p className="ds-field__hint">{t('toolsCatalogFailed')}</p> : null}
        {catalog.loading ? <p className="ds-field__hint">{t('loading')}</p> : null}
        {(catalog.data?.capabilities ?? []).map((capability) => (
          <CapabilityRow
            key={capability.id}
            capability={capability}
            enabled={tools.includes(capability.id)}
            expanded={openCapability === capability.id}
            onToggle={() =>
              setTools((prev) =>
                prev.includes(capability.id)
                  ? prev.filter((id) => id !== capability.id)
                  : [...prev, capability.id]
              )
            }
            onExpand={() =>
              setOpenCapability((current) => (current === capability.id ? null : capability.id))
            }
          />
        ))}
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void saveTools()}>
          {busy ? t('saving') : t('save')}
        </button>
      </EntityViewPanel>

      <EntityViewPanel title={t('toolsEnvSection')} description={t('toolsEnvHint')}>
        <CheckRow
          checked={draft.workspace}
          onChange={(checked) => setDraft({ ...draft, workspace: checked })}
          title={t('workspace')}
          hint={t('workspaceHint')}
        />
        <CheckRow
          checked={draft.sandbox}
          onChange={(checked) => setDraft({ ...draft, sandbox: checked })}
          title={t('sandbox')}
          hint={t('sandboxHint')}
        />
        {catalog.data ? (
          <div className="workforce-tool-details">
            <p className="ds-field__hint">
              {t('sandboxPolicy', {
                count: catalog.data.environment.policy.builtin_allow.length,
                timeout: catalog.data.environment.policy.timeout_seconds,
              })}
            </p>
            <ul>
              {catalog.data.environment.policy.builtin_allow.map((command) => (
                <li key={command}>
                  <code>{command}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {draft.sandbox ? (
          <FormField label={t('sandboxAllowCommands')} hint={t('sandboxAllowCommandsHint')}>
            <textarea
              className="ds-control"
              rows={4}
              spellCheck={false}
              value={allowCommands}
              placeholder={'rg\ncat\npython'}
              onChange={(e) => setAllowCommands(e.target.value)}
            />
          </FormField>
        ) : null}
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void saveEnvironment()}
        >
          {busy ? t('saving') : t('save')}
        </button>
      </EntityViewPanel>
    </>
  );
}

/** One capability: a switch, and the tools it puts in the model's hands. */
function CapabilityRow({
  capability,
  enabled,
  expanded,
  onToggle,
  onExpand,
}: {
  capability: ToolCapability;
  enabled: boolean;
  expanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
}) {
  const { t } = useTranslation('workforce');

  return (
    <div className="workforce-tool-row">
      <CheckRow
        checked={enabled}
        onChange={onToggle}
        title={`${capability.name}${capability.core ? t('toolsCoreTag') : ''}`}
        hint={t('toolsCount', { count: capability.tools.length })}
      />
      <button
        type="button"
        className="btn btn-ghost workforce-tool-row__toggle"
        aria-expanded={expanded}
        onClick={onExpand}
      >
        {expanded ? t('toolsHideDefinition') : t('toolsShowDefinition')}
      </button>
      {expanded ? (
        <dl className="workforce-tool-definitions">
          {capability.tools.map((tool) => (
            <div key={tool.name}>
              <dt>
                <code>{tool.name}</code>
              </dt>
              <dd>{tool.description}</dd>
            </div>
          ))}
          <p className="ds-field__hint">{t('toolsDefinitionNote')}</p>
        </dl>
      ) : null}
    </div>
  );
}
