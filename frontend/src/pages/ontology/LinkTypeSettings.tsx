import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Settings, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchLinkType,
  type LinkTypeResponse,
} from '../../data/ontologyApi';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import '../documents/DocumentChannelSettings.scss';
import './OntologyTypeSettings.scss';

type TabId = 'general' | 'sharing';

export function LinkTypeSettings() {
  const { t } = useTranslation('console');
  const navigate = useNavigate();
  const { linkTypeId = '' } = useParams<{ linkTypeId: string }>();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<TabId>(
    tabParam === 'sharing' ? 'sharing' : 'general'
  );
  const [linkType, setLinkType] = useState<LinkTypeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const tabs = useMemo(
    () => [
      { id: 'general' as const, label: t('ontologySettings.tabGeneral'), icon: Settings },
      { id: 'sharing' as const, label: t('ontologySettings.tabSharing'), icon: Users },
    ],
    [t]
  );

  const load = useCallback(async () => {
    if (!linkTypeId) return;
    setLoading(true);
    try {
      const data = await fetchLinkType(linkTypeId);
      setLinkType(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('ontologySettings.loadFailed'));
      setLinkType(null);
    } finally {
      setLoading(false);
    }
  }, [linkTypeId, t]);

  useEffect(() => {
    if (!linkTypeId) {
      navigate('/ontology/link-types');
      return;
    }
    void load();
  }, [linkTypeId, load, navigate]);

  useEffect(() => {
    if (tabParam === 'sharing' || tabParam === 'general') {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  if (!linkTypeId) return null;

  if (loading) {
    return (
      <div className="ontology-type-settings document-channel-settings">
        <p className="page-subtitle">{t('ontologySettings.loading')}</p>
      </div>
    );
  }

  if (!linkType) {
    return (
      <div className="ontology-type-settings document-channel-settings">
        <Link to="/ontology/link-types" className="document-channel-settings-back">
          <ArrowLeft size={18} />
          <span>{t('ontologySettings.backLinkTypes')}</span>
        </Link>
        <div className="page-header">
          <h1>{t('ontologySettings.notFoundTitle')}</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="ontology-type-settings document-channel-settings">
      <Link to="/ontology/link-types" className="document-channel-settings-back">
        <ArrowLeft size={18} />
        <span>{t('ontologySettings.backLinkTypes')}</span>
      </Link>
      <div className="page-header">
        <h1>{t('ontologySettings.linkTypeTitle')}</h1>
        <p className="page-subtitle">{linkType.name}</p>
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

      {activeTab === 'sharing' && linkTypeId ? (
        <div className="document-channel-settings-form ontology-type-settings-panel">
          <ResourceSharePanel
            resourceType={RESOURCE_TYPES.linkType}
            resourceId={linkTypeId}
            title={t('ontologySettings.sharingTitle')}
          />
        </div>
      ) : null}

      {activeTab === 'general' ? (
        <div className="document-channel-settings-form ontology-type-settings-panel">
          <section className="document-channel-settings-section">
            <h2>{t('ontologySettings.generalHeading')}</h2>
            <p className="document-channel-settings-hint">{t('ontologySettings.linkTypeGeneralHint')}</p>
            <p>
              <strong>{linkType.name}</strong>
            </p>
            {linkType.description ? <p>{linkType.description}</p> : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
