import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  installWorkforceSkill,
  listWorkforceAvailableSkills,
  listWorkforceSkills,
  uninstallWorkforceSkill,
  type WorkforceAvailableSkill,
  type WorkforceInstalledSkill,
} from '../../../data/workforceApi';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { useWorkforceDetail } from './workforceDetailContext';

/**
 * Skill packages: instruction bundles from the global registry, installed onto this agent.
 *
 * This is not the tool list. A tool is a capability the runtime enforces (ontology lookups, catalog queries, code
 * execution) and is switched on the Tools tab; a skill is prose plus supporting files that tells the agent how to do
 * a job. Installing one adds its `SKILL.md` to the prompt — the same kind of package an Agent Project installs.
 */
export function WorkforceSkillsTab() {
  const { t } = useTranslation('workforce');
  const { agent, reload } = useWorkforceDetail();
  const [installed, setInstalled] = useState<WorkforceInstalledSkill[]>([]);
  const [registry, setRegistry] = useState<WorkforceAvailableSkill[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mine, available] = await Promise.all([
        listWorkforceSkills(agent.id),
        listWorkforceAvailableSkills(agent.id),
      ]);
      setInstalled(mine);
      setRegistry(available);
    } catch {
      // The registry is a convenience: what is installed still comes from the agent row.
    }
  }, [agent.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await reload();
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('skillFailed'));
    } finally {
      setBusy(false);
    }
  };

  const installedIds = new Set(installed.map((s) => s.skill_id));
  const available = registry.filter((s) => !installedIds.has(s.skill_id));
  /** Published versions of a skill this agent already carries, so switching one is a single choice. */
  const versionsOf = (skillId: string) =>
    registry.find((entry) => entry.skill_id === skillId)?.versions ?? [];

  return (
    <>
      <EntityViewHeader title={t('skillsTitle')} subtitle={t('skillsPackagesLead')} />

      <EntityViewPanel title={t('skillsInstalledTitle')} description={t('skillsInstalledLead')}>
        {installed.length === 0 ? (
          <p className="ds-field__hint">{t('skillsNoneInstalled')}</p>
        ) : (
          <ul className="workforce-bindings">
            {installed.map((skill) => (
              <li key={skill.skill_id}>
                <span className="workforce-binding-name">
                  <Package size={14} aria-hidden /> {skill.display_name}
                  {versionsOf(skill.skill_id).length > 1 ? (
                    <select
                      className="ds-control workforce-binding-version"
                      aria-label={t('skillVersion')}
                      value={skill.version}
                      disabled={busy}
                      onChange={(e) =>
                        void run(() =>
                          installWorkforceSkill(agent.id, skill.skill_id, e.target.value),
                        )
                      }
                    >
                      {/* A version that is no longer published stays listed: the control has to keep
                          showing what the agent actually runs. */}
                      {versionsOf(skill.skill_id).includes(skill.version) ? null : (
                        <option value={skill.version}>v{skill.version}</option>
                      )}
                      {versionsOf(skill.skill_id).map((version) => (
                        <option key={version} value={version}>
                          v{version}
                        </option>
                      ))}
                    </select>
                  ) : skill.version ? (
                    <span className="workforce-binding-meta">v{skill.version}</span>
                  ) : null}
                  {skill.available ? null : (
                    <span className="workforce-binding-meta is-warning">{t('skillMissing')}</span>
                  )}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => void run(() => uninstallWorkforceSkill(agent.id, skill.skill_id))}
                >
                  <X size={14} aria-hidden />
                  {t('skillUninstall')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </EntityViewPanel>

      <EntityViewPanel title={t('skillsRegistryTitle')} description={t('skillsRegistryLead')}>
        {available.length === 0 ? (
          <p className="ds-field__hint">{t('skillsNoneAvailable')}</p>
        ) : (
          <ul className="workforce-bindings">
            {available.map((skill) => (
              <li key={skill.skill_id}>
                <span className="workforce-binding-name">
                  <Package size={14} aria-hidden /> {skill.display_name}
                  {skill.default_version ? (
                    <span className="workforce-binding-meta">v{skill.default_version}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => void run(() => installWorkforceSkill(agent.id, skill.skill_id))}
                >
                  <Plus size={14} aria-hidden />
                  {t('skillInstall')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="ds-field__hint">{t('skillsWhereToManage')}</p>
      </EntityViewPanel>
    </>
  );
}
