import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Boxes, Loader2, MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchSemanticModels,
  importSemanticModel,
  type SemanticModelResponse,
} from '../../data/semanticModelsApi';
import { EmptyState } from '../../styles/design-system';
import { DatasetAppTabs } from './DatasetAppTabs';
import { SemanticModelWizard } from './SemanticModelWizard';
import '../ontology/ontology-admin.scss';

/** Model tab: the list of semantic models. Open one to edit its scope, fields, and metrics. */
export function DataModelPage() {
  const { t } = useTranslation('ontology');
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [models, setModels] = useState<SemanticModelResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setModels((await fetchSemanticModels()).items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const doc = JSON.parse(await file.text()) as unknown;
      const summary = await importSemanticModel(doc);
      toast.success(
        t('dataModel.importDone', {
          r: summary.relationships,
          m: summary.metrics,
          f: summary.fields,
        }),
      );
      if (summary.warnings.length) {
        toast.message(t('dataModel.importWarnings', { n: summary.warnings.length }));
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.importFailed'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="ontology-admin">
      <div className="page-header model-page-header">
        <div>
          <h1>{t('dataModel.title')}</h1>
          <p className="page-subtitle">{t('dataModel.subtitle')}</p>
        </div>
        <div className="dataset-columns__actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowWizard(true)}
          >
            <Plus size={14} aria-hidden />
            {t('dataModel.newModel')}
          </button>
          <details className="model-menu">
            <summary className="btn btn-secondary btn-sm" aria-label={t('dataModel.more')}>
              <MoreHorizontal size={16} aria-hidden />
            </summary>
            <div className="model-menu__panel">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                {t('dataModel.importModel')}
              </button>
            </div>
          </details>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
          }}
        />
      </div>
      <DatasetAppTabs />
      <div className="ontology-admin-content">
        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : models.length === 0 ? (
          <EmptyState
            icon={<Boxes size={32} aria-hidden />}
            title={t('dataModel.modelsEmpty')}
            description={t('dataModel.modelsEmptyHint')}
            action={
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowWizard(true)}
              >
                <Plus size={16} aria-hidden />
                {t('dataModel.newModel')}
              </button>
            }
          />
        ) : (
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('dataModel.colModel')}</th>
                  <th>{t('dataModel.colDatasets')}</th>
                  <th>{t('dataModel.modelDescription')}</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link to={`/data-model/${m.id}`} className="ontology-manager-list__api-link">
                        <strong>{m.name}</strong>
                      </Link>
                    </td>
                    <td>{m.datasets.length}</td>
                    <td className="console-table-muted">{m.description ?? t('datasets.dash')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SemanticModelWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onCreated={(model) => {
          setShowWizard(false);
          void load();
          navigate(`/data-model/${model.id}`);
        }}
      />
    </div>
  );
}
