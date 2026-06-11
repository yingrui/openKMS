import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Clock, Database, Loader2, Play, Settings, Trash2, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { deleteConnector } from '../../data/connectorsApi';
import { useAuth } from '../../contexts/AuthContext';
import { PERM_CONNECTORS_WRITE, PERM_CONSOLE_DATASETS } from '../../config/permissions';
import { ConnectorCronSettings } from './ConnectorCronSettings';
import { ConnectorFormFields } from './ConnectorFormFields';
import { ConnectorOutputDatasetsFields } from './ConnectorOutputDatasetsFields';
import { ConnectorSearchPlayground } from './ConnectorSearchPlayground';
import { ConnectorTushareProbe } from './ConnectorTushareProbe';
import { ConnectorSyncDialog } from './ConnectorSyncDialog';
import { useConnectorDetailForm } from './useConnectorDetailForm';
import type { ConnectorSyncDateRange } from './connectorSyncUtils';
import '../documents/DocumentChannelSettings.scss';
import '../ontology/ontology-admin.scss';

export function ConnectorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('console');
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(PERM_CONNECTORS_WRITE);
  const canProvisionDatasets = canWrite && hasPermission(PERM_CONSOLE_DATASETS);

  const {
    loading,
    saving,
    syncing,
    connector,
    selectedKindMeta,
    isSearchTool,
    isSyncConnector,
    hasOutputDatasetsConfigured,
    isTushareConnector,
    isTabbedDetail,
    activeTab,
    setActiveTab,
    formName,
    formFieldsProps,
    outputDatasetsProps,
    playgroundBaseline,
    inputValues,
    settingsRows,
    syncSchedule,
    setSyncSchedule,
    handleSave,
    handleRunSync,
  } = useConnectorDetailForm(id, canWrite, canProvisionDatasets);

  const [syncDialogOpen, setSyncDialogOpen] = useState(false);

  const openSyncDialog = () => {
    if (!hasOutputDatasetsConfigured) return;
    setSyncDialogOpen(true);
  };

  const confirmSync = async (range: ConnectorSyncDateRange) => {
    const jobId = await handleRunSync(range);
    if (jobId != null) {
      setSyncDialogOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!canWrite || !id) return;
    if (!window.confirm(t('connectors.deleteConfirm'))) return;
    try {
      await deleteConnector(id);
      toast.success(t('connectors.toastDeleted'));
      navigate('/connectors');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('connectors.toastDeleteFailed'));
    }
  };

  if (loading) {
    return (
      <div className="ontology-admin">
        <div className="console-loading">
          <Loader2 size={32} className="console-loading-spinner" />
          <p>{t('connectors.loading')}</p>
        </div>
      </div>
    );
  }

  if (!connector) {
    return (
      <div className="ontology-admin">
        <p>{t('connectors.detailNotFound')}</p>
        <Link to="/connectors" className="btn btn-secondary">
          {t('connectors.backToList')}
        </Link>
      </div>
    );
  }

  const formContent = <ConnectorFormFields {...formFieldsProps} />;
  const datasetsContent = <ConnectorOutputDatasetsFields {...outputDatasetsProps} />;
  const cronContent = (
    <ConnectorCronSettings
      value={syncSchedule}
      onChange={setSyncSchedule}
      savedSchedule={connector.sync_schedule}
      readOnly={!canWrite}
      outputsConfigured={hasOutputDatasetsConfigured}
    />
  );

  const showSave = canWrite && activeTab !== 'playground' && activeTab !== 'probe';

  return (
    <div className="ontology-admin">
      <div className="page-header">
        <div>
          <Link to="/connectors" className="connector-detail-back">
            <ArrowLeft size={18} />
            <span>{t('connectors.backToList')}</span>
          </Link>
          <h1>{formName || connector.name}</h1>
          <p className="page-subtitle">{selectedKindMeta?.label ?? connector.kind}</p>
        </div>
        {canWrite ? (
          <div className="connector-detail-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void handleDelete()}>
              <Trash2 size={18} />
              <span>{t('connectors.deleteTitle')}</span>
            </button>
            {isSyncConnector ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={syncing || !hasOutputDatasetsConfigured}
                title={!hasOutputDatasetsConfigured ? t('connectors.syncRequiresOutputs') : undefined}
                onClick={openSyncDialog}
              >
                {syncing ? <Loader2 size={18} className="console-loading-spinner" /> : <Play size={18} />}
                <span>{syncing ? t('connectors.syncRunning') : t('connectors.syncRunNow')}</span>
              </button>
            ) : null}
            {showSave ? (
              <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? t('connectors.saving') : t('connectors.save')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        className={`ontology-admin-content connector-detail-panel${isTabbedDetail ? ' connector-detail-panel--tabbed' : ''}`}
      >
        {isTabbedDetail ? (
          <>
            <div className="document-channel-settings-tabs" role="tablist" aria-label={t('connectors.detailTabsAria')}>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'general'}
                className={`document-channel-settings-tab${activeTab === 'general' ? ' active' : ''}`}
                onClick={() => setActiveTab('general')}
              >
                <Settings size={18} />
                <span>{t(isSyncConnector ? 'connectors.tabGeneral' : 'connectors.tabSettings')}</span>
              </button>
              {isSyncConnector ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'datasets'}
                  className={`document-channel-settings-tab${activeTab === 'datasets' ? ' active' : ''}`}
                  onClick={() => setActiveTab('datasets')}
                >
                  <Database size={18} />
                  <span>{t('connectors.tabDatasets')}</span>
                </button>
              ) : null}
              {isSyncConnector ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'cron'}
                  className={`document-channel-settings-tab${activeTab === 'cron' ? ' active' : ''}`}
                  onClick={() => setActiveTab('cron')}
                >
                  <Clock size={18} />
                  <span>{t('connectors.tabCron')}</span>
                </button>
              ) : null}
              {isTushareConnector ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'probe'}
                  className={`document-channel-settings-tab${activeTab === 'probe' ? ' active' : ''}`}
                  onClick={() => setActiveTab('probe')}
                >
                  <FlaskConical size={18} />
                  <span>{t('connectors.tabProbe')}</span>
                </button>
              ) : null}
              {isSearchTool ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'playground'}
                  className={`document-channel-settings-tab${activeTab === 'playground' ? ' active' : ''}`}
                  onClick={() => setActiveTab('playground')}
                >
                  <FlaskConical size={18} />
                  <span>{t('connectors.tabPlayground')}</span>
                </button>
              ) : null}
            </div>
            <div
              className={`document-channel-settings-form${
                activeTab === 'playground' || activeTab === 'probe'
                  ? ' connector-detail-tab-panel--playground'
                  : ''
              }`}
              role="tabpanel"
            >
              {activeTab === 'general' ? formContent : null}
              {activeTab === 'datasets' && isSyncConnector ? datasetsContent : null}
              {activeTab === 'cron' && isSyncConnector ? cronContent : null}
              {activeTab === 'probe' && isTushareConnector && id ? (
                <ConnectorTushareProbe
                  connectorId={id}
                  apiBaseUrl={inputValues.api_base_url}
                  embedded
                />
              ) : null}
              {activeTab === 'playground' && isSearchTool && selectedKindMeta && id ? (
                <ConnectorSearchPlayground
                  connectorId={id}
                  kindMeta={selectedKindMeta}
                  baselineInputs={playgroundBaseline}
                  inputValues={inputValues}
                  settingsRows={settingsRows}
                  embedded
                />
              ) : null}
            </div>
          </>
        ) : (
          <div className="connector-detail-card">{formContent}</div>
        )}
      </div>

      {isSyncConnector ? (
        <ConnectorSyncDialog
          open={syncDialogOpen}
          syncing={syncing}
          onClose={() => setSyncDialogOpen(false)}
          onConfirm={confirmSync}
        />
      ) : null}
    </div>
  );
}
