/**
 * Normalize AI / LaTeX math delimiters so remark-math + KaTeX can render them.
 * Applied outside fenced code blocks only.
 *
 * Supports:
 * - `\[ ... \]` / `\( ... \)` → `$$` / `$`
 * - Bracket-wrapped TeX blocks like `[ \text{2Be} + ... ]` (common model output)
 * - Leaves `$` / `$$` / ```math fences unchanged
 */

const FENCE_SPLIT = /(^|\n)(```[\s\S]*?\n```)/g;

function mapOutsideFences(source: string, mapChunk: (chunk: string) => string): string {
  if (!source.includes('```')) return mapChunk(source);
  let out = '';
  let last = 0;
  const re = new RegExp(FENCE_SPLIT.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const prefix = m[1] ?? '';
    const fence = m[2] ?? '';
    const start = m.index;
    out += mapChunk(source.slice(last, start)) + prefix + fence;
    last = start + prefix.length + fence.length;
  }
  out += mapChunk(source.slice(last));
  return out;
}

function looksLikeTex(inner: string): boolean {
  const s = inner.trim();
  if (!s.includes('\\')) return false;
  // Avoid markdown link leftovers / bare lists: need a TeX command or common chem markers.
  return (
    /\\[a-zA-Z]+/.test(s) ||
    /[_^]/.test(s) ||
    /\\ce\b/.test(s) ||
    /\\pu\b/.test(s)
  );
}

/** Convert LaTeX display/inline delimiters and AI bracket-wrapped equations. */
export function normalizeMarkdownMath(source: string): string {
  if (!source) return source;
  return mapOutsideFences(source, (chunk) => {
    let s = chunk;

    // Display: \[ ... \] (multiline)
    s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_full, inner: string) => `\n$$\n${inner.trim()}\n$$\n`);

    // Inline: \( ... \)
    s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_full, inner: string) => `$${inner.trim()}$`);

    // Bracket-wrapped TeX on its own line(s), e.g. [ \text{2Be} + \text{O}_2 \xrightarrow{\Delta} \text{2BeO} ]
    // Not [[wikilinks]] and not [label](url).
    s = s.replace(
      /(^|\n)[ \t]*\[(?!\[)([\s\S]*?)\](?!\()[ \t]*(?=\n|$)/g,
      (full, lead: string, inner: string) => {
        if (!looksLikeTex(inner)) return full;
        return `${lead}$$\n${inner.trim()}\n$$`;
      },
    );

    return s;
  });
}

/** Full preprocess for shared rich markdown rendering. */
export function preprocessRichMarkdown(source: string): string {
  return normalizeMarkdownMath(source);
}
