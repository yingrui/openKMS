import type { LinkTypeResponse, ObjectTypeResponse } from '../../data/ontologyApi';

export interface ChartOption {
  value: string;
  label: string;
}

/**
 * Properties reachable through one link, spelled `@<link>/<prop>` — the same string the filters and the aggregation
 * use, so a charted linked property and a filtered one are the same idea written once.
 *
 * The link's api_name is the readable key, except where two links share one on this side: `Stock` has two `ofStock`
 * (holding, transaction), and the reader resolves a name to one of them. Where that happens the link id is used,
 * because it is the only unambiguous handle.
 */
export function linkedChartOptions(
  links: LinkTypeResponse[],
  typeById: Record<string, ObjectTypeResponse>,
  typeId: string
): ChartOption[] {
  const touching = links.filter(
    (link) => link.source_object_type_id === typeId || link.target_object_type_id === typeId
  );
  const nameCounts = new Map<string, number>();
  for (const link of touching) {
    const name = link.api_name ?? '';
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  return touching.flatMap((link) => {
    const otherId =
      link.source_object_type_id === typeId
        ? link.target_object_type_id
        : link.source_object_type_id;
    const other = typeById[otherId];
    const key =
      (nameCounts.get(link.api_name ?? '') ?? 0) > 1 ? link.id : (link.api_name ?? link.id);
    return (other?.properties ?? []).map((property) => ({
      value: `@${key}/${property.name}`,
      label: `${other?.name ?? otherId} · ${property.name}`,
    }));
  });
}
