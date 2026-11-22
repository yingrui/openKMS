import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { updateWorkforceAgent } from '../../../data/workforceApi';
import { FormField } from '../../../styles/design-system';
import {
  fetchToolCatalog,
  type CodeExecutionPolicy,
  type ToolCapability,
} from '../../../data/workforceToolsApi';
import { useAsyncData } from '../../../hooks/useAsyncData';
import type { Dispatch, SetStateAction } from 'react';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { configFromDraft, draftFromConfig, type BehaviourDraft } from '../workforceConfigDraft';
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
  const [draft, setDraft] = useState(() => draftFromConfig(agent.agent_config));
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
    allowCommands.trim() !== (agent.agent_config?.sandbox?.allow_commands ?? []).join('\n').trim() ||
    draft.maxToolRounds !==
      (agent.agent_config?.orchestration?.max_tool_rounds
        ? String(agent.agent_config.orchestration.max_tool_rounds)
        : '');

  return (
    <>
      <EntityViewHeader title={t('toolsTitle')} subtitle={t('toolsLead')} />

      <EntityViewPanel
        title={t('toolsSwitchesTitle')}
        description={t('toolsSwitchesLead')}
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
                    web_search_connector: agent.web_search_connector_id ? 1 : 0,
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
                  draft={draft}
                  setDraft={setDraft}
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
      {/* The row is the disclosure; the checkbox is the selection. Clicking the row must not tick anything. */}
      <div
        className="workforce-tool-row__head"
        onClick={onExpand}
        onKeyDown={(event) => {
          // Only the row itself toggles the disclosure: Space on the checkbox must tick it, not open the row.
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onExpand();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        {/* The checkbox owns selection; everything else in the row opens it. `CheckRow` wraps the title in a label,
            which would make the name itself a selection target — exactly what this layout must avoid. */}
        <input
          type="checkbox"
          className="ds-checkbox"
          checked={enabled}
          disabled={busy || !capability.available}
          aria-label={capability.name}
          onChange={() => onToggle()}
          onClick={(event) => event.stopPropagation()}
        />
        <span className="workforce-tool-row__title">
          {capability.name}
          {capability.summary ? (
            <span className="workforce-tool-row__hint">{capability.summary}</span>
          ) : null}
          {capability.available ? null : (
            <span className="workforce-tool-row__unavailable">
              {t('toolsNotConfigured')}
            </span>
          )}
        </span>
        <span className="workforce-tool-row__meta">
          {needsData
            ? t('toolsRowNeeds', { count: capability.tools.length })
            : t('toolsCount', { count: capability.tools.length })}
          {expanded ? (
            <ChevronDown size={14} aria-hidden />
          ) : (
            <ChevronRight size={14} aria-hidden />
          )}
        </span>
      </div>

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
  draft,
  setDraft,
  dirty,
  busy,
  onSave,
}: {
  policy: CodeExecutionPolicy;
  allowCommands: string;
  onAllowCommands: (value: string) => void;
  dirty: boolean;
  draft: BehaviourDraft;
  setDraft: Dispatch<SetStateAction<BehaviourDraft>>;
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
      <FormField label={t('maxToolRounds')} hint={t('maxToolRoundsHint')}>
        <input
          className="ds-control"
          type="number"
          min={1}
          step={1}
          value={draft.maxToolRounds}
          onChange={(e) => setDraft((d) => ({ ...d, maxToolRounds: e.target.value }))}
        />
      </FormField>
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
          placeholder={'jq\nfile\nstat'}
          onChange={(e) => onAllowCommands(e.target.value)}
        />
      </FormField>
      {/* What is worth adding, and what each group gives up. A bare list of names would not tell an author that
          `git` can start any process. */}
      <details className="workforce-allow-help">
        <summary>{t('sandboxAllowCommandsHelp')}</summary>
        <dl>
          <div>
            <dt>{t('sandboxAllowGroupFiles')}</dt>
            <dd>
              <code>{t('sandboxAllowGroupFilesCmds')}</code> — {t('sandboxAllowGroupFilesWhy')}
            </dd>
          </div>
          <div>
            <dt>{t('sandboxAllowGroupArchives')}</dt>
            <dd>
              <code>{t('sandboxAllowGroupArchivesCmds')}</code> — {t('sandboxAllowGroupArchivesWhy')}
            </dd>
          </div>
          <div>
            <dt>{t('sandboxAllowGroupText')}</dt>
            <dd>
              <code>{t('sandboxAllowGroupTextCmds')}</code> — {t('sandboxAllowGroupTextWhy')}
            </dd>
          </div>
          <div>
            <dt>{t('sandboxAllowGroupCode')}</dt>
            <dd>
              <code>{t('sandboxAllowGroupCodeCmds')}</code> — {t('sandboxAllowGroupCodeWhy')}
            </dd>
          </div>
          <div>
            <dt>{t('sandboxAllowGroupVcs')}</dt>
            <dd>
              <code>{t('sandboxAllowGroupVcsCmds')}</code> — {t('sandboxAllowGroupVcsWhy')}
            </dd>
          </div>
        </dl>
      </details>
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
  counts: { semantic_model: number; ontology_group: number; web_search_connector: number };
}) {
  const { t } = useTranslation('workforce');

  return (
    <section className="workforce-tool-resource">
      {capability.requires.map((requirement) => {
        const bound = counts[requirement as keyof typeof counts] ?? 0;
        const anchor =
          requirement === 'semantic_model'
            ? 'semantic-models'
            : requirement === 'ontology_group'
              ? 'ontology-groups'
              : 'web-search-connector';
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
  return (
    <section className="workforce-tool-resource workforce-tool-checklist">
      {capability.tools.map((tool) => (
        <div key={tool.id} className="workforce-tool-checklist__row">
          <span
            className="workforce-tool-checklist__check"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              className="ds-checkbox"
              checked={selected.includes(tool.id)}
              disabled={busy}
              aria-label={tool.name}
              onChange={(event) => onToggle(tool.id, event.target.checked)}
            />
          </span>
          <span className="workforce-tool-checklist__body">
            <Link
              className="workforce-tool-checklist__name"
              to={`/workforce/tools#tool-${tool.id.replace(/\./g, '-')}`}
            >
              {tool.name}
            </Link>
            <span className="ds-field__hint">{tool.description}</span>
          </span>
        </div>
      ))}
    </section>
  );
}
