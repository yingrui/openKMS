import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { updateWorkforceAgent } from '../../../data/workforceApi';
import { CheckRow, FormField } from '../../../styles/design-system';
import {
  fetchToolCatalog,
  type CodeExecutionPolicy,
  type ToolCapability,
} from '../../../data/workforceToolsApi';
import { useAsyncData } from '../../../hooks/useAsyncData';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { ToolParameters } from '../ToolParameters';
import { configFromDraft, draftFromConfig } from '../workforceConfigDraft';
import { useWorkforceDetail } from './workforceDetailContext';

/**
 * What the agent may *do*, and what it may *read in order to do it*.
 *
 * Three words, used strictly, because mixing them is what made this page unreadable:
 *
 * - **capability** — a thing the agent can do (`page_index`, `catalog`, …). It is the switch.
 * - **tool** — one callable function a capability brings (`query_semantic_model`). Not switched on its own.
 * - **resource** — data a capability reads (a semantic model, an ontology group). Bound *inside* its capability,
 *   because a binding without the capability does nothing.
 *
 * A limit is shown on the thing it limits. The command allow list constrains `run_command` and nothing else —
 * `run_python` runs code, and code is not a command line — so it appears on that tool, not on the capability.
 *
 * Switches save themselves: a switch that needs a Save button is a switch whose state you cannot see.
 */
export function WorkforceToolsTab() {
  const { t } = useTranslation('workforce');
  const { agent, reload } = useWorkforceDetail();
  // The capability list and every tool description come from the service that owns them, so the screen cannot
  // describe a tool the model no longer has — or miss one it gained.
  const catalog = useAsyncData(() => fetchToolCatalog(), []);
  const [openCapability, setOpenCapability] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const draft = draftFromConfig(agent.agent_config);
  // The ledger: `{capability_id: "all" | [tool_id, ...]}`. A missing key means the capability is off.
  const [ledger, setLedger] = useState<Record<string, 'all' | string[]>>(() =>
    agent.agent_tools ?? {}
  );
  // One command per line; the API takes a list that only *adds* to the built-in allow list.
  const [allowCommands, setAllowCommands] = useState(() =>
    (agent.agent_config?.sandbox?.allow_commands ?? []).join('\n')
  );

  /** The ledger writes itself: the state on screen is the state stored. */
  const saveLedger = async (next: Record<string, 'all' | string[]>) => {
    const before = ledger;
    setLedger(next);
    try {
      await updateWorkforceAgent(agent.id, { agent_tools: next });
      await reload();
    } catch (e: unknown) {
      setLedger(before);
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    }
  };

  /** Turning a capability on starts at "all"; turning it off removes its key. */
  const toggleCapability = (capabilityId: string, enabled: boolean) => {
    const next = { ...ledger };
    if (enabled) next[capabilityId] = 'all';
    else delete next[capabilityId];
    void saveLedger(next);
  };

  /** Narrowing one tool turns "all" into an explicit list; checking every tool again goes back to "all". */
  const toggleTool = (capability: ToolCapability, toolId: string, enabled: boolean) => {
    const current = ledger[capability.id];
    const allIds = capability.tools.map((tool) => tool.id);
    const selected = current === 'all' || current === undefined ? allIds : current;
    const nextIds = enabled
      ? [...new Set([...selected, toolId])]
      : selected.filter((id) => id !== toolId);
    const next = { ...ledger };
    if (nextIds.length === 0) delete next[capability.id];
    else next[capability.id] = nextIds.length === allIds.length ? 'all' : nextIds;
    void saveLedger(next);
  };

  const saveAllowCommands = async () => {
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

  const allowCommandsDirty =
    allowCommands.trim() !== (agent.agent_config?.sandbox?.allow_commands ?? []).join('\n').trim();

  return (
    <>
      <EntityViewHeader title={t('toolsTitle')} subtitle={t('toolsLead')} />

      <EntityViewPanel
        title={t('toolsSwitchesTitle')}
        description={t('toolsSwitchesLead')}
        actions={
          <Link className="btn btn-link btn-sm" to="/workforce/tools">
            {t('toolsSeeCatalogue')}
          </Link>
        }
      >
        {catalog.error ? <p className="ds-field__hint">{t('toolsCatalogFailed')}</p> : null}
        {catalog.loading ? <p className="ds-field__hint">{t('loading')}</p> : null}

        {(catalog.data?.capabilities ?? []).map((capability) => {
          const choice = ledger[capability.id];
          const enabled = choice !== undefined;
          const selectedTools =
            choice === 'all' || choice === undefined
              ? capability.tools.map((tool) => tool.id)
              : choice;
          return (
            <CapabilityRow
              key={capability.id}
              capability={capability}
              enabled={enabled}
              busy={busy}
              expanded={openCapability === capability.id}
              onToggle={() => toggleCapability(capability.id, !enabled)}
              onExpand={() =>
                setOpenCapability((current) => (current === capability.id ? null : capability.id))
              }
            >
              {capability.requires.length > 0 ? (
                <CapabilityNeeds
                  agentId={agent.id}
                  capability={capability}
                  counts={{
                    semantic_model: agent.semantic_models.length,
                    ontology_group: agent.ontology_groups.length,
                  }}
                />
              ) : null}

              {enabled ? (
                <ToolChecklist
                  capability={capability}
                  selected={selectedTools}
                  busy={busy}
                  onToggle={(toolId, next) => toggleTool(capability, toolId, next)}
                />
              ) : null}

              {capability.policy ? (
                <PolicyBlock
                  policy={capability.policy}
                  allowCommands={allowCommands}
                  onAllowCommands={setAllowCommands}
                  dirty={allowCommandsDirty}
                  busy={busy}
                  onSave={() => void saveAllowCommands()}
                />
              ) : null}
            </CapabilityRow>
          );
        })}

        {Object.keys(ledger).length === 0 ? (
          <p className="ds-field__hint">{t('toolsNoneSelected')}</p>
        ) : null}
      </EntityViewPanel>
    </>
  );
}

/**
 * One capability: its switch, what it needs, and what it brings.
 *
 * The meta on the right says what opening the row would show — a count of tools, or "needs data" when there is
 * something to bind before the tools can do anything.
 */
function CapabilityRow({
  capability,
  enabled,
  busy,
  expanded,
  onToggle,
  onExpand,
  children,
}: {
  capability: ToolCapability;
  enabled: boolean;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation('workforce');
  const needsData = capability.requires.length > 0;

  return (
    <div className={`workforce-tool-row${expanded ? ' is-open' : ''}`}>
      <CheckRow
        checked={enabled}
        onChange={onToggle}
        disabled={busy}
        title={capability.name}
        hint={capability.summary}
      />
      <button
        type="button"
        className="btn btn-link btn-sm workforce-tool-row__toggle"
        aria-expanded={expanded}
        onClick={onExpand}
      >
        {needsData
          ? t('toolsRowNeeds', { count: capability.tools.length })
          : t('toolsCount', { count: capability.tools.length })}
        {expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
      </button>

      {expanded ? (
        <div className="workforce-tool-row__detail">
          {enabled ? children : <p className="ds-field__hint">{t('toolsBindOnlyWhenOn')}</p>}


        </div>
      ) : null}
    </div>
  );
}

/** A capability's limits: what is shared, and the allow list on the one tool it constrains. */
function PolicyBlock({
  policy,
  allowCommands,
  onAllowCommands,
  dirty,
  busy,
  onSave,
}: {
  policy: CodeExecutionPolicy;
  allowCommands: string;
  onAllowCommands: (value: string) => void;
  dirty: boolean;
  busy: boolean;
  onSave: () => void;
}) {
  const { t } = useTranslation('workforce');

  return (
    <section className="workforce-tool-resource">
      <p className="ds-field__hint">
        {t('toolsPolicyLine', {
          cwd: policy.cwd,
          writable: policy.writable,
          timeout: policy.timeout_seconds,
        })}
      </p>
      <p className="ds-field__hint">
        {t('toolsAllowlistScope', {
          tool: policy.allowlist.tools.join(', '),
        })}
      </p>
      <FormField
        label={t('sandboxAllowCommands')}
        hint={t('sandboxAllowCommandsHintWithBuiltin', {
          count: policy.allowlist.builtin_allow.length,
          timeout: policy.timeout_seconds,
        })}
      >
        <textarea
          className="ds-control"
          rows={3}
          spellCheck={false}
          value={allowCommands}
          placeholder={'rg\ncat\npython'}
          onChange={(e) => onAllowCommands(e.target.value)}
        />
      </FormField>
      <div className="workforce-tool-policy-actions">
        <details>
          <summary>
            {t('toolsCatalogAllowSummary', {
              count: policy.allowlist.builtin_allow.length,
              timeout: policy.timeout_seconds,
            })}
          </summary>
          <ul className="workforce-tool-commands">
            {policy.allowlist.builtin_allow.map((command) => (
              <li key={command}>
                <code>{command}</code>
              </li>
            ))}
          </ul>
        </details>
        {dirty ? (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onSave}>
            {busy ? t('saving') : t('save')}
          </button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * What a capability needs, and where to grant it.
 *
 * A capability does not own its data, so the binding lives on the Knowledge tab where every kind of readable data is
 * listed once. This line says which kind it needs and how many are bound, and links there — the dependency stays
 * visible without a second copy of the list.
 */
function CapabilityNeeds({
  agentId,
  capability,
  counts,
}: {
  agentId: string;
  capability: ToolCapability;
  counts: { semantic_model: number; ontology_group: number };
}) {
  const { t } = useTranslation('workforce');

  return (
    <section className="workforce-tool-resource">
      {capability.requires.map((requirement) => {
        const bound = counts[requirement as keyof typeof counts] ?? 0;
        const anchor = requirement === 'semantic_model' ? 'semantic-models' : 'ontology-groups';
        return (
          <p key={requirement} className="workforce-tool-needs">
            <span>{t(`toolsNeeds_${requirement}`, { count: bound })}</span>
            <Link className="btn btn-link btn-sm" to={`/workforce/${agentId}/knowledge#${anchor}`}>
              {bound > 0 ? t('toolsManageResource') : t('toolsBindResource')}
            </Link>
          </p>
        );
      })}
    </section>
  );
}

/**
 * Which tools of a capability the model may call.
 *
 * "All" is the default and follows the runtime: a new tool reaches every agent that said all. Unticking one turns that
 * into an explicit list — `shell but not python` is the case a capability-level switch cannot express, and it is the
 * one that matters, because the command allow list constrains `run_command` only.
 */
function ToolChecklist({
  capability,
  selected,
  busy,
  onToggle,
}: {
  capability: ToolCapability;
  selected: string[];
  busy: boolean;
  onToggle: (toolId: string, next: boolean) => void;
}) {
  const { t } = useTranslation('workforce');

  return (
    <section className="workforce-tool-resource workforce-tool-checklist">
      {capability.tools.map((tool) => (
        <div key={tool.id}>
          <CheckRow
            checked={selected.includes(tool.id)}
            onChange={(next) => onToggle(tool.id, next)}
            disabled={busy}
            title={`${tool.label ?? tool.name} · ${tool.id}`}
            hint={tool.description}
          />
          <details className="workforce-tool-params-disclosure">
            <summary>
              {t('toolsParameters', {
                count: Object.keys(tool.parameters?.properties ?? {}).length,
              })}
            </summary>
            <ToolParameters parameters={tool.parameters} />
          </details>
        </div>
      ))}
    </section>
  );
}
