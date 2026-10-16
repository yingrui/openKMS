/**
 * Where a report's numbers come from, named — for the tile and for the dashboard's table of contents.
 *
 * One function, because the same resolution was written twice: the tile linked the source, and the
 * rail needed only its name.
 */

import type { DashboardReport } from '../../data/dashboardsApi';
import type { DatasetResponse } from '../../data/datasetsApi';
import type { SemanticModelResponse } from '../../data/semanticModelsApi';

export interface ReportSource {
  label: string;
  /** The Catalog page for it, when there is one to open. */
  href: string | null;
  kind: 'dataset' | 'semantic_model';
}

export function reportSource(
  report: DashboardReport,
  datasets: DatasetResponse[],
  models: SemanticModelResponse[],
  missingLabel: string,
): ReportSource {
  if (report.source_kind === 'semantic_model') {
    const model = models.find((m) => m.id === report.semantic_model_id);
    return {
      kind: 'semantic_model',
      label: model?.name ?? missingLabel,
      href: report.semantic_model_id ? `/data-model/${report.semantic_model_id}` : null,
    };
  }
  const dataset = datasets.find((d) => d.id === report.dataset_id);
  return {
    kind: 'dataset',
    label: dataset
      ? dataset.display_name || `${dataset.schema_name}.${dataset.table_name}`
      : missingLabel,
    href: report.dataset_id ? `/datasets/${report.dataset_id}` : null,
  };
}
