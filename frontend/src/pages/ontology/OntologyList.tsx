import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Box, Code2, Link2, ArrowRight, Zap } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchObjectTypes,
  fetchLinkTypes,
  type ObjectTypeResponse,
  type LinkTypeResponse,
} from '../../data/ontologyApi';
import {
  fetchOntologyActionTypes,
  fetchOntologyFunctions,
  type OntologyActionTypeResponse,
  type OntologyFunctionResponse,
} from '../../data/ontologyFunctionsApi';
import {
  CARD_PREVIEW_LIMIT,
  LIST_PAGE_SIZE_DEFAULT,
  type CardListGraphViewMode,
} from '../../hooks/useStoredViewMode';
import { Pagination, ResourceViewToggle } from '../../styles/design-system';
import { OntologySchemaGraph } from './OntologySchemaGraph';
import './OntologyList.scss';

const VIEW_STORAGE_KEY = 'ontology-overview-view-v2';

function readOntologyView(): CardListGraphViewMode {
  try {
    const v2 = localStorage.getItem(VIEW_STORAGE_KEY);
    if (v2 === 'card' || v2 === 'list' || v2 === 'graph') return v2;
    const legacy = localStorage.getItem('ontology-overview-view');
    if (legacy === 'graph') return 'graph';
    // Legacy "list" was the card grid.
  } catch {
    /* ignore */
  }
  return 'card';
}

function paginateSlice<T>(items: T[], page: number, pageSize: number): T[] {
  const start = page * pageSize;
  return items.slice(start, start + pageSize);
}

export function OntologyList() {
  const { t } = useTranslation('explore');
  const { t: tc } = useTranslation('common');
  const [objectTypes, setObjectTypes] = useState<ObjectTypeResponse[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkTypeResponse[]>([]);
  const [functions, setFunctions] = useState<OntologyFunctionResponse[]>([]);
  const [actionTypes, setActionTypes] = useState<OntologyActionTypeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewModeState] = useState<CardListGraphViewMode>(readOntologyView);

  const [objPage, setObjPage] = useState(0);
  const [linkPage, setLinkPage] = useState(0);
  const [fnPage, setFnPage] = useState(0);
  const [actionPage, setActionPage] = useState(0);
  const [listPageSize, setListPageSize] = useState(LIST_PAGE_SIZE_DEFAULT);

  const resetListPages = () => {
    setObjPage(0);
    setLinkPage(0);
    setFnPage(0);
    setActionPage(0);
  };

  const switchView = (mode: CardListGraphViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
    resetListPages();
  };

  const objectTypeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ot of objectTypes) map.set(ot.id, ot.name);
    return map;
  }, [objectTypes]);

  const load = async () => {
    try {
      const [objRes, linkRes, fnRes, actions] = await Promise.all([
        fetchObjectTypes({ countFromNeo4j: true }),
        fetchLinkTypes({ countFromNeo4j: true }),
        fetchOntologyFunctions(),
        fetchOntologyActionTypes(),
      ]);
      setObjectTypes(objRes.items);
      setLinkTypes(linkRes.items);
      setFunctions(fnRes.items);
      setActionTypes(actions);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('ontology.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const isCardView = viewMode === 'card';
  const isListView = viewMode === 'list';
  const isGraphView = viewMode === 'graph';

  const cardObjectTypes = useMemo(
    () => (isCardView ? objectTypes.slice(0, CARD_PREVIEW_LIMIT) : objectTypes),
    [objectTypes, isCardView],
  );
  const cardLinkTypes = useMemo(
    () => (isCardView ? linkTypes.slice(0, CARD_PREVIEW_LIMIT) : linkTypes),
    [linkTypes, isCardView],
  );
  const cardFunctions = useMemo(
    () => (isCardView ? functions.slice(0, CARD_PREVIEW_LIMIT) : functions),
    [functions, isCardView],
  );
  const cardActionTypes = useMemo(
    () => (isCardView ? actionTypes.slice(0, CARD_PREVIEW_LIMIT) : actionTypes),
    [actionTypes, isCardView],
  );

  const listObjectTypes = useMemo(
    () => (isListView ? paginateSlice(objectTypes, objPage, listPageSize) : objectTypes),
    [objectTypes, isListView, objPage, listPageSize],
  );
  const listLinkTypes = useMemo(
    () => (isListView ? paginateSlice(linkTypes, linkPage, listPageSize) : linkTypes),
    [linkTypes, isListView, linkPage, listPageSize],
  );
  const listFunctions = useMemo(
    () => (isListView ? paginateSlice(functions, fnPage, listPageSize) : functions),
    [functions, isListView, fnPage, listPageSize],
  );
  const listActionTypes = useMemo(
    () => (isListView ? paginateSlice(actionTypes, actionPage, listPageSize) : actionTypes),
    [actionTypes, isListView, actionPage, listPageSize],
  );

  const onListPageSizeChange = (size: number) => {
    setListPageSize(size);
    resetListPages();
  };

  const renderObjectCards = (items: ObjectTypeResponse[]) => (
    <div className="ontology-grid">
      {items.map((ot) => (
        <Link key={ot.id} to={`/object-explorer/objects/${ot.id}`} className="ontology-card">
          <div className="ontology-card-top">
            <div className="ontology-icon ontology-icon-object">
              <Box size={24} strokeWidth={1.5} />
            </div>
          </div>
          <h3>{ot.name}</h3>
          <p className="ontology-desc">{ot.description || t('shared.noDescription')}</p>
          <div className="ontology-meta">
            <span>{t('ontology.instanceCount', { count: ot.instance_count })}</span>
            {ot.properties?.length ? (
              <span>{t('ontology.propertyCount', { count: ot.properties.length })}</span>
            ) : null}
          </div>
        </Link>
      ))}
    </div>
  );

  const renderLinkCards = (items: LinkTypeResponse[]) => (
    <div className="ontology-grid">
      {items.map((lt) => (
        <Link key={lt.id} to={`/object-explorer/links/${lt.id}`} className="ontology-card">
          <div className="ontology-card-top">
            <div className="ontology-icon ontology-icon-link">
              <Link2 size={24} strokeWidth={1.5} />
            </div>
          </div>
          <h3>{lt.name}</h3>
          <p className="ontology-desc">{lt.description || t('shared.noDescription')}</p>
          <div className="ontology-meta">
            <span className="ontology-type-arrow">
              {lt.source_object_type_name || t('ontology.endpointSource')}
              <ArrowRight size={14} />
              {lt.target_object_type_name || t('ontology.endpointTarget')}
            </span>
            <span>{t('ontology.linkCount', { count: lt.link_count })}</span>
          </div>
        </Link>
      ))}
    </div>
  );

  const renderFunctionCards = (items: OntologyFunctionResponse[]) => (
    <div className="ontology-grid">
      {items.map((fn) => (
        <Link key={fn.id} to={`/ontology-manager/functions/${fn.id}`} className="ontology-card">
          <div className="ontology-card-top">
            <div className="ontology-icon ontology-icon-function">
              <Code2 size={24} strokeWidth={1.5} />
            </div>
          </div>
          <h3>{fn.display_name}</h3>
          <p className="ontology-desc">{fn.description || t('shared.noDescription')}</p>
          <div className="ontology-meta">
            <span>{fn.api_name}</span>
            <span>{fn.status}</span>
            {fn.published_version != null ? (
              <span>{t('ontology.publishedVersion', { version: fn.published_version })}</span>
            ) : (
              <span>{t('ontology.notPublished')}</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );

  const renderActionCards = (items: OntologyActionTypeResponse[]) => (
    <div className="ontology-grid">
      {items.map((action) => (
        <Link
          key={action.id}
          to={`/ontology-manager/action-types/${action.id}`}
          className="ontology-card"
        >
          <div className="ontology-card-top">
            <div className="ontology-icon ontology-icon-action">
              <Zap size={24} strokeWidth={1.5} />
            </div>
          </div>
          <h3>{action.display_name}</h3>
          <p className="ontology-desc">{action.description || t('shared.noDescription')}</p>
          <div className="ontology-meta">
            <span>{action.api_name}</span>
            <span>
              {objectTypeNameById.get(action.object_type_id) ?? t('ontology.unknownObjectType')}
            </span>
            <span>{action.status}</span>
          </div>
        </Link>
      ))}
    </div>
  );

  const renderObjectTable = (items: ObjectTypeResponse[]) => (
    <div className="ds-resource-table-wrap">
      <table className="ds-resource-table">
        <thead>
          <tr>
            <th>{t('shared.name')}</th>
            <th>{t('shared.description')}</th>
            <th>{t('ontology.listColInstances')}</th>
            <th>{t('ontology.listColProperties')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((ot) => (
            <tr key={ot.id}>
              <td>
                <Link to={`/object-explorer/objects/${ot.id}`} className="ds-resource-table__link">
                  {ot.name}
                </Link>
              </td>
              <td>{ot.description || t('shared.noDescription')}</td>
              <td>{ot.instance_count}</td>
              <td>{ot.properties?.length ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderLinkTable = (items: LinkTypeResponse[]) => (
    <div className="ds-resource-table-wrap">
      <table className="ds-resource-table">
        <thead>
          <tr>
            <th>{t('shared.name')}</th>
            <th>{t('ontology.listColEndpoints')}</th>
            <th>{t('ontology.listColLinks')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((lt) => (
            <tr key={lt.id}>
              <td>
                <Link to={`/object-explorer/links/${lt.id}`} className="ds-resource-table__link">
                  {lt.name}
                </Link>
              </td>
              <td>
                {lt.source_object_type_name || t('ontology.endpointSource')}
                {' → '}
                {lt.target_object_type_name || t('ontology.endpointTarget')}
              </td>
              <td>{lt.link_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderFunctionTable = (items: OntologyFunctionResponse[]) => (
    <div className="ds-resource-table-wrap">
      <table className="ds-resource-table">
        <thead>
          <tr>
            <th>{t('shared.name')}</th>
            <th>{t('ontology.listColIdentifier')}</th>
            <th>{t('ontology.listColStatus')}</th>
            <th>{t('ontology.listColPublished')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((fn) => (
            <tr key={fn.id}>
              <td>
                <Link
                  to={`/ontology-manager/functions/${fn.id}`}
                  className="ds-resource-table__link"
                >
                  {fn.display_name}
                </Link>
              </td>
              <td>{fn.api_name}</td>
              <td>{fn.status}</td>
              <td>
                {fn.published_version != null
                  ? t('ontology.publishedVersion', { version: fn.published_version })
                  : t('ontology.notPublished')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderActionTable = (items: OntologyActionTypeResponse[]) => (
    <div className="ds-resource-table-wrap">
      <table className="ds-resource-table">
        <thead>
          <tr>
            <th>{t('shared.name')}</th>
            <th>{t('ontology.listColIdentifier')}</th>
            <th>{t('ontology.listColObjectType')}</th>
            <th>{t('ontology.listColStatus')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((action) => (
            <tr key={action.id}>
              <td>
                <Link
                  to={`/ontology-manager/action-types/${action.id}`}
                  className="ds-resource-table__link"
                >
                  {action.display_name}
                </Link>
              </td>
              <td>{action.api_name}</td>
              <td>
                {objectTypeNameById.get(action.object_type_id) ?? t('ontology.unknownObjectType')}
              </td>
              <td>{action.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const cardPreviewHint = (shown: number, total: number) =>
    total > shown ? (
      <p className="ds-card-preview-hint">
        {tc('cardPreviewHint', { shown, total })}
        <button type="button" onClick={() => switchView('list')}>
          {tc('viewAllInList')}
        </button>
      </p>
    ) : null;

  return (
    <div className="ontology-list">
      <div className="page-header ontology-header">
        <div>
          <h1>{t('ontology.title')}</h1>
          <p className="page-subtitle">{t('ontology.subtitle')}</p>
        </div>
        {!loading ? (
          <ResourceViewToggle
            modes={['card', 'list', 'graph']}
            value={viewMode}
            onChange={switchView}
          />
        ) : null}
      </div>

      {loading && <p className="ontology-loading">{t('shared.loading')}</p>}

      {!loading && isGraphView ? (
        <OntologySchemaGraph objectTypes={objectTypes} linkTypes={linkTypes} />
      ) : null}

      {!loading && isCardView ? (
        <>
          <section className="ontology-section">
            <h2 className="ontology-section-title">{t('ontology.objectTypesHeading')}</h2>
            {objectTypes.length === 0 ? (
              <div className="ontology-empty">
                <Box size={40} strokeWidth={1} />
                <p>{t('ontology.emptyObjectTypes')}</p>
              </div>
            ) : (
              <>
                {cardPreviewHint(cardObjectTypes.length, objectTypes.length)}
                {renderObjectCards(cardObjectTypes)}
              </>
            )}
          </section>

          <section className="ontology-section">
            <h2 className="ontology-section-title">{t('ontology.linkTypesHeading')}</h2>
            {linkTypes.length === 0 ? (
              <div className="ontology-empty">
                <Link2 size={40} strokeWidth={1} />
                <p>{t('ontology.emptyLinkTypes')}</p>
              </div>
            ) : (
              <>
                {cardPreviewHint(cardLinkTypes.length, linkTypes.length)}
                {renderLinkCards(cardLinkTypes)}
              </>
            )}
          </section>

          <section className="ontology-section">
            <h2 className="ontology-section-title">{t('ontology.functionsHeading')}</h2>
            {functions.length === 0 ? (
              <div className="ontology-empty">
                <Code2 size={40} strokeWidth={1} />
                <p>{t('ontology.emptyFunctions')}</p>
              </div>
            ) : (
              <>
                {cardPreviewHint(cardFunctions.length, functions.length)}
                {renderFunctionCards(cardFunctions)}
              </>
            )}
          </section>

          <section className="ontology-section">
            <h2 className="ontology-section-title">{t('ontology.actionTypesHeading')}</h2>
            {actionTypes.length === 0 ? (
              <div className="ontology-empty">
                <Zap size={40} strokeWidth={1} />
                <p>{t('ontology.emptyActionTypes')}</p>
              </div>
            ) : (
              <>
                {cardPreviewHint(cardActionTypes.length, actionTypes.length)}
                {renderActionCards(cardActionTypes)}
              </>
            )}
          </section>
        </>
      ) : null}

      {!loading && isListView ? (
        <>
          <section className="ontology-section">
            <h2 className="ontology-section-title">{t('ontology.objectTypesHeading')}</h2>
            {objectTypes.length === 0 ? (
              <div className="ontology-empty">
                <Box size={40} strokeWidth={1} />
                <p>{t('ontology.emptyObjectTypes')}</p>
              </div>
            ) : (
              <>
                {renderObjectTable(listObjectTypes)}
                <Pagination
                  total={objectTypes.length}
                  page={objPage}
                  pageSize={listPageSize}
                  onPageChange={setObjPage}
                  onPageSizeChange={onListPageSizeChange}
                />
              </>
            )}
          </section>

          <section className="ontology-section">
            <h2 className="ontology-section-title">{t('ontology.linkTypesHeading')}</h2>
            {linkTypes.length === 0 ? (
              <div className="ontology-empty">
                <Link2 size={40} strokeWidth={1} />
                <p>{t('ontology.emptyLinkTypes')}</p>
              </div>
            ) : (
              <>
                {renderLinkTable(listLinkTypes)}
                <Pagination
                  total={linkTypes.length}
                  page={linkPage}
                  pageSize={listPageSize}
                  onPageChange={setLinkPage}
                  onPageSizeChange={onListPageSizeChange}
                />
              </>
            )}
          </section>

          <section className="ontology-section">
            <h2 className="ontology-section-title">{t('ontology.functionsHeading')}</h2>
            {functions.length === 0 ? (
              <div className="ontology-empty">
                <Code2 size={40} strokeWidth={1} />
                <p>{t('ontology.emptyFunctions')}</p>
              </div>
            ) : (
              <>
                {renderFunctionTable(listFunctions)}
                <Pagination
                  total={functions.length}
                  page={fnPage}
                  pageSize={listPageSize}
                  onPageChange={setFnPage}
                  onPageSizeChange={onListPageSizeChange}
                />
              </>
            )}
          </section>

          <section className="ontology-section">
            <h2 className="ontology-section-title">{t('ontology.actionTypesHeading')}</h2>
            {actionTypes.length === 0 ? (
              <div className="ontology-empty">
                <Zap size={40} strokeWidth={1} />
                <p>{t('ontology.emptyActionTypes')}</p>
              </div>
            ) : (
              <>
                {renderActionTable(listActionTypes)}
                <Pagination
                  total={actionTypes.length}
                  page={actionPage}
                  pageSize={listPageSize}
                  onPageChange={setActionPage}
                  onPageSizeChange={onListPageSizeChange}
                />
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
