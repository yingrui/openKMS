import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Settings, Users } from 'lucide-react';
import { toast } from 'sonner';
import { fetchGlossary, updateGlossary, type GlossaryResponse } from '../../data/glossariesApi';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import '../documents/DocumentChannelSettings.scss';
import './GlossarySettings.scss';

type TabId = 'general' | 'sharing';

export function GlossarySettings() {
  const { t } = useTranslation('explore');
  const navigate = useNavigate();
  const { id: glossaryId = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<TabId>(
    tabParam === 'sharing' ? 'sharing' : 'general'
  );
  const [glossary, setGlossary] = useState<GlossaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [nameField, setNameField] = useState('');
  const [descriptionField, setDescriptionField] = useState('');
  const [saving, setSaving] = useState(false);

  const tabs = useMemo(
    () => [
      { id: 'general' as const, label: t('glossary.settings.tabGeneral'), icon: Settings },
      { id: 'sharing' as const, label: t('glossary.settings.tabSharing'), icon: Users },
    ],
    [t]
  );

  const load = useCallback(async () => {
    if (!glossaryId) return;
    setLoading(true);
    try {
      const data = await fetchGlossary(glossaryId);
      setGlossary(data);
      setNameField(data.name);
      setDescriptionField(data.description ?? '');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('glossary.settings.loadFailed'));
      setGlossary(null);
    } finally {
      setLoading(false);
    }
  }, [glossaryId, t]);

  useEffect(() => {
    if (!glossaryId) {
      navigate('/glossaries');
      return;
    }
    void load();
  }, [glossaryId, load, navigate]);

  useEffect(() => {
    if (tabParam === 'sharing' || tabParam === 'general') {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleSave = async () => {
    if (!glossaryId || !glossary) return;
    const name = nameField.trim();
    if (!name) {
      toast.error(t('glossary.settings.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const updated = await updateGlossary(glossaryId, {
        name,
        description: descriptionField.trim() || undefined,
      });
      setGlossary(updated);
      setNameField(updated.name);
      setDescriptionField(updated.description ?? '');
      toast.success(t('glossary.toastUpdated'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('glossary.settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!glossaryId) return null;

  if (loading) {
    return (
      <div className="glossary-settings document-channel-settings">
        <p className="page-subtitle">{t('glossary.settings.loading')}</p>
      </div>
    );
  }

  if (!glossary) {
    return (
      <div className="glossary-settings document-channel-settings">
        <Link to="/glossaries" className="document-channel-settings-back">
          <ArrowLeft size={18} />
          <span>{t('glossary.settings.backToGlossaries')}</span>
        </Link>
        <div className="page-header">
          <h1>{t('glossary.settings.notFoundTitle')}</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="glossary-settings document-channel-settings">
      <Link to={`/glossaries/${glossaryId}`} className="document-channel-settings-back">
        <ArrowLeft size={18} />
        <span>{t('glossary.settings.backToGlossary')}</span>
      </Link>
      <div className="page-header">
        <h1>{t('glossary.settings.pageTitle')}</h1>
        <p className="page-subtitle">{glossary.name}</p>
      </div>

      <div className="document-channel-settings-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`document-channel-settings-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'sharing' ? (
        <div className="document-channel-settings-form glossary-settings-panel">
          <ResourceSharePanel
            resourceType={RESOURCE_TYPES.glossary}
            resourceId={glossaryId}
            title={t('glossary.settings.sharingTitle')}
          />
        </div>
      ) : null}

      {activeTab === 'general' ? (
        <div className="document-channel-settings-form glossary-settings-panel">
          <section className="document-channel-settings-section">
            <h2>{t('glossary.settings.generalHeading')}</h2>
            <p className="document-channel-settings-hint">{t('glossary.settings.generalHint')}</p>
            <div className="document-channel-settings-field">
              <label htmlFor="glossary-settings-name">{t('shared.name')}</label>
              <input
                id="glossary-settings-name"
                type="text"
                value={nameField}
                onChange={(e) => setNameField(e.target.value)}
                placeholder={t('glossary.placeholderName')}
              />
            </div>
            <div className="document-channel-settings-field">
              <label htmlFor="glossary-settings-description">{t('shared.description')}</label>
              <textarea
                id="glossary-settings-description"
                value={descriptionField}
                onChange={(e) => setDescriptionField(e.target.value)}
                placeholder={t('glossary.placeholderDesc')}
                rows={3}
              />
            </div>
          </section>
          <div className="document-channel-settings-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? t('shared.saving') : t('shared.save')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
