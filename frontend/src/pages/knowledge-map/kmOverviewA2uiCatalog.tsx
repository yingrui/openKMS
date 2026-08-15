import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Catalog } from '@a2ui/web_core/v0_9';
import { basicCatalog, createComponentImplementation } from '@a2ui/react/v0_9';

/** Must match backend ``KM_OVERVIEW_A2UI_CATALOG_ID``. */
export const KM_OVERVIEW_A2UI_CATALOG_ID =
  'https://openkms.local/a2ui/catalogs/knowledge-map-overview/v1.json';

export const KM_OVERVIEW_A2UI_SURFACE_ID = 'km-overview';

// @a2ui packages expect Zod v3 shapes; cast APIs to satisfy createComponentImplementation under Zod v4.
const KmNodeLinkApi = {
  name: 'KmNodeLink',
  schema: z.object({
    nodeId: z.string(),
    label: z.string(),
  }),
} as never;

const KmResourceLinkApi = {
  name: 'KmResourceLink',
  schema: z.object({
    resourceType: z.string(),
    resourceId: z.string(),
    label: z.string(),
    href: z.string(),
  }),
} as never;

const KmNodeLink = createComponentImplementation(KmNodeLinkApi, ({ props }: { props: Record<string, string> }) => {
  const label = props.label || props.nodeId;
  return (
    <Link className="km-overview-a2ui-node" to={`/knowledge-map?node=${encodeURIComponent(props.nodeId)}`}>
      {label}
    </Link>
  );
});

const KmResourceLink = createComponentImplementation(
  KmResourceLinkApi,
  ({ props }: { props: Record<string, string> }) => {
    const href = props.href || '/articles';
    const label = props.label || `${props.resourceType}: ${props.resourceId}`;
    return (
      <span className="km-overview-a2ui-res">
        <Link className="km-overview-a2ui-res__link" to={href}>
          {label}
        </Link>
        <span className="km-overview-a2ui-res__type">{(props.resourceType || '').replace(/_/g, ' ')}</span>
      </span>
    );
  },
);

const basicComponents = [...basicCatalog.components.values()];
const basicFunctions = basicCatalog.functions ? [...basicCatalog.functions.values()] : [];

export const kmOverviewCatalog = new Catalog(
  KM_OVERVIEW_A2UI_CATALOG_ID,
  [...basicComponents, KmNodeLink, KmResourceLink] as never[],
  basicFunctions as never[],
);
