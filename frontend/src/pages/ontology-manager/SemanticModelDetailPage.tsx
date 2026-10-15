import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useParams } from 'react-router-dom';
import { FileCode2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import {
  fetchSemanticModel,
  type SemanticModelResponse,
} from '../../data/semanticModelsApi';
import { EntityViewLoading, EntityViewShell } from './EntityViewShell';
import { ModelYamlPanel } from './ModelYamlPanel';
import { SemanticModelDetailCtx } from './useSemanticModelDetail';
import '../ontology/ontology-admin.scss';

/**
 * A semantic model — the same shell the dataset detail page uses: identity + nav in the
 * sidebar, each section (Metrics / Fields / Try / Settings) rendering inside the outlet.
 */
export function SemanticModelDetailPage() {
  const { t } = useTranslation('ontology');
  const { modelId = '' } = useParams();

  const [model, setModel] = useState<SemanticModelResponse | null>(null);
  const [allDatasets, setAllDatasets] = useState<DatasetResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDocument, setShowDocument] = useState(false);

  const reload = useCallback(async () => {
    if (!modelId) return;
    try {
      const [m, ds] = await Promise.all([fetchSemanticModel(modelId), fetchDatasets()]);
      setModel(m);
      setAllDatasets(ds.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [modelId, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return <EntityViewLoading label={t('shared.loading')} />;
  }
  if (!model) {
    return (
      <div className="ontology-admin">
        <p className="entity-view__readonly">{t('dataModel.modelNotFound')}</p>
      </div>
    );
  }

  const base = `/data-model/${model.id}`;
  return (
    <SemanticModelDetailCtx.Provider value={{ model, allDatasets, reload }}>
      <EntityViewShell
        backTo="/data-model"
        backLabel={t('dataModel.backToModels')}
        title={model.name}
        navItems={[
          { to: base, label: t('dataModel.metrics'), end: true },
          { to: `${base}/datasets`, label: t('datasets.title') },
          { to: `${base}/relationships`, label: t('datasets.relationships') },
          { to: `${base}/playground`, label: t('dataModel.playgroundTitle') },
          { to: `${base}/settings`, label: t('dataModel.settings') },
        ]}
        identityAction={
          <button type="button" onClick={() => setShowDocument(true)}>
            <FileCode2 size={14} aria-hidden />
            {t('dataModel.viewYaml')}
          </button>
        }
      >
        <Outlet />
      </EntityViewShell>
      <ModelYamlPanel
        modelId={model.id}
        modelName={model.name}
        open={showDocument}
        onClose={() => setShowDocument(false)}
      />
    </SemanticModelDetailCtx.Provider>
  );
}
