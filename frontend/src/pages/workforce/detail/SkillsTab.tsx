import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { updateWorkforceAgent } from '../../../data/workforceApi';
import { CORE_AGENT_SKILLS, OPTIONAL_AGENT_SKILLS } from '../../../data/kbAgentSkills';
import { CheckRow } from '../../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { useWorkforceDetail } from './workforceDetailContext';

/** What the agent can do besides read: the qa-agent skill ids this service enables. */
export function WorkforceSkillsTab() {
  const { t } = useTranslation('workforce');
  const { t: tk } = useTranslation('knowledgeBase');
  const { agent, reload } = useWorkforceDetail();
  const [skills, setSkills] = useState<string[]>(
    Array.isArray(agent.agent_skills) ? agent.agent_skills : []
  );
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) =>
    setSkills((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const save = async () => {
    setSaving(true);
    try {
      await updateWorkforceAgent(agent.id, { agent_skills: skills });
      await reload();
      toast.success(t('saved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const row = (skill: (typeof CORE_AGENT_SKILLS)[number]) => (
    <CheckRow
      key={skill.id}
      checked={skills.includes(skill.id)}
      onChange={() => toggle(skill.id)}
      title={tk(`detail.${skill.labelKey}`)}
      hint={tk(`detail.${skill.helpKey}`)}
    />
  );

  return (
    <>
      <EntityViewHeader
        title={t('skillsTitle')}
        subtitle={t('skillsLead')}
        actions={
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
            <Save size={16} aria-hidden />
            {saving ? t('saving') : t('save')}
          </button>
        }
      />
      <EntityViewPanel>
        {CORE_AGENT_SKILLS.map(row)}
        {OPTIONAL_AGENT_SKILLS.map(row)}
      </EntityViewPanel>
    </>
  );
}
