/**
 * Where a finding's numbers come from, named — for the tile and for the story's table of contents.
 *
 * One function, because the same resolution was written twice: the tile linked the source, and the
 * rail needed only its name.
 */

import type { StoryFinding } from '../../data/storiesApi';
import type { DatasetResponse } from '../../data/datasetsApi';
import type { SemanticModelResponse } from '../../data/semanticModelsApi';

export interface FindingSource {
  label: string;
  /** The Catalog page for it, when there is one to open. */
  href: string | null;
  kind: 'dataset' | 'semantic_model';
}

export function findingSource(
  finding: StoryFinding,
  datasets: DatasetResponse[],
  models: SemanticModelResponse[],
  missingLabel: string,
): FindingSource {
  if (finding.source_kind === 'semantic_model') {
    const model = models.find((m) => m.id === finding.semantic_model_id);
    return {
      kind: 'semantic_model',
      label: model?.name ?? missingLabel,
      href: finding.semantic_model_id ? `/data-model/${finding.semantic_model_id}` : null,
    };
  }
  const dataset = datasets.find((d) => d.id === finding.dataset_id);
  return {
    kind: 'dataset',
    label: dataset
      ? dataset.display_name || `${dataset.schema_name}.${dataset.table_name}`
      : missingLabel,
    href: finding.dataset_id ? `/datasets/${finding.dataset_id}` : null,
  };
}
