/**
 * Display formatting for the SQL the server actually ran.
 *
 * The Playground shows that statement as evidence: a reviewer reads it to confirm the resource's
 * row restriction is really in place, and the clause they look for is the injected
 * `EXISTS (SELECT 1 FROM … WHERE …)`. On one unbroken line that clause is hard to find.
 *
 * `sql-formatter` does the layout. Two hand-written line breakers came before this and both were
 * wrong in ways that only show up on real statements — `INNER JOIN` split down the middle,
 * `EXISTS (SELECT …)` torn across lines, a `:param` placeholder broken into `: pc0_0`. A parser
 * that already knows PostgreSQL's grammar is the honest choice for a thing whose output is read as
 * evidence.
 *
 * Formatting is display-only: the string sent to the server and stored in the audit row is
 * untouched.
 */
import { format as formatWithLib } from 'sql-formatter';

/**
 * Format one statement for display.
 *
 * Returns the input unchanged when it is empty, or when the formatter cannot handle it — a
 * statement nobody can parse is still worth showing as the server sent it, and a display bug must
 * never look like a query problem.
 */
export function formatSql(sql: string): string {
  const text = (sql ?? '').trim();
  if (!text) return text;
  try {
    return formatWithLib(text, {
      language: 'postgresql',
      // Named placeholders (`:pc0_0`) are how the data layer parameterizes a policy. Telling the
      // formatter about them keeps them intact instead of treating `:` as a cast operator.
      paramTypes: { named: [':'] },
      keywordCase: 'upper',
      tabWidth: 2,
      linesBetweenQueries: 1,
    });
  } catch {
    return text;
  }
}

/**
 * Whether a statement is long enough that formatting helps. A one-clause statement reads better on
 * one line than broken across three.
 */
export function shouldFormat(sql: string): boolean {
  const text = (sql ?? '').trim();
  if (text.length < 80) return false;
  const upper = text.toUpperCase();
  const clauses = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'JOIN', 'LIMIT'];
  return clauses.filter((clause) => upper.includes(clause)).length >= 3;
}
