import { preprocessWikilinksForPreview } from '../../pages/wiki/wikiPreviewMarkdown';

/** Same `[[target|label]]` rewrite as wiki preview (`wiki:` pseudo-URL). */
export function preprocessProjectWikilinks(markdown: string): string {
  return preprocessWikilinksForPreview(markdown);
}

/** Keep `wiki:` hrefs; react-markdown otherwise drops unknown schemes. */
export function projectWikilinkUrlTransform(url: string): string {
  if (url.startsWith('wiki:')) return url;
  if (url.startsWith('#')) return url;
  if (url.startsWith('/')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('mailto:')) return url;
  return '';
}

/**
 * Resolve a wikilink target to a project-workspace path, relative to the current file.
 * Bare names without an extension become `.md`. Leading `/` is project-root.
 * Returns null if the path would escape the project root.
 */
export function resolveProjectWikilink(currentFile: string, target: string): string | null {
  let t = target.trim().replace(/\\/g, '/');
  const hash = t.indexOf('#');
  if (hash >= 0) t = t.slice(0, hash).trim();
  if (!t || t.includes('\0')) return null;

  const dir = currentFile.includes('/') ? currentFile.slice(0, currentFile.lastIndexOf('/')) : '';
  const fromRoot = t.startsWith('/');
  const raw = fromRoot ? t.slice(1) : `${dir ? `${dir}/` : ''}${t}`;
  const out: string[] = [];
  for (const seg of raw.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(seg);
  }
  if (out.length === 0) return null;
  const base = out[out.length - 1]!;
  if (!base.includes('.')) out[out.length - 1] = `${base}.md`;
  return out.join('/');
}
