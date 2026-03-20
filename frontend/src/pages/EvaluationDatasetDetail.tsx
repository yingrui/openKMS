import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  X,
  Play,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchEvaluationDataset,
  fetchEvaluationDatasetItems,
  createEvaluationDatasetItem,
  updateEvaluationDatasetItem,
  deleteEvaluationDatasetItem,
  runEvaluation,
  type EvaluationDatasetResponse,
  type EvaluationDatasetItemResponse,
  type EvaluationRunResult,
} from '../data/evaluationDatasetsApi';
import './EvaluationDatasetDetail.css';

export function EvaluationDatasetDetail() {
  const { id: datasetId } = useParams<{ id: string }>();
  const [dataset, setDataset] = useState<EvaluationDatasetResponse | null>(null);
  const [items, setItems] = useState<EvaluationDatasetItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editItem, setEditItem] = useState<EvaluationDatasetItemResponse | null>(null);
  const [itemQuery, setItemQuery] = useState('');
  const [itemExpected, setItemExpected] = useState('');
  const [itemSaving, setItemSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResults, setRunResults] = useState<EvaluationRunResult[] | null>(null);

  const loadDataset = useCallback(async () => {
    if (!datasetId) return;
    try {
      const data = await fetchEvaluationDataset(datasetId);
      setDataset(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load evaluation dataset');
    } finally {
      setLoading(false);
    }
  }, [datasetId]);

  const loadItems = useCallback(async () => {
    if (!datasetId) return;
    try {
      const data = await fetchEvaluationDatasetItems(datasetId);
      setItems(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load items');
    }
  }, [datasetId]);

  useEffect(() => {
    loadDataset();
  }, [loadDataset]);

  useEffect(() => {
    if (datasetId) loadItems();
  }, [datasetId, loadItems]);

  const handleAddItem = async () => {
    if (!datasetId || !itemQuery.trim() || !itemExpected.trim()) return;
    setItemSaving(true);
    try {
      await createEvaluationDatasetItem(datasetId, {
        query: itemQuery.trim(),
        expected_answer: itemExpected.trim(),
      });
      setShowItemForm(false);
      setItemQuery('');
      setItemExpected('');
      toast.success('Item added');
      loadItems();
      loadDataset();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to add item');
    } finally {
      setItemSaving(false);
    }
  };

  const handleUpdateItem = async () => {
    if (!datasetId || !editItem || !itemQuery.trim() || !itemExpected.trim()) return;
    setItemSaving(true);
    try {
      await updateEvaluationDatasetItem(datasetId, editItem.id, {
        query: itemQuery.trim(),
        expected_answer: itemExpected.trim(),
      });
      setEditItem(null);
      setItemQuery('');
      setItemExpected('');
      toast.success('Item updated');
      loadItems();
      loadDataset();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update item');
    } finally {
      setItemSaving(false);
    }
  };

  const handleDeleteItem = async (item: EvaluationDatasetItemResponse) => {
    if (!datasetId || !confirm('Delete this item?')) return;
    try {
      await deleteEvaluationDatasetItem(datasetId, item.id);
      toast.success('Item deleted');
      loadItems();
      loadDataset();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete item');
    }
  };

  const openEditItem = (item: EvaluationDatasetItemResponse) => {
    setEditItem(item);
    setItemQuery(item.query);
    setItemExpected(item.expected_answer);
  };

  const closeItemForm = () => {
    setShowItemForm(false);
    setEditItem(null);
    setItemQuery('');
    setItemExpected('');
  };

  const handleRunEvaluation = async () => {
    if (!datasetId) return;
    setRunning(true);
    setRunResults(null);
    try {
      const res = await runEvaluation(datasetId);
      setRunResults(res.results);
      toast.success(`Evaluation complete: ${res.results.length} items`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to run evaluation');
    } finally {
      setRunning(false);
    }
  };

  if (loading || !dataset) {
    return (
      <div className="eval-detail">
        <p className="eval-detail-loading">Loading...</p>
      </div>
    );
  }

  return (
    <div className="eval-detail">
      <Link to="/evaluation-datasets" className="eval-detail-back">
        <ArrowLeft size={18} />
        <span>Back to Evaluation</span>
      </Link>

      <header className="eval-detail-header">
        <div>
          <h1>{dataset.name}</h1>
          <p className="eval-detail-subtitle">
            {dataset.knowledge_base_name || dataset.knowledge_base_id}
            {dataset.description && ` • ${dataset.description}`}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleRunEvaluation}
          disabled={running || items.length === 0}
        >
          {running ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
          <span>{running ? 'Running...' : 'Run Evaluation'}</span>
        </button>
      </header>

      <section className="eval-detail-section">
        <div className="eval-detail-section-header">
          <h2>Items ({items.length})</h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setShowItemForm(true);
              setItemQuery('');
              setItemExpected('');
            }}
          >
            <Plus size={16} />
            <span>Add Item</span>
          </button>
        </div>

        {items.length === 0 ? (
          <p className="eval-empty-text">No items yet. Add query + expected answer pairs.</p>
        ) : (
          <div className="eval-table-wrap">
            <table className="eval-table">
              <thead>
                <tr>
                  <th>Query</th>
                  <th>Expected Answer</th>
                  <th className="eval-table-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="eval-table-query">{item.query}</td>
                    <td className="eval-table-expected">{item.expected_answer}</td>
                    <td className="eval-table-actions">
                      <div className="eval-table-btns">
                        <button
                          type="button"
                          title="Edit"
                          aria-label="Edit"
                          onClick={() => openEditItem(item)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          aria-label="Delete"
                          onClick={() => handleDeleteItem(item)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {runResults && runResults.length > 0 && (
        <section className="eval-detail-section eval-results-section">
          <h2>Evaluation Results</h2>
          <div className="eval-results-list">
            {runResults.map((r) => (
              <div key={r.item_id} className="eval-result-item">
                <div className="eval-result-query">
                  <strong>Query:</strong> {r.query}
                </div>
                <div className="eval-result-row">
                  <div>
                    <strong>Expected:</strong>
                    <p>{r.expected_answer}</p>
                  </div>
                  <div>
                    <strong>Generated:</strong>
                    <p>{r.generated_answer}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(showItemForm || editItem) && (
        <div className="eval-dialog-overlay" onClick={closeItemForm}>
          <div className="eval-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="eval-dialog-header">
              <h2>{editItem ? 'Edit Item' : 'Add Item'}</h2>
              <button type="button" className="eval-dialog-close" onClick={closeItemForm}>
                <X size={20} />
              </button>
            </div>
            <div className="eval-dialog-body">
              <label>
                <span>Query</span>
                <textarea
                  value={itemQuery}
                  onChange={(e) => setItemQuery(e.target.value)}
                  placeholder="Question to ask"
                  rows={3}
                />
              </label>
              <label>
                <span>Expected Answer</span>
                <textarea
                  value={itemExpected}
                  onChange={(e) => setItemExpected(e.target.value)}
                  placeholder="Expected answer"
                  rows={4}
                />
              </label>
            </div>
            <div className="eval-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeItemForm}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!itemQuery.trim() || !itemExpected.trim() || itemSaving}
                onClick={editItem ? handleUpdateItem : handleAddItem}
              >
                {itemSaving ? 'Saving...' : editItem ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
