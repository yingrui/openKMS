import { useCallback, useEffect, useState } from 'react';
import { Plus, GitBranch, Search, Trash2, Pencil, X, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
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
  const [pipelines, setPipelines] = useState<PipelineResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editPipeline, setEditPipeline] = useState<PipelineResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCommand, setFormCommand] = useState('openkms-cli pipeline run --pipeline-name paddleocr-doc-parse --input {input} --s3-prefix {s3_prefix}');
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
      const msg = e instanceof Error ? e.message : 'Failed to load pipelines';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditPipeline(null);
    setFormName('');
    setFormDescription('');
    setFormCommand('openkms-cli pipeline run --pipeline-name paddleocr-doc-parse --input {input} --s3-prefix {s3_prefix}');
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
      toast.success(editPipeline ? 'Pipeline updated' : 'Pipeline created');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this pipeline? This cannot be undone.')) return;
    try {
      await deletePipeline(id);
      toast.success('Pipeline deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
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
          <h1>Pipelines</h1>
          <p className="page-subtitle">
            Manage document processing pipelines. Pipelines define how documents are parsed and processed.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={18} />
          <span>New Pipeline</span>
        </button>
      </div>
      <div className="pipelines-content">
        <div className="pipelines-toolbar">
          <div className="pipelines-search">
            <Search size={18} />
            <input
              type="search"
              aria-label="Search pipelines"
              placeholder="Search pipelines..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="pipelines-error">{error}</p>}
        <div className="pipelines-table-wrap">
          {loading ? (
            <div className="pipelines-loading">
              <Loader2 size={32} className="pipelines-loading-spinner" />
              <p>Loading pipelines…</p>
            </div>
          ) : (
            <table className="pipelines-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Model</th>
                  <th>Command</th>
                  <th>Updated</th>
                  <th className="pipelines-table-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                      {pipelines.length === 0 ? 'No pipelines yet. Create one to get started.' : 'No matches found.'}
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
                      <td>{p.description || '—'}</td>
                      <td>{p.model_name || '—'}</td>
                      <td><code>{p.command}</code></td>
                      <td>{new Date(p.updated_at).toLocaleDateString()}</td>
                      <td className="pipelines-table-actions">
                        <div className="pipelines-table-btns">
                          <button type="button" title="Edit" onClick={() => openEdit(p)}>
                            <Pencil size={16} />
                          </button>
                          <button type="button" title="Delete" onClick={() => handleDelete(p.id)}>
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
              <h2>{editPipeline ? 'Edit Pipeline' : 'New Pipeline'}</h2>
              <button type="button" onClick={closeForm} disabled={submitting} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="pipelines-modal-body">
              <label>
                Name
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} />
              </label>
              <label>
                Description
                <input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} />
              </label>
              <label>
                Command template
                <input type="text" value={formCommand} onChange={(e) => setFormCommand(e.target.value)} />
              </label>
              <div className="pipelines-template-help">
                <button
                  type="button"
                  className="pipelines-template-toggle"
                  onClick={() => setShowVarHelp((v) => !v)}
                >
                  <Info size={14} />
                  <span>{showVarHelp ? 'Hide' : 'Show'} template variables</span>
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
                Model (optional)
                <select value={formModelId} onChange={(e) => setFormModelId(e.target.value)}>
                  <option value="">No model linked</option>
                  {allModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.provider_name})</option>
                  ))}
                </select>
              </label>
              <label>
                Default Args (JSON)
                <textarea rows={4} value={formArgs} onChange={(e) => setFormArgs(e.target.value)} />
              </label>
            </div>
            <div className="pipelines-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={closeForm} disabled={submitting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={!formName.trim() || submitting}
              >
                {submitting ? 'Saving…' : editPipeline ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
