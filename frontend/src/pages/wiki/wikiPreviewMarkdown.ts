/** Transform markdown for wiki preview only (not persisted). */

/** Remove leading YAML frontmatter when it looks like `key: value` blocks (Obsidian / Quartz style). */
export function stripLeadingYamlFrontmatter(text: string): string {
  const m = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
  if (!m) return text;
  const inner = m[1];
  if (!/:\s/.test(inner)) return text;
  return text.slice(m[0].length);
}

/**
 * Turn `[[target]]` or `[[target|display]]` into markdown links with wiki: pseudo-URL
 * so ReactMarkdown can render them via a custom <a> component.
 */
export function preprocessWikilinksForPreview(markdown: string): string {
  return markdown.replace(/\[\[([^\]]+)\]\]/g, (_full, inner: string) => {
    const raw = String(inner).trim();
    const pipe = raw.indexOf('|');
    const target = (pipe >= 0 ? raw.slice(0, pipe) : raw).trim();
    const display = (pipe >= 0 ? raw.slice(pipe + 1) : raw).trim() || target;
    const esc = display.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
    return `[${esc}](wiki:${encodeURIComponent(target)})`;
  });
}

export function prepareWikiPreviewMarkdown(body: string): string {
  let t = body.trim() ? body : '_Nothing to preview_';
  t = stripLeadingYamlFrontmatter(t);
  t = preprocessWikilinksForPreview(t);
  return t;
}

/** Trim slashes and collapse repeats for path comparison. */
export function normalizeWikiPath(p: string): string {
  return p
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\/+/g, '/');
}

/**
 * Map Obsidian-style [[path]] target to a page id in the current space.
 * Tries exact path, then `wiki/` prefix / no-prefix variants.
 */
export function findPageIdByWikilinkTarget(
  target: string,
  pages: readonly { id: string; path: string }[]
): string | null {
  const t = normalizeWikiPath(target);
  if (!t) return null;
  const byNorm = new Map(pages.map((p) => [normalizeWikiPath(p.path), p.id]));
  const hit = byNorm.get(t);
  if (hit) return hit;
  if (!t.startsWith('wiki/')) {
    const withWiki = normalizeWikiPath(`wiki/${t}`);
    const id = byNorm.get(withWiki);
    if (id) return id;
  } else {
    const sans = normalizeWikiPath(t.slice('wiki/'.length));
    const id = byNorm.get(sans);
    if (id) return id;
  }
  return null;
}
