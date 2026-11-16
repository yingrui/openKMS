/** The relation draft, and its wire shape — the empty rows are dropped, weights default to 1. */
export type RelationMemberDraft = {
  metricId: string;
  weight: string;
  /** The member's own grouping key when the two sides name the same key differently (明细 scenario_id ↔ 方案 id). */
  groupField: string;
};

export type RelationDraft = {
  target: string;
  members: RelationMemberDraft[];
  toleranceKind: 'abs' | 'rel';
  toleranceValue: string;
  /** What to do when *this* identity is the one that failed (the rule's own advice still applies). */
  suggestion: string;
};

function toTolerance(draft: Pick<RelationDraft, 'toleranceKind' | 'toleranceValue'>) {
  const amount = Number(draft.toleranceValue) || 0;
  return draft.toleranceKind === 'rel' ? { rel: amount } : { abs: amount };
}

export function relationPayload(draft: RelationDraft) {
  const suggestion = draft.suggestion.trim();
  return {
    target: { metric: draft.target },
    members: draft.members
      .filter((member) => member.metricId)
      .map((member) => ({
        metric: member.metricId,
        weight: Number(member.weight) || 1,
        ...(member.groupField.trim() ? { group_field: member.groupField.trim() } : {}),
      })),
    tolerance: toTolerance(draft),
    ...(suggestion ? { suggestion } : {}),
  };
}

/** A blank identity: no members yet, exact tolerance (0). */
export function emptyRelationDraft(): RelationDraft {
  return {
    target: '',
    members: [{ metricId: '', weight: '1', groupField: '' }],
    toleranceKind: 'abs',
    toleranceValue: '0',
    suggestion: '',
  };
}

/** The wire shape of a whole rule: every identity, in the order the author wrote them. */
export function identitiesPayload(drafts: RelationDraft[]) {
  return drafts.map(relationPayload);
}
