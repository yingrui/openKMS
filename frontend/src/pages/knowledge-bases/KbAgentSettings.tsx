import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  updateKnowledgeBase,
  type KbAgentConfig,
  type KnowledgeBaseResponse,
} from '../../data/knowledgeBasesApi';

/**
 * The Agent tab: how this knowledge base's QA agent behaves.
 *
 * Everything here is a **policy** — retrieval depth, what counts as an acceptable answer, where files live, where context
 * comes from — and every field defaults to the behaviour the agent had before any of it existed. What must not vary per KB
 * (a number must come from a cited query; do not answer a different question) is not offered here: it lives in code with
 * tests, per the design note.
 *
 * The skill list is not in this object. Which skills exist is `agent_skills`, one source, edited here.
 */

const CORE_SKILLS = [
  ['ontology', 'agentSkillOntology', 'agentSkillOntologyHelp'],
  ['catalog', 'agentSkillCatalog', 'agentSkillCatalogHelp'],
  ['page_index', 'agentSkillPageIndex', 'agentSkillPageIndexHelp'],
] as const;

const OPTIONAL_SKILLS = [
  ['workspace', 'agentSkillWorkspace', 'agentSkillWorkspaceHelp'],
  ['insurance_calculator', 'agentSkillInsuranceCalculator', 'agentSkillInsuranceCalculatorHelp'],
  ['premium_estimator', 'agentSkillPremiumEstimator', 'agentSkillPremiumEstimatorHelp'],
  ['product_comparator', 'agentSkillProductComparator', 'agentSkillProductComparatorHelp'],
] as const;

export function KbAgentSettings({ kb, onSaved }: { kb: KnowledgeBaseResponse; onSaved: () => void }) {
  const { t } = useTranslation('knowledgeBase');
  const [saving, setSaving] = useState(false);

  const [agentUrl, setAgentUrl] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [agentsMd, setAgentsMd] = useState('');
  const [topK, setTopK] = useState('5');
  const [unknownMeasure, setUnknownMeasure] = useState<'try_anyway' | 'refuse'>('try_anyway');
  const [grounding, setGrounding] = useState<'off' | 'mark' | 'enforce'>('off');
  const [schemaLookup, setSchemaLookup] = useState(false);
  const [retrieve, setRetrieve] = useState<'always' | 'never' | 'on_miss'>('always');
  const [maxToolRounds, setMaxToolRounds] = useState('');
  const [workspace, setWorkspace] = useState(false);

  useEffect(() => {
    const cfg: KbAgentConfig = kb.agent_config ?? {};
    setAgentUrl(kb.agent_url ?? '');
    setSkills(Array.isArray(kb.agent_skills) ? kb.agent_skills : []);
    setAgentsMd(cfg.prompts?.agents_md ?? '');
    setTopK(String(cfg.retrieval?.top_k ?? 5));
    setUnknownMeasure(cfg.answer_policy?.unknown_measure ?? 'try_anyway');
    setGrounding(cfg.answer_policy?.require_grounded_numbers ?? 'off');
    setSchemaLookup(Boolean(cfg.answer_policy?.require_schema_lookup));
    setRetrieve(cfg.orchestration?.retrieve ?? 'always');
    setMaxToolRounds(cfg.orchestration?.max_tool_rounds ? String(cfg.orchestration.max_tool_rounds) : '');
    setWorkspace(Boolean(cfg.workspace?.enabled));
  }, [kb]);

  const config = useMemo<KbAgentConfig>(() => {
    const rounds = Number.parseInt(maxToolRounds, 10);
    const k = Number.parseInt(topK, 10);
    return {
      prompts: { agents_md: agentsMd.trim() ? agentsMd : null },
      retrieval: { top_k: Number.isFinite(k) ? Math.min(50, Math.max(1, k)) : 5 },
      answer_policy: {
        unknown_measure: unknownMeasure,
        require_grounded_numbers: grounding,
        require_schema_lookup: schemaLookup,
      },
      orchestration: {
        retrieve,
        max_tool_rounds: Number.isFinite(rounds) && rounds > 0 ? rounds : null,
      },
      workspace: { enabled: workspace },
    };
  }, [agentsMd, topK, unknownMeasure, grounding, schemaLookup, retrieve, maxToolRounds, workspace]);

  const toggleSkill = (id: string) =>
    setSkills((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const save = async () => {
    setSaving(true);
    try {
      await updateKnowledgeBase(kb.id, {
        agent_url: agentUrl.trim() || null,
        agent_skills: skills,
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
            value={agentUrl}
            onChange={(e) => setAgentUrl(e.target.value)}
          />
          <small>{t('detail.qaAgentUrlHelp')}</small>
        </div>
      </section>

      <section className="settings-page-section">
        <h2>{t('detail.agentSkillsFieldset')}</h2>
        <p className="settings-page-hint">{t('detail.agentSkillsHelp')}</p>
        {CORE_SKILLS.map(([id, labelKey, helpKey]) => (
          <label key={id} className="kb-settings-skill-row">
            <input type="checkbox" checked={skills.includes(id)} onChange={() => toggleSkill(id)} />
            <span>
              <span className="kb-settings-skill-name">{t(`detail.${labelKey}`)}</span>
              <small>{t(`detail.${helpKey}`)}</small>
            </span>
          </label>
        ))}
        <p className="kb-settings-skills-demo-legend">{t('detail.agentSkillsOptionalLegend')}</p>
        {OPTIONAL_SKILLS.map(([id, labelKey, helpKey]) => (
          <label key={id} className="kb-settings-skill-row">
            <input type="checkbox" checked={skills.includes(id)} onChange={() => toggleSkill(id)} />
            <span>
              <span className="kb-settings-skill-name">{t(`detail.${labelKey}`)}</span>
              <small>{t(`detail.${helpKey}`)}</small>
            </span>
          </label>
        ))}
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
            value={agentsMd}
            onChange={(e) => setAgentsMd(e.target.value)}
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
            value={topK}
            onChange={(e) => setTopK(e.target.value)}
          />
          <small>{t('detail.agentTopKHelp')}</small>
        </div>
        <div className="settings-page-field">
          <label htmlFor="kb-agent-retrieve">{t('detail.agentRetrieve')}</label>
          <select
            id="kb-agent-retrieve"
            className="ds-control"
            value={retrieve}
            onChange={(e) => setRetrieve(e.target.value as typeof retrieve)}
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
            value={maxToolRounds}
            onChange={(e) => setMaxToolRounds(e.target.value)}
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
            value={unknownMeasure}
            onChange={(e) => setUnknownMeasure(e.target.value as typeof unknownMeasure)}
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
            value={grounding}
            onChange={(e) => setGrounding(e.target.value as typeof grounding)}
          >
            <option value="off">{t('detail.agentGroundingOff')}</option>
            <option value="mark">{t('detail.agentGroundingMark')}</option>
            <option value="enforce">{t('detail.agentGroundingEnforce')}</option>
          </select>
          <small>{t('detail.agentGroundingHelp')}</small>
        </div>
        <label className="kb-settings-skill-row">
          <input type="checkbox" checked={schemaLookup} onChange={() => setSchemaLookup((v) => !v)} />
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
          <input type="checkbox" checked={workspace} onChange={() => setWorkspace((v) => !v)} />
          <span>
            <span className="kb-settings-skill-name">{t('detail.agentWorkspaceEnabled')}</span>
            <small>{t('detail.agentWorkspaceEnabledHelp')}</small>
          </span>
        </label>
      </section>
    </div>
  );
}
