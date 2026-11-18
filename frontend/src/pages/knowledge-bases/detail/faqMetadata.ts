import { fetchDocumentById } from '../../../data/documentsApi';
import { fetchChannelById } from '../../../data/channelsApi';
import { normalizeExtractionSchemaToFields } from '../../../data/channelUtils';

/**
 * Which of a knowledge base's metadata keys hold arrays for **this** FAQ's document.
 *
 * The answer is a property of the channel the document came from (its extraction schema or its label
 * config), not of the knowledge base — two documents in one base can disagree about the same key. It was
 * inlined in the edit handler, thirty lines of fetching inside an `onClick`; the dialog only ever needed
 * the map.
 *
 * An unreachable document or channel yields `{}` rather than failing: the dialog then treats every key as
 * single-valued, which is what it did before.
 */
export async function metadataArrayFlags(
  documentId: string | null | undefined,
  metadataKeys: string[] | null | undefined
): Promise<Record<string, boolean>> {
  const flags: Record<string, boolean> = {};
  if (!documentId || !metadataKeys?.length) return flags;
  try {
    const doc = await fetchDocumentById(documentId);
    const channel = await fetchChannelById(doc.channel_id);
    const fromSchema = new Map(
      normalizeExtractionSchemaToFields(channel.extraction_schema ?? null).map((f) => [
        f.key,
        f.type === 'array',
      ])
    );
    const fromLabels = new Map(
      (channel.label_config ?? []).map((lc: { key: string; type?: string }) => [
        lc.key,
        lc.type === 'list[object_type]',
      ])
    );
    for (const key of metadataKeys) flags[key] = fromSchema.get(key) ?? fromLabels.get(key) ?? false;
  } catch {
    /* the caller's dialog falls back to single-valued */
  }
  return flags;
}
