import { useEffect, useMemo, useState } from 'react';
import { fetchObjectInstances } from '../../data/ontologyApi';
import type { LinkTypeResponse, ObjectTypeResponse } from '../../data/ontologyApi';

/**
 * A column that holds another object's id shows that object's name.
 *
 * `distributor_id` is a uuid: it identifies a row and tells a reader nothing. The link that produced it is known
 * (`lineOfDistributor`), and so is the target's display property, so the table can show 兰州嘉禾环境科技 instead — with
 * the id still available in the cell's tooltip.
 *
 * Resolved by asking for the target objects whose key is in the page's ids (`key:in:…`), one request per link, and
 * only for the columns actually on screen.
 */
export function useLinkedColumnLabels({
  typeId,
  links,
  typeById,
  columns,
  rows,
}: {
  typeId: string;
  links: LinkTypeResponse[];
  typeById: Record<string, ObjectTypeResponse>;
  columns: string[];
  rows: { data?: Record<string, unknown> | null }[];
}): Record<string, Record<string, string>> {
  const [labels, setLabels] = useState<Record<string, Record<string, string>>>({});

  /* The links that go from this type to another, keyed by the foreign-key property they carry. */
  const byColumn = useMemo(() => {
    const out: Record<string, { targetId: string; key: string; display: string }> = {};
    for (const link of links) {
      if (link.source_object_type_id !== typeId || !link.source_key_property) continue;
      if (!columns.includes(link.source_key_property)) continue;
      const target = typeById[link.target_object_type_id];
      if (!target) continue;
      out[link.source_key_property] = {
        targetId: target.id,
        key: (target.key_properties ?? ['id'])[0] ?? 'id',
        display: target.display_property ?? (target.key_properties ?? ['id'])[0] ?? 'id',
      };
    }
    return out;
  }, [columns, links, typeById, typeId]);

  useEffect(() => {
    const missing = Object.entries(byColumn).filter(([column]) => {
      const ids = new Set(rows.map((row) => row.data?.[column]).filter(Boolean).map(String));
      const known = labels[column] ?? {};
      return [...ids].some((id) => known[id] === undefined);
    });
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(
      missing.map(async ([column, spec]) => {
        const values = [
          ...new Set(rows.map((row) => row.data?.[column]).filter(Boolean).map(String)),
        ];
        if (values.length === 0) return null;
        const res = await fetchObjectInstances(spec.targetId, {
          filters: [`${spec.key}:in:${values.join(',')}`],
          limit: 500,
        });
        const map: Record<string, string> = {};
        for (const item of res.items) {
          const key = item.data?.[spec.key];
          if (key === undefined || key === null) continue;
          map[String(key)] = String(item.data?.[spec.display] ?? key);
        }
        return [column, map] as const;
      })
    )
      .then((entries) => {
        if (cancelled) return;
        setLabels((current) => {
          const next = { ...current };
          for (const entry of entries) {
            if (!entry) continue;
            next[entry[0]] = { ...(current[entry[0]] ?? {}), ...entry[1] };
          }
          return next;
        });
      })
      .catch(() => {
        /* A label that cannot be resolved is not a reason to hide the row: the id is still shown. */
      });
    return () => {
      cancelled = true;
    };
  }, [byColumn, labels, rows]);

  return labels;
}
