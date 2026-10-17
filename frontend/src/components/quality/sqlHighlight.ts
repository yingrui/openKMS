/**
 * A SQL tokenizer for highlighting, not for understanding.
 *
 * It is a *highlighter's* tokenizer: it never fails, it returns the input unchanged when joined
 * (`join(highlightSql(x)) === x` is the invariant an overlay editor depends on), and knowing the
 * grammar is not a goal. A hand-rolled highlighter is normally a liability, so the rules are tiny and
 * the invariant is a test: keywords, strings, quoted identifiers, numbers, comments, and the
 * `{{placeholder}}` DSL this app puts inside its rule queries.
 */

export type SqlTokenKind = 'plain' | 'keyword' | 'string' | 'number' | 'comment' | 'placeholder';

export interface SqlToken {
  kind: SqlTokenKind;
  text: string;
}

/** Words that get a colour. Deliberately short: a wrong keyword is a colour, not a bug. */
const KEYWORDS = new Set(
  (
    'select from where group by order having limit offset join left right inner outer full on as ' +
    'and or not null is in case when then else end with distinct exists between like ilike asc desc ' +
    'count sum avg min max filter over partition current_date current_timestamp true false'
  ).split(' '),
);

const isDigit = (ch: string) => ch >= '0' && ch <= '9';
const isWordChar = (ch: string) => /[A-Za-z_$]/.test(ch);

export function highlightSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  const push = (kind: SqlTokenKind, text: string) => {
    if (text) tokens.push({ kind, text });
  };
  let plain = '';
  const flush = () => {
    push('plain', plain);
    plain = '';
  };

  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const rest = sql.slice(i);

    // `-- line` and `/* block */`
    if (rest.startsWith('--')) {
      flush();
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      push('comment', sql.slice(i, stop));
      i = stop;
      continue;
    }
    if (rest.startsWith('/*')) {
      flush();
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      push('comment', sql.slice(i, stop));
      i = stop;
      continue;
    }

    // `{{table}}` / `{{column}}` — the app's own placeholders, and the thing to notice in a rule.
    if (rest.startsWith('{{')) {
      flush();
      const end = sql.indexOf('}}', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      push('placeholder', sql.slice(i, stop));
      i = stop;
      continue;
    }

    // 'single quoted string' ('' escapes) and "quoted identifier"
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      if (ch === "'") {
        flush();
        push('string', sql.slice(i, j));
      } else {
        // An identifier is not a literal; colouring it as one would teach the wrong thing.
        plain += sql.slice(i, j);
      }
      i = j;
      continue;
    }

    if (isDigit(ch)) {
      flush();
      let j = i + 1;
      while (j < sql.length && (isDigit(sql[j]) || sql[j] === '.')) j += 1;
      push('number', sql.slice(i, j));
      i = j;
      continue;
    }

    if (isWordChar(ch)) {
      let j = i + 1;
      while (j < sql.length && (isWordChar(sql[j]) || isDigit(sql[j]))) j += 1;
      const word = sql.slice(i, j);
      if (KEYWORDS.has(word.toLowerCase())) {
        flush();
        push('keyword', word);
      } else {
        plain += word;
      }
      i = j;
      continue;
    }

    plain += ch;
    i += 1;
  }
  flush();
  return tokens;
}
