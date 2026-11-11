import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  updateKnowledgeBase,
  type KbAgentConfig,
  type KnowledgeBaseResponse,
} from '../../data/knowledgeBasesApi';
import { CORE_AGENT_SKILLS, OPTIONAL_AGENT_SKILLS } from '../../data/kbAgentSkills';
import { mergeAgentConfig } from './KbAgentSettings.utils';

/**
 * The Agent tab: how this knowledge base's QA agent behaves.
 *
 * Everything here is a **policy** — retrieval depth, what counts as an acceptable answer, where files live, where context
 * comes from — and every field defaults to the behaviour the agent had before any of it existed. What must not vary per KB
 * (a number must come from a cited query; do not answer a different question) is not offered here: it lives in code with
 * tests, per the design note.
 *
 * The skill list is not in this object. Which skills exist is `agent_skills`, one source, edited here.
 *
 * **Saving merges.** The form renders a subset of `agent_config`, and the API replaces the object it is given, so a version
 * of this page that built the config from scratch silently cleared the keys it did not draw (`sandbox`, the Langfuse
 * credential, `rerank`) — enabling code execution in one place and switching it off by pressing Save in another. The draft
 * is merged onto what the KB already has; keys this page does not render survive it.
 */

/** The form's own shape: strings for inputs, so a half-typed number is not silently coerced. */
interface Draft {
  agentUrl: string;
  skills: string[];
  agentsMd: string;
  topK: string;
  unknownMeasure: 'try_anyway' | 'refuse';
  grounding: 'off' | 'mark' | 'enforce';
  schemaLookup: boolean;
  retrieve: 'always' | 'never' | 'on_miss';
  maxToolRounds: string;
  workspace: boolean;
  sandbox: boolean;
  sandboxTimeout: string;
  sandboxCommands: string;
}

function draftFrom(kb: KnowledgeBaseResponse): Draft {
  const cfg: KbAgentConfig = kb.agent_config ?? {};
  return {
    agentUrl: kb.agent_url ?? '',
    skills: Array.isArray(kb.agent_skills) ? kb.agent_skills : [],
    agentsMd: cfg.prompts?.agents_md ?? '',
    topK: String(cfg.retrieval?.top_k ?? 5),
    unknownMeasure: cfg.answer_policy?.unknown_measure ?? 'try_anyway',
    grounding: cfg.answer_policy?.require_grounded_numbers ?? 'off',
    schemaLookup: Boolean(cfg.answer_policy?.require_schema_lookup),
    retrieve: cfg.orchestration?.retrieve ?? 'always',
    maxToolRounds: cfg.orchestration?.max_tool_rounds ? String(cfg.orchestration.max_tool_rounds) : '',
    workspace: Boolean(cfg.workspace?.enabled),
    sandbox: Boolean(cfg.sandbox?.enabled),
    sandboxTimeout: cfg.sandbox?.timeout_seconds ? String(cfg.sandbox.timeout_seconds) : '',
    sandboxCommands: (cfg.sandbox?.allow_commands ?? []).join(', '),
  };
}

/** The part of `agent_config` this form owns. Anything absent stays as the KB has it. */
function draftToPatch(d: Draft): KbAgentConfig {
  const rounds = Number.parseInt(d.maxToolRounds, 10);
  const k = Number.parseInt(d.topK, 10);
  const timeout = Number.parseInt(d.sandboxTimeout, 10);
  const commands = d.sandboxCommands
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  return {
    prompts: { agents_md: d.agentsMd.trim() ? d.agentsMd : null },
    retrieval: { top_k: Number.isFinite(k) ? Math.min(50, Math.max(1, k)) : 5 },
    answer_policy: {
      unknown_measure: d.unknownMeasure,
      require_grounded_numbers: d.grounding,
      require_schema_lookup: d.schemaLookup,
    },
    orchestration: {
      retrieve: d.retrieve,
      max_tool_rounds: Number.isFinite(rounds) && rounds > 0 ? rounds : null,
    },
    workspace: { enabled: d.workspace },
    sandbox: {
      enabled: d.sandbox,
      timeout_seconds: Number.isFinite(timeout) && timeout >= 5 ? timeout : null,
      allow_commands: commands.length > 0 ? commands : null,
    },
  };
}

export function KbAgentSettings({ kb, onSaved }: { kb: KnowledgeBaseResponse; onSaved: () => void }) {
  const { t } = useTranslation('knowledgeBase');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(kb));

  useEffect(() => {
    setDraft(draftFrom(kb));
  }, [kb]);

  const patch = (values: Partial<Draft>) => setDraft((d) => ({ ...d, ...values }));

  const config = useMemo<KbAgentConfig>(
    () => mergeAgentConfig(kb.agent_config, draftToPatch(draft)),
    [draft, kb.agent_config],
  );

  const toggleSkill = (id: string) =>
    patch({ skills: draft.skills.includes(id) ? draft.skills.filter((s) => s !== id) : [...draft.skills, id] });

  const save = async () => {
    setSaving(true);
    try {
      await updateKnowledgeBase(kb.id, {
        agent_url: draft.agentUrl.trim() || null,
        agent_skills: draft.skills,
        agent_config: config,
      });
      toast.success(t('detail.agentSaved'));
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.agentSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const skillRow = (skill: (typeof CORE_AGENT_SKILLS)[number]) => (
    <label key={skill.id} className="kb-settings-skill-row">
      <input type="checkbox" checked={draft.skills.includes(skill.id)} onChange={() => toggleSkill(skill.id)} />
      <span>
        <span className="kb-settings-skill-name">{t(`detail.${skill.labelKey}`)}</span>
        <small>{t(`detail.${skill.helpKey}`)}</small>
      </span>
    </label>
  );

  return (
    <div className="kb-agent-settings">
      <div className="kb-settings-header-row">
        <p className="kb-settings-general-lead">{t('detail.agentLead')}</p>
        <button type="button" className="btn btn-primary kb-settings-header-save" disabled={saving} onClick={() => void save()}>
          {saving ? t('detail.savingSettings') : t('detail.saveSettings')}
        </button>
      </div>

      <section className="settings-page-section">
        <h2>{t('detail.agentService')}</h2>
        <p className="settings-page-hint">{t('detail.agentServiceHint')}</p>
        <div className="settings-page-field">
          <label htmlFor="kb-agent-url">{t('detail.qaAgentUrl')}</label>
          <input
            id="kb-agent-url"
            type="url"
            className="ds-control"
            placeholder={t('detail.qaAgentUrlPlaceholder')}
            value={draft.agentUrl}
            onChange={(e) => patch({ agentUrl: e.target.value })}
          />
          <small>{t('detail.qaAgentUrlHelp')}</small>
        </div>
      </section>

      <section className="settings-page-section">
        <h2>{t('detail.agentSkillsFieldset')}</h2>
        <p className="settings-page-hint">{t('detail.agentSkillsHelp')}</p>
        {CORE_AGENT_SKILLS.map(skillRow)}
        <p className="kb-settings-skills-demo-legend">{t('detail.agentSkillsOptionalLegend')}</p>
        {OPTIONAL_AGENT_SKILLS.map(skillRow)}
      </section>

      <section className="settings-page-section">
        <h2>{t('detail.agentRules')}</h2>
        <p className="settings-page-hint">{t('detail.agentRulesHint')}</p>
        <div className="settings-page-field">
          <label htmlFor="kb-agent-agents-md">{t('detail.agentAgentsMd')}</label>
          <textarea
            id="kb-agent-agents-md"
            rows={6}
            className="ds-control"
            placeholder={t('detail.agentAgentsMdPlaceholder')}
            value={draft.agentsMd}
            onChange={(e) => patch({ agentsMd: e.target.value })}
          />
          <small>{t('detail.agentAgentsMdHelp')}</small>
        </div>
      </section>

      <section className="settings-page-section">
        <h2>{t('detail.agentRetrieval')}</h2>
        <p className="settings-page-hint">{t('detail.agentRetrievalHint')}</p>
        <div className="settings-page-field">
          <label htmlFor="kb-agent-topk">{t('detail.agentTopK')}</label>
          <input
            id="kb-agent-topk"
            type="number"
            min={1}
            max={50}
            className="ds-control"
            value={draft.topK}
            onChange={(e) => patch({ topK: e.target.value })}
          />
          <small>{t('detail.agentTopKHelp')}</small>
        </div>
        <div className="settings-page-field">
          <label htmlFor="kb-agent-retrieve">{t('detail.agentRetrieve')}</label>
          <select
            id="kb-agent-retrieve"
            className="ds-control"
            value={draft.retrieve}
            onChange={(e) => patch({ retrieve: e.target.value as Draft['retrieve'] })}
          >
            <option value="always">{t('detail.agentRetrieveAlways')}</option>
            <option value="on_miss">{t('detail.agentRetrieveOnMiss')}</option>
            <option value="never">{t('detail.agentRetrieveNever')}</option>
          </select>
          <small>{t('detail.agentRetrieveHelp')}</small>
        </div>
        <div className="settings-page-field">
          <label htmlFor="kb-agent-rounds">{t('detail.agentMaxToolRounds')}</label>
          <input
            id="kb-agent-rounds"
            type="number"
            min={1}
            max={100}
            className="ds-control"
            placeholder={t('detail.agentMaxToolRoundsPlaceholder')}
            value={draft.maxToolRounds}
            onChange={(e) => patch({ maxToolRounds: e.target.value })}
          />
          <small>{t('detail.agentMaxToolRoundsHelp')}</small>
        </div>
      </section>

      <section className="settings-page-section">
        <h2>{t('detail.agentPolicy')}</h2>
        <p className="settings-page-hint">{t('detail.agentPolicyHint')}</p>
        <div className="settings-page-field">
          <label htmlFor="kb-agent-unknown">{t('detail.agentUnknownMeasure')}</label>
          <select
            id="kb-agent-unknown"
            className="ds-control"
            value={draft.unknownMeasure}
            onChange={(e) => patch({ unknownMeasure: e.target.value as Draft['unknownMeasure'] })}
          >
            <option value="try_anyway">{t('detail.agentUnknownMeasureTry')}</option>
            <option value="refuse">{t('detail.agentUnknownMeasureRefuse')}</option>
          </select>
          <small>{t('detail.agentUnknownMeasureHelp')}</small>
        </div>
        <div className="settings-page-field">
          <label htmlFor="kb-agent-grounding">{t('detail.agentGrounding')}</label>
          <select
            id="kb-agent-grounding"
            className="ds-control"
            value={draft.grounding}
            onChange={(e) => patch({ grounding: e.target.value as Draft['grounding'] })}
          >
            <option value="off">{t('detail.agentGroundingOff')}</option>
            <option value="mark">{t('detail.agentGroundingMark')}</option>
            <option value="enforce">{t('detail.agentGroundingEnforce')}</option>
          </select>
          <small>{t('detail.agentGroundingHelp')}</small>
        </div>
        <label className="kb-settings-skill-row">
          <input type="checkbox" checked={draft.schemaLookup} onChange={() => patch({ schemaLookup: !draft.schemaLookup })} />
          <span>
            <span className="kb-settings-skill-name">{t('detail.agentSchemaLookup')}</span>
            <small>{t('detail.agentSchemaLookupHelp')}</small>
          </span>
        </label>
      </section>

      <section className="settings-page-section">
        <h2>{t('detail.agentWorkspace')}</h2>
        <p className="settings-page-hint">{t('detail.agentWorkspaceHint')}</p>
        <label className="kb-settings-skill-row">
          <input type="checkbox" checked={draft.workspace} onChange={() => patch({ workspace: !draft.workspace })} />
          <span>
            <span className="kb-settings-skill-name">{t('detail.agentWorkspaceEnabled')}</span>
            <small>{t('detail.agentWorkspaceEnabledHelp')}</small>
          </span>
        </label>
      </section>

      <section className="settings-page-section">
        <h2>{t('detail.agentSandbox')}</h2>
        <p className="settings-page-hint">{t('detail.agentSandboxHint')}</p>
        <label className="kb-settings-skill-row">
          <input type="checkbox" checked={draft.sandbox} onChange={() => patch({ sandbox: !draft.sandbox })} />
          <span>
            <span className="kb-settings-skill-name">{t('detail.agentSandboxEnabled')}</span>
            <small>{t('detail.agentSandboxEnabledHelp')}</small>
          </span>
        </label>
        <div className="settings-page-field">
          <label htmlFor="kb-agent-sandbox-timeout">{t('detail.agentSandboxTimeout')}</label>
          <input
            id="kb-agent-sandbox-timeout"
            type="number"
            min={5}
            max={600}
            className="ds-control"
            placeholder="60"
            value={draft.sandboxTimeout}
            onChange={(e) => patch({ sandboxTimeout: e.target.value })}
          />
          <small>{t('detail.agentSandboxTimeoutHelp')}</small>
        </div>
        <div className="settings-page-field">
          <label htmlFor="kb-agent-sandbox-commands">{t('detail.agentSandboxCommands')}</label>
          <input
            id="kb-agent-sandbox-commands"
            className="ds-control"
            placeholder="git, jq, sed"
            value={draft.sandboxCommands}
            onChange={(e) => patch({ sandboxCommands: e.target.value })}
          />
          <small>{t('detail.agentSandboxCommandsHelp')}</small>
        </div>
      </section>
    </div>
  );
}
