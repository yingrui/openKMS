import { useMemo } from 'react';
import type {
  LinkTypeResponse,
  ObjectTypeResponse,
  PropertyDef,
} from '../../data/ontologyApi';
import { linkedChartOptions as linkedOptionsFor } from './linkedChartOptions';

/**
 * What this exploration can chart: the type's own properties, the neighbours' reachable through one link, and the
 * subset currently charted.
 *
 * `chartProps` is the order the caller chose; everything here derives from it plus the ontology, so a property that
 * was removed from the type simply disappears instead of drawing an empty chart.
 */
export function useChartCatalog({
  typeId,
  objectType,
  links,
  typeById,
  chartProps,
}: {
  typeId: string;
  objectType: ObjectTypeResponse | null;
  links: LinkTypeResponse[];
  typeById: Record<string, ObjectTypeResponse>;
  chartProps: string[] | null;
}) {
  const properties: PropertyDef[] = useMemo(
    () => (objectType?.properties ?? []),
    [objectType]
  );

  const linkedOptions = useMemo(
    () => linkedOptionsFor(links, typeById, typeId),
    [links, typeById, typeId]
  );

  /* The charts on screen: a layout seeds them once, then the caller edits the list — add, remove, move. */
  const builtinCharts = useMemo(
    () =>
      [
        ...(objectType?.display_property ? [objectType.display_property] : []),
        ...properties.map((p) => p.name),
      ]
        .filter((name, index, all) => all.indexOf(name) === index)
        .slice(0, 6),
    [objectType, properties]
  );

  const options = useMemo(
    () => [
      ...properties.map((p) => ({ value: p.name, label: p.name })),
      ...linkedOptions,
    ],
    [linkedOptions, properties]
  );

  const known = useMemo(() => new Set(options.map((option) => option.value)), [options]);

  const chartProperties = useMemo(() => {
    const source = chartProps ?? builtinCharts;
    return source.filter((name) => known.has(name));
  }, [chartProps, builtinCharts, known]);

  const addable = useMemo(
    () => options.filter((option) => !chartProperties.includes(option.value)),
    [chartProperties, options]
  );

  return { properties, options, chartProperties, addable };
}
