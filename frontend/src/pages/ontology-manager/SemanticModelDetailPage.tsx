import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import {
  fetchSemanticModel,
  type SemanticModelResponse,
} from '../../data/semanticModelsApi';
import { EntityViewLoading, EntityViewShell } from './EntityViewShell';
import '../ontology/ontology-admin.scss';

type SemanticModelDetailContext = {
  model: SemanticModelResponse;
  /** Every dataset in the instance — the model's scope is picked from these. */
  allDatasets: DatasetResponse[];
  reload: () => Promise<void>;
};

const SemanticModelDetailCtx = createContext<SemanticModelDetailContext | null>(null);

export function useSemanticModelDetail(): SemanticModelDetailContext {
  const ctx = useContext(SemanticModelDetailCtx);
  if (!ctx) throw new Error('useSemanticModelDetail requires SemanticModelDetailPage');
  return ctx;
}

function scopeMeta(model: SemanticModelResponse): ReactNode {
  if (model.datasets.length === 0) return model.description ?? undefined;
  return (
    <>
      {model.description ? `${model.description} · ` : ''}
      {model.datasets.map((d) => (
        <span key={d.id} className="model-scope__chip">
          {d.name}
        </span>
      ))}
    </>
  );
}

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
        kind={t('dataModel.kind')}
        title={model.name}
        meta={scopeMeta(model)}
        navItems={[
          { to: base, label: t('dataModel.metrics'), end: true },
          { to: `${base}/datasets`, label: t('datasets.title') },
          { to: `${base}/relationships`, label: t('datasets.relationships') },
          { to: `${base}/try`, label: t('dataModel.tryTitle') },
          { to: `${base}/settings`, label: t('dataModel.settings') },
        ]}
      >
        <Outlet />
      </EntityViewShell>
    </SemanticModelDetailCtx.Provider>
  );
}
