import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
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
 * Four decisions, one panel each: which semantic models it may query, which ontology groups it may walk, which
 * capabilities it carries, and what it may run. Switches save themselves, because a switch that needs a Save button
 * is a switch whose state you cannot see; only the allow list is a form, and it says so by carrying the only Save on
 * the page.
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
  // The policy lives on the capability that enforces it, so this tab reads it from there rather than from a second copy.
  const codeExecution = catalog.data?.capabilities.find(
    (capability) => capability.id === 'code_execution',
  );
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

  /** A switch writes itself: the state on screen is the state stored. */
  const saveTools = async (next: string[]) => {
    setTools(next);
    try {
      await updateWorkforceAgent(agent.id, { agent_skills: next });
      await reload();
    } catch (e: unknown) {
      setTools(tools);
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    }
  };

  const saveEnvironment = async (next = draft, commandsText = allowCommands) => {
    setBusy(true);
    try {
      const commands = commandsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      await updateWorkforceAgent(agent.id, {
        agent_config: configFromDraft(agent.agent_config, next, {
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

  /** A boolean environment switch: write it, keep the control honest if the write fails. */
  const toggleEnvironment = async (key: 'workspace' | 'sandbox', checked: boolean) => {
    const next = { ...draft, [key]: checked };
    setDraft(next);
    try {
      await updateWorkforceAgent(agent.id, {
        agent_config: configFromDraft(agent.agent_config, next),
      });
      await reload();
    } catch (e: unknown) {
      setDraft(draft);
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    }
  };

  const allowCommandsDirty =
    allowCommands.trim() !== (agent.agent_config?.sandbox?.allow_commands ?? []).join('\n').trim();

  const boundModelIds = new Set(agent.semantic_models.map((b) => b.semantic_model_id));
  const boundGroupIds = new Set(agent.ontology_groups.map((b) => b.ontology_group_id));

  return (
    <>
      <EntityViewHeader title={t('toolsTitle')} subtitle={t('toolsLead')} />

      <EntityViewPanel
        title={t('toolsModelsTitle')}
        description={t('toolsModelsLead')}
        actions={
          <Link className="btn btn-link btn-sm" to="/workforce/tools">
            {t('toolsSeeCatalogue')}
          </Link>
        }
      >
        <BindingList
          empty={t('noModels')}
          rows={agent.semantic_models.map((binding) => ({
            id: binding.id,
            label: binding.name,
            onRemove: () => removeWorkforceSemanticModel(agent.id, binding.id),
          }))}
          busy={busy}
          addLabel={t('addModel')}
          pickLabel={t('toolsPickModel')}
          pickPlaceholder={t('toolsPickModelPlaceholder')}
          pick={modelPick}
          onPick={setModelPick}
          options={models
            .filter((model) => !boundModelIds.has(model.id))
            .map((model) => ({ id: model.id, label: model.name }))}
          onAdd={async () => {
            await addWorkforceSemanticModel(agent.id, modelPick);
            setModelPick('');
          }}
          run={run}
        />
      </EntityViewPanel>

      <EntityViewPanel title={t('toolsGroupsTitle')} description={t('toolsGroupsLead')}>
        <BindingList
          empty={t('noGroups')}
          rows={agent.ontology_groups.map((binding) => ({
            id: binding.id,
            label: binding.display_name,
            onRemove: () => removeWorkforceOntologyGroup(agent.id, binding.id),
          }))}
          busy={busy}
          addLabel={t('addGroup')}
          pickLabel={t('toolsPickGroup')}
          pickPlaceholder={t('toolsPickGroupPlaceholder')}
          pick={groupPick}
          onPick={setGroupPick}
          options={groups
            .filter((group) => !boundGroupIds.has(group.id))
            .map((group) => ({ id: group.id, label: group.display_name }))}
          onAdd={async () => {
            await addWorkforceOntologyGroup(agent.id, groupPick);
            setGroupPick('');
          }}
          run={run}
        />
      </EntityViewPanel>

      <EntityViewPanel title={t('toolsSwitchesTitle')} description={t('toolsSwitchesLead')}>
        {catalog.error ? <p className="ds-field__hint">{t('toolsCatalogFailed')}</p> : null}
        {catalog.loading ? <p className="ds-field__hint">{t('loading')}</p> : null}
        {(catalog.data?.capabilities ?? [])
          .filter((capability) => capability.id !== 'code_execution')
          .map((capability) => (
            <CapabilityRow
              key={capability.id}
              capability={capability}
              enabled={tools.includes(capability.id)}
              expanded={openCapability === capability.id}
              onToggle={() =>
                void saveTools(
                  tools.includes(capability.id)
                    ? tools.filter((id) => id !== capability.id)
                    : [...tools, capability.id],
                )
              }
              onExpand={() =>
                setOpenCapability((current) => (current === capability.id ? null : capability.id))
              }
            />
          ))}
        {tools.length === 0 ? (
          <p className="ds-field__hint">{t('toolsNoneSelected')}</p>
        ) : null}
      </EntityViewPanel>

      <EntityViewPanel
        title={t('toolsEnvSection')}
        description={t('toolsEnvHint')}
        actions={
          // The only form on the page: the switches save themselves, so this action appears exactly when there is
          // something a switch could not have saved.
          draft.sandbox && allowCommandsDirty ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => void saveEnvironment()}
            >
              {busy ? t('saving') : t('save')}
            </button>
          ) : null
        }
      >
        <CheckRow
          checked={draft.workspace}
          onChange={(checked) => void toggleEnvironment('workspace', checked)}
          title={t('workspace')}
          hint={t('workspaceHint')}
        />
        <CheckRow
          checked={draft.sandbox}
          onChange={(checked) => void toggleEnvironment('sandbox', checked)}
          title={t('sandbox')}
          hint={t('sandboxHint')}
        />
        {draft.sandbox ? (
          <FormField
            label={t('sandboxAllowCommands')}
            hint={
              codeExecution?.policy
                ? t('sandboxAllowCommandsHintWithBuiltin', {
                    count: codeExecution.policy.builtin_allow.length,
                    timeout: codeExecution.policy.timeout_seconds,
                  })
                : t('sandboxAllowCommandsHint')
            }
          >
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
      </EntityViewPanel>
    </>
  );
}

/**
 * One binding list: what is already bound, and the control that adds another.
 *
 * The two lists on this tab are the same widget — a deliberate shape, so the model list and the group list cannot
 * drift apart the way two hand-written copies would.
 */
function BindingList({
  rows,
  empty,
  busy,
  addLabel,
  pickLabel,
  pickPlaceholder,
  pick,
  onPick,
  options,
  onAdd,
  run,
}: {
  rows: { id: string; label: string; onRemove: () => Promise<unknown> }[];
  empty: string;
  busy: boolean;
  addLabel: string;
  pickLabel: string;
  pickPlaceholder: string;
  pick: string;
  onPick: (value: string) => void;
  options: { id: string; label: string }[];
  onAdd: () => Promise<void>;
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

      <FormField
        label={addLabel}
        hint={options.length === 0 ? t('toolsNothingLeftToBind') : undefined}
      >
        <div className="workforce-inline-form">
          <select
            className="ds-control"
            value={pick}
            aria-label={pickLabel}
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

/** One capability: a switch that saves itself, and the tools it puts in the model's hands. */
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
        title={capability.name}
        hint={capability.summary}
      />
      <button
        type="button"
        className="btn btn-link btn-sm workforce-tool-row__toggle"
        aria-expanded={expanded}
        onClick={onExpand}
      >
        {expanded ? t('toolsHideDefinition') : t('toolsShowDefinition')}
        {expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
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
