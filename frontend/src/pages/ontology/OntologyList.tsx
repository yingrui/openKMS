import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Box, Link2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchObjectTypes,
  fetchLinkTypes,
  type ObjectTypeResponse,
  type LinkTypeResponse,
} from '../../data/ontologyApi';
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
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewModeState] = useState<CardListGraphViewMode>(readOntologyView);

  const switchView = (mode: CardListGraphViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
    setObjPage(0);
    setLinkPage(0);
  };

  const [objPage, setObjPage] = useState(0);
  const [linkPage, setLinkPage] = useState(0);
  const [listPageSize, setListPageSize] = useState(LIST_PAGE_SIZE_DEFAULT);

  const load = async () => {
    try {
      const [objRes, linkRes] = await Promise.all([
        fetchObjectTypes({ countFromNeo4j: true }),
        fetchLinkTypes({ countFromNeo4j: true }),
      ]);
      setObjectTypes(objRes.items);
      setLinkTypes(linkRes.items);
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

  const listObjectTypes = useMemo(
    () => (isListView ? paginateSlice(objectTypes, objPage, listPageSize) : objectTypes),
    [objectTypes, isListView, objPage, listPageSize],
  );
  const listLinkTypes = useMemo(
    () => (isListView ? paginateSlice(linkTypes, linkPage, listPageSize) : linkTypes),
    [linkTypes, isListView, linkPage, listPageSize],
  );

  const renderObjectCards = (items: ObjectTypeResponse[]) => (
    <div className="ontology-grid">
      {items.map((ot) => (
        <Link key={ot.id} to={`/objects/${ot.id}`} className="ontology-card">
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
        <Link key={lt.id} to={`/links/${lt.id}`} className="ontology-card">
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
                <Link to={`/objects/${ot.id}`} className="ds-resource-table__link">
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
                <Link to={`/links/${lt.id}`} className="ds-resource-table__link">
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
                  onPageSizeChange={(size) => {
                    setListPageSize(size);
                    setObjPage(0);
                    setLinkPage(0);
                  }}
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
                  onPageSizeChange={(size) => {
                    setListPageSize(size);
                    setObjPage(0);
                    setLinkPage(0);
                  }}
                />
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
