/** The editor's two authoring modes, and the small decisions that follow from which one you are in. */
export type Authoring = 'code' | 'logic';

export const AUTHORING_OF_SOURCE = (source: string | null | undefined): Authoring =>
  source === 'logic' ? 'logic' : 'code';

/** Where "back" goes: the list this function came from, not a fixed one. */
export function backToListPath(authoring: Authoring): string {
  return authoring === 'logic' ? '/function-editor/logic' : '/function-editor';
}

/**
 * Publishing publishes the latest draft, so there is nothing to do when the published version is already the latest.
 * An unknown latest (a function saved but never published) counts as "something to publish".
 */
export function hasUnpublishedDraft(
  latest: number | null | undefined,
  published: number | null | undefined,
): boolean {
  if (latest == null) return true;
  return published !== latest;
}
