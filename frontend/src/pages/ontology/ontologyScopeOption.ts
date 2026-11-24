import type { ObjectTypeResponse } from '../../data/ontologyApi';

/** One selectable scope: a group or an object type, with the count shown beside it. */
export type ScopeOption = { id: string; label: string; detail?: string; count: number };

/** The scope option for one object type, used by the picker's "object types" tab. */
export function typeOption(type: ObjectTypeResponse): ScopeOption {
  return {
    id: type.id,
    label: type.name,
    detail: type.description ?? undefined,
    count: type.instance_count,
  };
}
