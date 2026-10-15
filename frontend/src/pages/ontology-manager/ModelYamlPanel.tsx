import { useEffect, useMemo, useState } from 'react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Copy, X } from 'lucide-react';
import { toast } from 'sonner';
import { exportSemanticModel, exportSemanticModelYaml } from '../../data/semanticModelsApi';
import './model-yaml.scss';

type ViewMode = 'tree' | 'yaml';
type ExpandMode = 'default' | 'all' | 'collapsed';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function leafText(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}

/** A node of the document tree: objects/arrays collapse, leaves render inline. */
function TreeNode({
  label,
  value,
  depth,
  expand,
}: {
  label: string;
  value: unknown;
  depth: number;
  expand: ExpandMode;
}) {
  const open = expand === 'all' ? true : expand === 'collapsed' ? depth < 1 : depth < 2;

  if (Array.isArray(value)) {
    return (
      <details className="model-tree__node" open={open}>
        <summary>
          <span className="model-tree__key">{label}</span>
          <span className="model-tree__meta">[{value.length}]</span>
        </summary>
        <div className="model-tree__children">
          {value.map((item, i) => {
            const name =
              isPlainObject(item) && typeof item.name === 'string' ? item.name : `[${i}]`;
            return (
              <TreeNode
                key={`${name}-${i}`}
                label={name}
                value={item}
                depth={depth + 1}
                expand={expand}
              />
            );
          })}
        </div>
      </details>
    );
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    return (
      <details className="model-tree__node" open={open}>
        <summary>
          <span className="model-tree__key">{label}</span>
          <span className="model-tree__meta">{`{${keys.length}}`}</span>
        </summary>
        <div className="model-tree__children">
          {keys.map((k) => (
            <TreeNode key={k} label={k} value={value[k]} depth={depth + 1} expand={expand} />
          ))}
        </div>
      </details>
    );
  }

  return (
    <div className="model-tree__leaf">
      <span className="model-tree__key">{label}</span>
      <span className="model-tree__value">{leafText(value)}</span>
    </div>
  );
}

/**
 * The model's Ossie document in a right-docked panel — full height (unlike a dialog), with a
 * collapsible tree for browsing and the raw YAML for copying.
 */
export function ModelYamlPanel({
  modelId,
  modelName,
  open,
  onClose,
}: {
  modelId: string;
  modelName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation('ontology');
  const {
    data,
    loading,
    error: loadError,
  } = useAsyncData(async () => {
    if (!open) return null;
    const [d, y] = await Promise.all([
      exportSemanticModel(modelId),
      exportSemanticModelYaml(modelId),
    ]);
    return { doc: d as Record<string, unknown>, yaml: y };
  }, [open, modelId]);
  /** Null/empty while the dialog is closed or loading, exactly as the previous state was. */
  const doc = data?.doc ?? null;
  const yaml = data?.yaml ?? '';
  const [view, setView] = useState<ViewMode>('tree');
  const [expand, setExpand] = useState<ExpandMode>('default');

  useEffect(() => {
    if (loadError) {
      toast.error(loadError instanceof Error ? loadError.message : t('dataModel.exportFailed'));
    }
  }, [loadError, t]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const entries = useMemo(() => (doc ? Object.entries(doc) : []), [doc]);

  if (!open) return null;

  return (
    <>
      <div className="model-yaml__scrim" onClick={onClose} />
      <aside className="model-yaml" role="dialog" aria-label={t('dataModel.viewYaml')}>
        <header className="model-yaml__head">
          <div className="model-yaml__title">
            <h2>{t('dataModel.viewYaml')}</h2>
            <span className="page-subtitle">{modelName}</span>
          </div>
          <div className="model-yaml__actions">
            <div className="model-yaml__segmented">
              {(['tree', 'yaml'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`btn btn-secondary btn-sm${view === m ? ' is-active' : ''}`}
                  aria-pressed={view === m}
                  onClick={() => setView(m)}
                >
                  {t(m === 'tree' ? 'dataModel.yamlTree' : 'dataModel.yamlRaw')}
                </button>
              ))}
            </div>
            {view === 'tree' && (
              <div className="model-yaml__segmented">
                {(['default', 'all', 'collapsed'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`btn btn-secondary btn-sm${expand === m ? ' is-active' : ''}`}
                    aria-pressed={expand === m}
                    onClick={() => setExpand(m)}
                    title={t(`dataModel.yamlExpand_${m}`)}
                  >
                    {t(`dataModel.yamlExpandLabel_${m}`)}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                void navigator.clipboard?.writeText(yaml);
                toast.success(t('dataModel.copied'));
              }}
            >
              <Copy size={14} aria-hidden />
              {t('dataModel.copy')}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onClose}
              aria-label={t('shared.close')}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </header>

        <div className="model-yaml__body">
          {loading ? (
            <p className="entity-view__readonly">{t('shared.loading')}</p>
          ) : view === 'yaml' ? (
            <pre className="model-yaml__text">{yaml}</pre>
          ) : (
            <div className="model-tree">
              {entries.map(([k, v]) => (
                <TreeNode key={`${expand}-${k}`} label={k} value={v} depth={0} expand={expand} />
              ))}
            </div>
          )}
        </div>

        <footer className="model-yaml__foot">
          <ChevronDown size={14} aria-hidden />
          <span>{t('dataModel.yamlHint')}</span>
        </footer>
      </aside>
    </>
  );
}
