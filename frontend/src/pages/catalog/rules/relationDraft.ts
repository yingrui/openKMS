/** The relation draft, and its wire shape — the empty rows are dropped, weights default to 1. */
export type RelationMemberDraft = { metricId: string; weight: string };

export type RelationDraft = {
  target: string;
  members: RelationMemberDraft[];
  toleranceKind: 'abs' | 'rel';
  toleranceValue: string;
};

function toTolerance(draft: Pick<RelationDraft, 'toleranceKind' | 'toleranceValue'>) {
  const amount = Number(draft.toleranceValue) || 0;
  return draft.toleranceKind === 'rel' ? { rel: amount } : { abs: amount };
}

export function relationPayload(draft: RelationDraft) {
  return {
    target: { metric: draft.target },
    members: draft.members
      .filter((member) => member.metricId)
      .map((member) => ({ metric: member.metricId, weight: Number(member.weight) || 1 })),
    tolerance: toTolerance(draft),
  };
}
