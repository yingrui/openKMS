/**
 * Editing a story's document (pure list arithmetic).
 *
 * The story **is** the document — editing a finding is writing the array back, so the operations
 * are the array ones. Kept pure and tested because the boundary cases (moving the first tile up,
 * removing the last one) are exactly where an off-by-one hides.
 */

import type { StoryFinding } from '../../data/storiesApi';
import { viewSpec, type ViewDraft } from './findingDraft';

/** What the finding editor can change: what it *is* (source/query) stays where it was built. */
export interface FindingFields {
  title: string;
  takeaway: string;
  view: ViewDraft;
}

/**
 * Apply edited fields to a finding, keeping its source, query and last run.
 *
 * An emptied takeaway or view is **removed**, not blanked: the document should not carry keys that
 * mean nothing.
 */
export function applyFindingFields(finding: StoryFinding, fields: FindingFields): StoryFinding {
  const next: StoryFinding = { ...finding, title: fields.title.trim() || finding.title };
  if (fields.takeaway.trim()) {
    next.takeaway = fields.takeaway.trim();
  } else {
    delete next.takeaway;
  }
  const view = viewSpec(fields.view);
  if (view) {
    next.view = view;
  } else {
    delete next.view;
  }
  return next;
}

/** Replace one finding, leaving the rest — the entry the editor produced. */
export function replaceFinding(
  findings: StoryFinding[],
  index: number,
  entry: StoryFinding,
): StoryFinding[] {
  if (index < 0 || index >= findings.length) return findings;
  return findings.map((r, i) => (i === index ? entry : r));
}

/** Drop one finding. */
export function removeFinding(findings: StoryFinding[], index: number): StoryFinding[] {
  if (index < 0 || index >= findings.length) return findings;
  return findings.filter((_, i) => i !== index);
}

/** Move one finding up (-1) or down (+1); a move off either end is a no-op, not a wrap. */
export function moveFinding(
  findings: StoryFinding[],
  index: number,
  delta: number,
): StoryFinding[] {
  const target = index + delta;
  if (index < 0 || index >= findings.length || target < 0 || target >= findings.length) return findings;
  const next = [...findings];
  const [entry] = next.splice(index, 1);
  next.splice(target, 0, entry);
  return next;
}
