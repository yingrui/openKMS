import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Archive, MessageSquare, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  archiveWorkforceAgent,
  fetchWorkforceAgent,
  updateWorkforceAgent,
  type WorkforceAgentDetail,
} from '../../data/workforceApi';
import { CORE_AGENT_SKILLS, OPTIONAL_AGENT_SKILLS } from '../../data/kbAgentSkills';
import { useConfirm } from '../../contexts/ConfirmContext';
import { CheckRow, FormField, StatusChip } from '../../styles/design-system';
import {
  EntityViewField,
  EntityViewHeader,
  EntityViewLoading,
  EntityViewPanel,
  EntityViewShell,
} from '../shared/EntityViewShell';
import { WorkforceKnowledgePanel } from './WorkforceKnowledgePanel';
import { WorkforceAccessPanel, WorkforceCallPanel } from './WorkforceAccessPanel';
import {
  configFromDraft,
  draftFromConfig,
  type BehaviourDraft,
} from './workforceConfigDraft';
import './WorkforceDetail.scss';

/**
 * One workforce agent, in the order a reader builds it: who it is, how it answers, what it knows,
 * what it may look up, and who may call it.
 *
 * Everything here is the *service's* half. Retrieval depth is the knowledge source's and is edited on
 * the knowledge base — offering it here would let the same corpus be searched two different ways.
 */
export function WorkforceDetail() {
  const { t } = useTranslation('workforce');
  const { t: tk } = useTranslation('knowledgeBase');
  const { agentId = '' } = useParams();
  const confirm = useConfirm();
  const [agent, setAgent] = useState<WorkforceAgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [draft, setDraft] = useState<BehaviourDraft>(() => draftFromConfig(null));
  const [saving, setSaving] = useState(false);

  /**
   * `silent` re-reads the agent without unmounting the panels.
   *
   * A child panel calls back after a binding or credential changes, and the parent's totals move with it.
   * Flipping `loading` for that would unmount the very panel that asked — which silently destroyed the
   * "copy this token now" dialog, because its state lived in that panel.
   */
  const load = useCallback(async (silent = false) => {
    if (!agentId) return;
    if (!silent) setLoading(true);
    try {
      const data = await fetchWorkforceAgent(agentId);
      setAgent(data);
      setName(data.name);
      setDescription(data.description ?? '');
      setSkills(Array.isArray(data.agent_skills) ? data.agent_skills : []);
      setDraft(draftFromConfig(data.agent_config));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('loadFailed'));
      setAgent(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [agentId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (values: Partial<BehaviourDraft>) => setDraft((d) => ({ ...d, ...values }));

  const config = useMemo(
    () => configFromDraft(agent?.agent_config, draft),
    [agent?.agent_config, draft],
  );

  const toggleSkill = (id: string) =>
    setSkills((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const save = async () => {
    if (!agent) return;
    setSaving(true);
    try {
      const updated = await updateWorkforceAgent(agent.id, {
        name: name.trim() || agent.name,
        description: description.trim() || null,
        agent_skills: skills,
        agent_config: config,
      });
      setAgent(updated);
      toast.success(t('saved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!agent) return;
    if (
      !(await confirm({
        title: t('archiveAgent'),
        message: t('archiveConfirm', { name: agent.name }),
        confirmLabel: t('archiveAgent'),
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await archiveWorkforceAgent(agent.id);
      toast.success(t('deleted'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('deleteFailed'));
    }
  };

  if (loading || !agent) {
    return <EntityViewLoading label={t('loading')} />;
  }

  const skillRow = (skill: (typeof CORE_AGENT_SKILLS)[number]) => (
    <CheckRow
      key={skill.id}
      checked={skills.includes(skill.id)}
      onChange={() => toggleSkill(skill.id)}
      title={tk(`detail.${skill.labelKey}`)}
      hint={tk(`detail.${skill.helpKey}`)}
    />
  );

  return (
    <EntityViewShell
      backTo="/workforce"
      backLabel={t('backToList')}
      title={agent.name}
      meta={t('metaKbs', { count: agent.knowledge_base_count })}
      identityAction={
        <>
          <StatusChip tone="ok">{agent.status}</StatusChip>
          {agent.knowledge_base_count > 0 ? (
            <Link
              className="btn btn-secondary btn-sm"
              to={`/workforce/${agent.id}/chat`}
            >
              <MessageSquare size={15} aria-hidden />
              {t('chatOpen')}
            </Link>
          ) : null}
        </>
      }
      navItems={[
        { sectionId: 'identity', label: t('navIdentity') },
        { sectionId: 'behavior', label: t('navBehavior') },
        { sectionId: 'knowledge', label: t('navKnowledge') },
        { sectionId: 'data', label: t('navData') },
        { sectionId: 'access', label: t('navAccess') },
        { sectionId: 'call', label: t('navTry') },
      ]}
    >
      <EntityViewHeader
        title={t('identityTitle')}
        subtitle={t('identityLead')}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => void archive()}>
              <Archive size={16} aria-hidden />
              {t('archiveAgent')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={() => void save()}
            >
              <Save size={16} aria-hidden />
              {saving ? t('saving') : t('save')}
            </button>
          </>
        }
      />

      <EntityViewPanel id="identity">
        <div className="entity-view__form">
          <EntityViewField label={t('name')}>
            <input className="ds-control" value={name} onChange={(e) => setName(e.target.value)} />
          </EntityViewField>
          <EntityViewField label={t('description')}>
            <textarea
              className="ds-control"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </EntityViewField>
        </div>
      </EntityViewPanel>

      <EntityViewPanel id="behavior" title={t('behaviorTitle')} description={t('behaviorLead')}>
        <div className="entity-view__form">
          <EntityViewField label={t('instructions')} hint={t('instructionsHint')}>
            <textarea
              className="ds-control"
              rows={6}
              value={draft.agentsMd}
              placeholder={t('instructionsPlaceholder')}
              onChange={(e) => patch({ agentsMd: e.target.value })}
            />
          </EntityViewField>
          <FormField label={t('model')} hint={t('modelHint')}>
            <input
              className="ds-control"
              value={draft.modelId}
              placeholder={t('modelPlaceholder')}
              onChange={(e) => patch({ modelId: e.target.value })}
            />
          </FormField>
        </div>

        <h3 className="account-card-title">{t('skills')}</h3>
        <p className="ds-field__hint">{t('skillsHint')}</p>
        {CORE_AGENT_SKILLS.map(skillRow)}
        {OPTIONAL_AGENT_SKILLS.map(skillRow)}

        <h3 className="account-card-title">{t('answerPolicy')}</h3>
        <div className="entity-view__form">
          <FormField label={t('unknownMeasure')}>
            <select
              className="ds-control"
              value={draft.unknownMeasure}
              onChange={(e) =>
                patch({ unknownMeasure: e.target.value as BehaviourDraft['unknownMeasure'] })
              }
            >
              <option value="try_anyway">{t('unknownMeasureTry')}</option>
              <option value="refuse">{t('unknownMeasureRefuse')}</option>
            </select>
          </FormField>
          <FormField label={t('grounding')}>
            <select
              className="ds-control"
              value={draft.grounding}
              onChange={(e) =>
                patch({ grounding: e.target.value as BehaviourDraft['grounding'] })
              }
            >
              <option value="off">{t('groundingOff')}</option>
              <option value="mark">{t('groundingMark')}</option>
              <option value="enforce">{t('groundingEnforce')}</option>
            </select>
          </FormField>
        </div>
        <CheckRow
          checked={draft.schemaLookup}
          onChange={(checked) => patch({ schemaLookup: checked })}
          title={t('schemaLookup')}
        />

        <h3 className="account-card-title">{t('orchestration')}</h3>
        <div className="entity-view__form">
          <FormField label={t('retrieve')}>
            <select
              className="ds-control"
              value={draft.retrieve}
              onChange={(e) =>
                patch({ retrieve: e.target.value as BehaviourDraft['retrieve'] })
              }
            >
              <option value="always">{t('retrieveAlways')}</option>
              <option value="on_miss">{t('retrieveOnMiss')}</option>
              <option value="never">{t('retrieveNever')}</option>
            </select>
          </FormField>
          <FormField label={t('maxToolRounds')} hint={t('maxToolRoundsHint')}>
            <input
              className="ds-control"
              type="number"
              min={1}
              max={100}
              value={draft.maxToolRounds}
              onChange={(e) => patch({ maxToolRounds: e.target.value })}
            />
          </FormField>
        </div>
        <CheckRow
          checked={draft.workspace}
          onChange={(checked) => patch({ workspace: checked })}
          title={t('workspace')}
          hint={t('workspaceHint')}
        />
        <CheckRow
          checked={draft.sandbox}
          onChange={(checked) => patch({ sandbox: checked })}
          title={t('sandbox')}
          hint={t('sandboxHint')}
        />
      </EntityViewPanel>

      <WorkforceKnowledgePanel agent={agent} onChanged={() => void load(true)} />
      <WorkforceAccessPanel agent={agent} onChanged={() => void load(true)} />
      <WorkforceCallPanel agent={agent} />
    </EntityViewShell>
  );
}
