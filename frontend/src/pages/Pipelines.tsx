import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, GitBranch, Search, Trash2, Pencil, X, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '../components/ErrorBanner';
import {
  fetchPipelines,
  fetchTemplateVariables,
  createPipeline,
  deletePipeline,
  updatePipeline,
  type PipelineResponse,
} from '../data/pipelinesApi';
import { fetchModels, type ApiModelResponse } from '../data/modelsApi';
import './Pipelines.css';

export function Pipelines() {
  const { t } = useTranslation('workspace');
  const dash = t('shared.dash');
  const [pipelines, setPipelines] = useState<PipelineResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editPipeline, setEditPipeline] = useState<PipelineResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCommand, setFormCommand] = useState(
    'openkms-cli pipeline run --pipeline-name paddleocr-doc-parse --input {input} --s3-prefix {s3_prefix}',
  );
  const [formArgs, setFormArgs] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [showVarHelp, setShowVarHelp] = useState(false);
  const [allModels, setAllModels] = useState<ApiModelResponse[]>([]);
  const [formModelId, setFormModelId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, vars, modelsRes] = await Promise.all([
        fetchPipelines(),
        fetchTemplateVariables(),
        fetchModels(),
      ]);
      setPipelines(res.items);
      setTemplateVars(vars);
      setAllModels(modelsRes.items);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('pipelines.loadFailed');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditPipeline(null);
    setFormName('');
    setFormDescription('');
    setFormCommand(
      'openkms-cli pipeline run --pipeline-name paddleocr-doc-parse --input {input} --s3-prefix {s3_prefix}',
    );
    setFormArgs('');
    setFormModelId('');
    setShowCreate(true);
  };

  const openEdit = (p: PipelineResponse) => {
    setEditPipeline(p);
    setFormName(p.name);
    setFormDescription(p.description || '');
    setFormCommand(p.command);
    setFormArgs(p.default_args ? JSON.stringify(p.default_args, null, 2) : '');
    setFormModelId(p.model_id || '');
    setShowCreate(true);
  };

  const closeForm = () => {
    if (!submitting) {
      setShowCreate(false);
      setEditPipeline(null);
    }
  };

  const handleSubmit = async () => {
    if (!formName.trim()) return;
    const wasEdit = Boolean(editPipeline);
    setSubmitting(true);
    try {
      let parsedArgs: Record<string, unknown> | undefined;
      if (formArgs.trim()) {
        parsedArgs = JSON.parse(formArgs);
      }

      if (editPipeline) {
        await updatePipeline(editPipeline.id, {
          name: formName,
          description: formDescription || null,
          command: formCommand,
          default_args: parsedArgs ?? null,
          model_id: formModelId || null,
        });
      } else {
        await createPipeline({
          name: formName,
          description: formDescription || null,
          command: formCommand,
          default_args: parsedArgs ?? null,
          model_id: formModelId || null,
        });
      }
      setShowCreate(false);
      setEditPipeline(null);
      toast.success(wasEdit ? t('pipelines.updatedToast') : t('pipelines.createdToast'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('shared.operationFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('pipelines.deleteConfirm'))) return;
    try {
      await deletePipeline(id);
      toast.success(t('pipelines.deletedToast'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('shared.deleteFailed'));
    }
  };

  const filtered = pipelines.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="pipelines">
      <div className="page-header pipelines-header">
        <div>
          <h1>{t('pipelines.title')}</h1>
          <p className="page-subtitle">{t('pipelines.subtitle')}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={18} />
          <span>{t('pipelines.newPipeline')}</span>
        </button>
      </div>
      <div className="pipelines-content">
        <div className="pipelines-toolbar">
          <div className="pipelines-search">
            <Search size={18} />
            <input
              type="search"
              aria-label={t('pipelines.searchAria')}
              placeholder={t('pipelines.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <div className="pipelines-table-wrap">
          {loading ? (
            <div className="pipelines-loading">
              <Loader2 size={32} className="pipelines-loading-spinner" />
              <p>{t('pipelines.loading')}</p>
            </div>
          ) : (
            <table className="pipelines-table">
              <thead>
                <tr>
                  <th>{t('pipelines.colName')}</th>
                  <th>{t('pipelines.colDescription')}</th>
                  <th>{t('pipelines.colModel')}</th>
                  <th>{t('pipelines.colCommand')}</th>
                  <th>{t('pipelines.colUpdated')}</th>
                  <th className="pipelines-table-actions">{t('shared.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                      {pipelines.length === 0 ? t('pipelines.empty') : t('pipelines.noMatches')}
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="pipelines-table-name">
                          <GitBranch size={18} strokeWidth={1.5} />
                          <span>{p.name}</span>
                        </div>
                      </td>
                      <td>{p.description || dash}</td>
                      <td>{p.model_name || dash}</td>
                      <td>
                        <code>{p.command}</code>
                      </td>
                      <td>{new Date(p.updated_at).toLocaleDateString()}</td>
                      <td className="pipelines-table-actions">
                        <div className="pipelines-table-btns">
                          <button type="button" title={t('shared.edit')} onClick={() => openEdit(p)}>
                            <Pencil size={16} />
                          </button>
                          <button type="button" title={t('shared.delete')} onClick={() => void handleDelete(p.id)}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="pipelines-modal-overlay" onClick={closeForm}>
          <div className="pipelines-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pipelines-modal-header">
              <h2>{editPipeline ? t('pipelines.modalEdit') : t('pipelines.modalNew')}</h2>
              <button type="button" onClick={closeForm} disabled={submitting} aria-label={t('shared.close')}>
                <X size={20} />
              </button>
            </div>
            <div className="pipelines-modal-body">
              <label>
                {t('shared.name')}
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} />
              </label>
              <label>
                {t('shared.description')}
                <input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} />
              </label>
              <label>
                {t('pipelines.commandTemplate')}
                <input type="text" value={formCommand} onChange={(e) => setFormCommand(e.target.value)} />
              </label>
              <div className="pipelines-template-help">
                <button type="button" className="pipelines-template-toggle" onClick={() => setShowVarHelp((v) => !v)}>
                  <Info size={14} />
                  <span>{showVarHelp ? t('pipelines.templateVarsHide') : t('pipelines.templateVarsShow')}</span>
                </button>
                {showVarHelp && Object.keys(templateVars).length > 0 && (
                  <div className="pipelines-template-vars">
                    {Object.entries(templateVars).map(([key, desc]) => (
                      <div key={key} className="pipelines-template-var">
                        <code>{`{${key}}`}</code>
                        <span>{desc}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <label>
                {t('pipelines.modelOptional')}
                <select value={formModelId} onChange={(e) => setFormModelId(e.target.value)}>
                  <option value="">{t('pipelines.noModelLinked')}</option>
                  {allModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.provider_name})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('pipelines.defaultArgsJson')}
                <textarea rows={4} value={formArgs} onChange={(e) => setFormArgs(e.target.value)} />
              </label>
            </div>
            <div className="pipelines-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={closeForm} disabled={submitting}>
                {t('shared.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleSubmit()}
                disabled={!formName.trim() || submitting}
              >
                {submitting ? t('shared.saving') : editPipeline ? t('shared.update') : t('shared.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
