import type { DatasetResponse } from '../../data/datasetsApi';

/**
 * How a dataset is named in a list, a picker or a message — one function, because five callers each wrote
 * `display_name || `${schema_name}.${table_name}`` and every one of them printed **null.null** for a file dataset, which has
 * neither a schema nor a table.
 *
 * Display name first (that is what people call it), then the table's identity, then the source for a file dataset, then
 * the id — always something true, never a composed emptiness.
 */
export function datasetLabel(
  dataset: Pick<
    DatasetResponse,
    'kind' | 'display_name' | 'schema_name' | 'table_name' | 'data_source_name' | 'id'
  >,
): string {
  const display = dataset.display_name?.trim();
  if (display) return display;
  if (dataset.kind === 'file') return dataset.data_source_name ?? dataset.id;
  if (dataset.schema_name && dataset.table_name) return `${dataset.schema_name}.${dataset.table_name}`;
  return dataset.id;
}
