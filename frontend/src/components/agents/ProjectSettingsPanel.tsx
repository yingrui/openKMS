import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { updateProject, type ProjectResponse } from '../../data/projectsApi';
import './ProjectSettingsPanel.scss';

interface Props {
  project: ProjectResponse;
  onClose: () => void;
  onSaved: (project: ProjectResponse) => void;
}

export function ProjectSettingsPanel({ project, onClose, onSaved }: Props) {
  const { t } = useTranslation('agents');
  const { t: ts } = useTranslation('explore');
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [slug, setSlug] = useState(project.slug);
  const [agentJson, setAgentJson] = useState(JSON.stringify(project.settings, null, 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      let settings: Record<string, unknown>;
      try {
        settings = JSON.parse(agentJson) as Record<string, unknown>;
      } catch {
        throw new Error(t('settings.invalidJson'));
      }
      const updated = await updateProject(project.id, {
        name: name.trim(),
        description: description.trim() || null,
        slug: slug.trim() || undefined,
        settings,
      });
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="project-settings-overlay" onClick={onClose} role="presentation">
      <div
        className="project-settings-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-labelledby="project-settings-title"
      >
        <div className="project-settings-header">
          <h2 id="project-settings-title">{t('settings.title')}</h2>
          <button type="button" className="project-settings-close" aria-label={ts('shared.close')} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="project-settings-body">
          <section className="project-settings-section">
            <h3>{t('settings.generalTitle')}</h3>
            <label>
              <span>{ts('shared.name')}</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              <span>{ts('shared.description')}</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </label>
            <label>
              <span>{t('settings.slug')}</span>
              <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} />
              <span className="project-settings-hint">{t('settings.slugHint')}</span>
            </label>
          </section>

          <section className="project-settings-section">
            <h3>{t('settings.agentTitle')}</h3>
            <p className="project-settings-hint">{t('settings.agentHint')}</p>
            <textarea
              className="project-settings-json"
              value={agentJson}
              onChange={(e) => setAgentJson(e.target.value)}
              rows={12}
              spellCheck={false}
            />
          </section>

          {error ? <p className="project-settings-error">{error}</p> : null}
        </div>

        <div className="project-settings-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('settings.cancel')}
          </button>
          <button type="button" className="btn btn-primary" disabled={saving || !name.trim()} onClick={() => void save()}>
            {saving ? ts('shared.saving') : t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
