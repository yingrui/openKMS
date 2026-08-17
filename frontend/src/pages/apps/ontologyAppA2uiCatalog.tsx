import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Catalog } from '@a2ui/web_core/v0_9';
import { basicCatalog, createComponentImplementation } from '@a2ui/react/v0_9';
import { fetchObjectTypes, fetchObjectInstances } from '../../data/ontologyApi';
import {
  executeOntologyAction,
  fetchOntologyActionTypes,
} from '../../data/ontologyActionsApi';
import { executeOntologyFunctionByApiName } from '../../data/ontologyFunctionsApi';
import { Dialog, FormField } from '../../styles/design-system';
import './OntologyAppA2ui.scss';

export const ONTOLOGY_APP_A2UI_CATALOG_ID =
  'https://openkms.local/a2ui/catalogs/ontology-app/v1.json';
export const ONTOLOGY_APP_A2UI_SURFACE_ID = 'ontology-app';

type BoardCard = { id: string; title: string; data: Record<string, unknown> };

function OntoKanbanBoardImpl({ props }: { props: Record<string, string> }) {
  const objectType = props.objectType || '';
  const columnProperty = props.columnProperty || '';
  const columnsCsv = props.columns || '';
  const columns = useMemo(
    () =>
      columnsCsv
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    [columnsCsv],
  );
  const titleProp = props.cardTitleProperty || '';
  const createAction = props.createAction || '';
  const updateAction = props.updateAction || '';
  const setStatusAction = props.setStatusAction || '';
  const deleteAction = props.deleteAction || '';
  const suggestFunction = props.suggestFunction || '';

  const [typeId, setTypeId] = useState<string | null>(null);
  const [cardsByCol, setCardsByCol] = useState<Record<string, BoardCard[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [foResult, setFoResult] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [editTitle, setEditTitle] = useState('');

  const actionIdByApi = useMemo(() => ({ current: {} as Record<string, string> }), []);

  const refresh = useCallback(async () => {
    if (!objectType || !columnProperty || !titleProp || !columns.length) {
      setError('Board bindings are incomplete');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const ots = await fetchObjectTypes();
      const items = ots.items || [];
      const ot = items.find((t) => t.name === objectType || t.id === objectType);
      if (!ot) throw new Error(`Object type not found: ${objectType}`);
      setTypeId(ot.id);

      const acts = await fetchOntologyActionTypes({ object_type_id: ot.id });
      const map: Record<string, string> = {};
      for (const a of acts) map[a.api_name] = a.id;
      actionIdByApi.current = map;

      const next: Record<string, BoardCard[]> = {};
      for (const col of columns) {
        const page = await fetchObjectInstances(ot.id, {
          limit: 100,
          propFilters: { [columnProperty]: col },
        });
        const rows = page.items || [];
        next[col] = rows.map((r) => ({
          id: r.id,
          title: String((r.data || {})[titleProp] ?? r.id),
          data: (r.data || {}) as Record<string, unknown>,
        }));
      }
      setCardsByCol(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [actionIdByApi, columnProperty, columns, objectType, titleProp]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = async (apiName: string, input: Record<string, unknown>, objectId?: string) => {
    const id = actionIdByApi.current[apiName];
    if (!id) throw new Error(`Action not found: ${apiName}`);
    setBusy(true);
    setError(null);
    try {
      const res = await executeOntologyAction(id, { object_id: objectId, input });
      if (res.status !== 'ok') throw new Error(res.error || 'Action failed');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onDropTo = async (col: string, cardId: string) => {
    if (!setStatusAction) return;
    await runAction(setStatusAction, { object_id: cardId, status: col }, cardId);
  };

  const selected = useMemo(() => {
    if (!selectedId) return null;
    for (const col of columns) {
      const hit = (cardsByCol[col] || []).find((c) => c.id === selectedId);
      if (hit) return hit;
    }
    return null;
  }, [cardsByCol, columns, selectedId]);

  useEffect(() => {
    if (selected) setEditTitle(selected.title);
  }, [selected]);

  return (
    <div className="onto-kanban">
      <div className="onto-kanban__toolbar">
        {createAction ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setShowCreate(true)}>
            Add card
          </button>
        ) : null}
        <button type="button" className="btn btn-secondary" disabled={busy || loading} onClick={() => void refresh()}>
          Refresh
        </button>
        {error ? <span className="onto-kanban__error">{error}</span> : null}
      </div>

      {loading ? <p className="onto-kanban__muted">Loading board…</p> : null}

      <div className="onto-kanban__columns">
        {columns.map((col) => (
          <div
            key={col}
            className="onto-kanban__col"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/plain');
              if (id) void onDropTo(col, id);
            }}
          >
            <div className="onto-kanban__col-title">{col}</div>
            <div className="onto-kanban__cards">
              {(cardsByCol[col] || []).map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className={`onto-kanban__card${selectedId === card.id ? ' onto-kanban__card--selected' : ''}`}
                  draggable={Boolean(setStatusAction)}
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', card.id)}
                  onClick={() => setSelectedId(card.id)}
                >
                  {card.title}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selected && typeId ? (
        <div className="onto-kanban__detail">
          <div className="onto-kanban__detail-head">
            <strong>{selected.title}</strong>
            <Link to={`/object-explorer/objects/${typeId}`} className="onto-kanban__link">
              Open in Explorer
            </Link>
          </div>
          {updateAction ? (
            <div className="onto-kanban__row">
              <input
                className="ds-control"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() =>
                  void runAction(updateAction, { object_id: selected.id, title: editTitle }, selected.id)
                }
              >
                Save
              </button>
            </div>
          ) : null}
          {suggestFunction ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    const res = await executeOntologyFunctionByApiName(suggestFunction, {
                      input: { work_item_id: selected.id },
                      use_published: true,
                    });
                    setFoResult(JSON.stringify(res.output ?? res, null, 2));
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Suggest priority
            </button>
          ) : null}
          {deleteAction ? (
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => {
                if (!window.confirm('Delete this card?')) return;
                void runAction(deleteAction, { object_id: selected.id }, selected.id).then(() =>
                  setSelectedId(null),
                );
              }}
            >
              Delete
            </button>
          ) : null}
          {foResult ? <pre className="onto-kanban__fo">{foResult}</pre> : null}
        </div>
      ) : null}

      <Dialog
        open={showCreate}
        onClose={() => {
          if (!busy) {
            setShowCreate(false);
            setCreateTitle('');
          }
        }}
        closeDisabled={busy}
        title="New card"
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => {
                setShowCreate(false);
                setCreateTitle('');
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="onto-kanban-create-form"
              className="btn btn-primary"
              disabled={busy || !createTitle.trim()}
            >
              Create
            </button>
          </>
        }
      >
        <form
          id="onto-kanban-create-form"
          onSubmit={(e) => {
            e.preventDefault();
            const title = createTitle.trim();
            if (!title || busy) return;
            void runAction(createAction, {
              title,
              status: columns[0] || 'backlog',
            })
              .then(() => {
                setCreateTitle('');
                setShowCreate(false);
              })
              .catch((err) => {
                setError(err instanceof Error ? err.message : String(err));
              });
          }}
        >
          <FormField label="Title">
            <input
              type="text"
              autoFocus
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder="Title"
              disabled={busy}
            />
          </FormField>
        </form>
      </Dialog>
    </div>
  );
}

const OntoKanbanBoardApi = {
  name: 'OntoKanbanBoard',
  schema: z.object({
    objectType: z.string(),
    columnProperty: z.string().optional(),
    columns: z.string().optional(),
    cardTitleProperty: z.string().optional(),
    createAction: z.string().optional(),
    updateAction: z.string().optional(),
    setStatusAction: z.string().optional(),
    deleteAction: z.string().optional(),
    suggestFunction: z.string().optional(),
  }),
} as never;

const OntoActionButtonApi = {
  name: 'OntoActionButton',
  schema: z.object({
    actionApiName: z.string(),
    label: z.string(),
    objectId: z.string().optional(),
  }),
} as never;

const OntoFunctionButtonApi = {
  name: 'OntoFunctionButton',
  schema: z.object({
    functionApiName: z.string(),
    label: z.string(),
    objectId: z.string().optional(),
  }),
} as never;

const OntoObjectLinkApi = {
  name: 'OntoObjectLink',
  schema: z.object({
    objectTypeId: z.string(),
    objectId: z.string(),
    label: z.string(),
  }),
} as never;

const OntoKanbanBoard = createComponentImplementation(OntoKanbanBoardApi, ({ props }: { props: Record<string, string> }) => (
  <OntoKanbanBoardImpl props={props} />
));

const OntoActionButton = createComponentImplementation(
  OntoActionButtonApi,
  ({ props }: { props: Record<string, string> }) => {
    const [msg, setMsg] = useState<string | null>(null);
    return (
      <span className="onto-a2ui-inline">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            void (async () => {
              try {
                const acts = await fetchOntologyActionTypes();
                const hit = acts.find((a) => a.api_name === props.actionApiName);
                if (!hit) throw new Error(`Action not found: ${props.actionApiName}`);
                const res = await executeOntologyAction(hit.id, {
                  object_id: props.objectId,
                  input: props.objectId ? { object_id: props.objectId } : {},
                });
                setMsg(res.status === 'ok' ? 'ok' : res.error || 'error');
              } catch (e) {
                setMsg(e instanceof Error ? e.message : String(e));
              }
            })();
          }}
        >
          {props.label || props.actionApiName}
        </button>
        {msg ? <span className="onto-kanban__muted">{msg}</span> : null}
      </span>
    );
  },
);

const OntoFunctionButton = createComponentImplementation(
  OntoFunctionButtonApi,
  ({ props }: { props: Record<string, string> }) => {
    const [out, setOut] = useState<string | null>(null);
    return (
      <span className="onto-a2ui-inline">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            void (async () => {
              try {
                const res = await executeOntologyFunctionByApiName(props.functionApiName, {
                  input: props.objectId ? { work_item_id: props.objectId } : {},
                  use_published: true,
                });
                setOut(JSON.stringify(res.output ?? res, null, 2));
              } catch (e) {
                setOut(e instanceof Error ? e.message : String(e));
              }
            })();
          }}
        >
          {props.label || props.functionApiName}
        </button>
        {out ? <pre className="onto-kanban__fo">{out}</pre> : null}
      </span>
    );
  },
);

const OntoObjectLink = createComponentImplementation(
  OntoObjectLinkApi,
  ({ props }: { props: Record<string, string> }) => (
    <Link className="onto-kanban__link" to={`/object-explorer/objects/${props.objectTypeId}`}>
      {props.label || props.objectId}
    </Link>
  ),
);

const basicComponents = [...basicCatalog.components.values()];
const basicFunctions = basicCatalog.functions ? [...basicCatalog.functions.values()] : [];

export const ontologyAppCatalog = new Catalog(
  ONTOLOGY_APP_A2UI_CATALOG_ID,
  [...basicComponents, OntoKanbanBoard, OntoActionButton, OntoFunctionButton, OntoObjectLink] as never[],
  basicFunctions as never[],
);
