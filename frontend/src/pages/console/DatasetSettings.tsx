import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Settings, Users } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDataset, updateDataset, type DatasetResponse } from '../../data/datasetsApi';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import '../../styles/settings-page.scss';
import './DatasetSettings.scss';

type TabId = 'general' | 'sharing';

export function DatasetSettings() {
  const { t } = useTranslation('console');
  const navigate = useNavigate();
  const { id: datasetId = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<TabId>(
    tabParam === 'sharing' ? 'sharing' : 'general'
  );
  const [dataset, setDataset] = useState<DatasetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayNameField, setDisplayNameField] = useState('');
  const [saving, setSaving] = useState(false);

  const tabs = useMemo(
    () => [
      { id: 'general' as const, label: t('datasetSettings.tabGeneral'), icon: Settings },
      { id: 'sharing' as const, label: t('datasetSettings.tabSharing'), icon: Users },
    ],
    [t]
  );

  const load = useCallback(async () => {
    if (!datasetId) return;
    setLoading(true);
    try {
      const data = await fetchDataset(datasetId);
      setDataset(data);
      setDisplayNameField(data.display_name ?? '');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('datasetSettings.loadFailed'));
      setDataset(null);
    } finally {
      setLoading(false);
    }
  }, [datasetId, t]);

  useEffect(() => {
    if (!datasetId) {
      navigate('/ontology/datasets');
      return;
    }
    void load();
  }, [datasetId, load, navigate]);

  useEffect(() => {
    if (tabParam === 'sharing' || tabParam === 'general') {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleSave = async () => {
    if (!datasetId || !dataset) return;
    setSaving(true);
    try {
      const updated = await updateDataset(datasetId, {
        display_name: displayNameField.trim() || null,
      });
      setDataset(updated);
      setDisplayNameField(updated.display_name ?? '');
      toast.success(t('datasetSettings.savedToast'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('datasetSettings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const tableLabel = dataset
    ? `${dataset.schema_name}.${dataset.table_name}`
    : '';

  if (!datasetId) return null;

  if (loading) {
    return (
      <div className="dataset-settings settings-page">
        <p className="page-subtitle">{t('datasetSettings.loading')}</p>
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="dataset-settings settings-page">
        <Link to="/ontology/datasets" className="settings-page-back">
          <ArrowLeft size={18} />
          <span>{t('datasetSettings.backDatasets')}</span>
        </Link>
        <div className="page-header">
          <h1>{t('datasetSettings.notFoundTitle')}</h1>
        </div>
      </div>
    );
  }

  const headerName = dataset.display_name?.trim() || tableLabel;

  return (
    <div className="dataset-settings settings-page">
      <Link to={`/ontology/datasets/${datasetId}`} className="settings-page-back">
        <ArrowLeft size={18} />
        <span>{t('datasetSettings.backDataset')}</span>
      </Link>
      <div className="page-header">
        <h1>{t('datasetSettings.pageTitle')}</h1>
        <p className="page-subtitle">{headerName}</p>
      </div>

      <div className="settings-page-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`settings-page-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'sharing' ? (
        <div className="settings-page-form dataset-settings-panel">
          <ResourceSharePanel
            resourceType={RESOURCE_TYPES.dataset}
            resourceId={datasetId}
            title={t('datasetSettings.sharingTitle')}
          />
        </div>
      ) : null}

      {activeTab === 'general' ? (
        <div className="settings-page-form dataset-settings-panel">
          <section className="settings-page-section">
            <h2>{t('datasetSettings.generalHeading')}</h2>
            <p className="settings-page-hint">{t('datasetSettings.generalHint')}</p>
            <div className="settings-page-field">
              <label htmlFor="dataset-settings-display-name">{t('datasetSettings.displayName')}</label>
              <input
                id="dataset-settings-display-name"
                type="text"
                value={displayNameField}
                onChange={(e) => setDisplayNameField(e.target.value)}
                placeholder={tableLabel}
              />
            </div>
            <div className="settings-page-field">
              <label>{t('datasetSettings.tableLabel')}</label>
              <p className="dataset-settings-readonly">{tableLabel}</p>
            </div>
            {dataset.data_source_name ? (
              <div className="settings-page-field">
                <label>{t('datasetSettings.dataSourceLabel')}</label>
                <p className="dataset-settings-readonly">{dataset.data_source_name}</p>
              </div>
            ) : null}
          </section>
          <div className="settings-page-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? t('saving') : t('datasetSettings.save')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
