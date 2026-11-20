/**
 * Reading and writing the two halves of `SKILL.md`.
 *
 * The editor shows the frontmatter as a form, because it holds the three values the platform acts on
 * (name, description, entrypoint) — asking an author to type YAML by hand to change a description is
 * a needless way to get the indentation wrong. The body stays markdown text.
 *
 * Serialisation is deliberately narrow: the fields we render, in a fixed order. Anything else in the
 * frontmatter would be silently dropped by a form that cannot show it, so we do not pretend to
 * round-trip unknown keys.
 */

export interface SkillFrontMatter {
  name: string;
  description: string;
  entrypoint: string;
  subcommands: string[];
}

export interface SplitSkillFile {
  frontmatter: SkillFrontMatter;
  body: string;
}

const EMPTY: SkillFrontMatter = {
  name: "",
  description: "",
  entrypoint: "",
  subcommands: [],
};

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseSubcommands(raw: string): string[] {
  const value = raw.trim();
  if (!value) return [];
  const inner =
    value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  return inner
    .split(",")
    .map((part) => unquote(part))
    .filter((part) => part.length > 0);
}

export function splitSkillFile(text: string): SplitSkillFile {
  const normalised = text.replace(/^\ufeff/, "");
  if (!normalised.startsWith("---")) {
    return { frontmatter: { ...EMPTY }, body: normalised };
  }
  const lines = normalised.split("\n");
  const end = lines.findIndex(
    (line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line),
  );
  if (end === -1) {
    return { frontmatter: { ...EMPTY }, body: normalised };
  }
  const frontmatter: SkillFrontMatter = { ...EMPTY };
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    if (key === "name") frontmatter.name = unquote(raw);
    else if (key === "description") frontmatter.description = unquote(raw);
    else if (key === "entrypoint") frontmatter.entrypoint = unquote(raw);
    else if (key === "subcommands")
      frontmatter.subcommands = parseSubcommands(raw);
  }
  return {
    frontmatter,
    body: lines
      .slice(end + 1)
      .join("\n")
      .replace(/^\n/, ""),
  };
}

export function joinSkillFile(
  frontmatter: SkillFrontMatter,
  body: string,
): string {
  const lines = [
    "---",
    `name: ${frontmatter.name.trim()}`,
    `description: ${frontmatter.description.trim()}`,
  ];
  if (frontmatter.entrypoint.trim()) {
    lines.push(`entrypoint: ${frontmatter.entrypoint.trim()}`);
    const subcommands = frontmatter.subcommands
      .map((part) => part.trim())
      .filter(Boolean);
    lines.push(`subcommands: [${subcommands.join(", ")}]`);
  }
  // Trailing whitespace is not content: without this, a stored file and the same file
  // re-composed by the editor differ by a newline, and every open looks like an edit.
  lines.push("---", "", body.replace(/^\n+/, "").replace(/\s+$/, ""));
  return `${lines.join("\n")}\n`;
}
