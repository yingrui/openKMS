import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Settings, Trash2, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { deleteConnector } from '../../data/connectorsApi';
import { useAuth } from '../../contexts/AuthContext';
import { PERM_CONNECTORS_WRITE } from '../../config/permissions';
import { ConnectorFormFields } from './ConnectorFormFields';
import { ConnectorSearchPlayground } from './ConnectorSearchPlayground';
import { useConnectorDetailForm } from './useConnectorDetailForm';
import '../documents/DocumentChannelSettings.scss';
import '../ontology/ontology-admin.scss';

export function ConnectorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('console');
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(PERM_CONNECTORS_WRITE);

  const {
    loading,
    saving,
    connector,
    selectedKindMeta,
    isSearchTool,
    activeTab,
    setActiveTab,
    formName,
    formFieldsProps,
    playgroundBaseline,
    inputValues,
    settingsRows,
    handleSave,
  } = useConnectorDetailForm(id, canWrite);

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
            {(!isSearchTool || activeTab === 'settings') ? (
              <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? t('connectors.saving') : t('connectors.save')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        className={`ontology-admin-content connector-detail-panel${isSearchTool ? ' connector-detail-panel--tabbed' : ''}`}
      >
        {isSearchTool ? (
          <>
            <div className="document-channel-settings-tabs" role="tablist" aria-label={t('connectors.detailTabsAria')}>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'settings'}
                className={`document-channel-settings-tab${activeTab === 'settings' ? ' active' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                <Settings size={18} />
                <span>{t('connectors.tabSettings')}</span>
              </button>
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
            </div>
            <div
              className={`document-channel-settings-form${activeTab === 'playground' ? ' connector-detail-tab-panel--playground' : ''}`}
              role="tabpanel"
            >
              {activeTab === 'settings' ? formContent : null}
              {activeTab === 'playground' && selectedKindMeta && id ? (
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
    </div>
  );
}
