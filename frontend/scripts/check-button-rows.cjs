#!/usr/bin/env node
/**
 * Buttons in one group must share one size.
 *
 * `.btn` and `.btn-sm` differ in padding (10px vs 6px) *and* line height (`--text-md--line` vs
 * `--text-sm--line`). Under `align-items: center` the boxes centre on each other but their edges
 * land at different heights, so two buttons that belong on one line read as two rows — which is
 * exactly the bug this check exists for (the Playground's SQL toggle beside Save to a story).
 *
 * **Only sizing is checked.** An earlier version also flagged "a group of controls whose parent is
 * not a flex row". It could not be made reliable: `page-header`, `TableRowActions` and a dozen
 * component-level wrappers are flex by construction in sheets the check cannot associate with the
 * JSX, and `{cond ? (<>A</>) : (<>B</>)}` reports alternatives as siblings. It produced ~80%
 * false positives, and a check people learn to ignore is worse than no check.
 *
 * Size, by contrast, is stated in the JSX itself: no cross-file inference, no guessing.
 *
 * Baseline: `button-row-baseline.txt`, one `file | kind` per line. It records existing debt; shrink
 * it rather than growing it. `--all` prints every finding, baseline included.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const BASELINE = path.join(__dirname, 'button-row-baseline.txt');

/** Size classes that change a button's box. Two different ones in one group is the bug. */
const SIZE_CLASSES = ['btn-sm', 'btn-lg'];

function walkDir(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, out);
    else if (entry.name.endsWith('.tsx') && !/\.test\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** The static text of a className attribute, or null when it cannot be read statically. */
function classText(node) {
  if (!ts.isJsxAttribute(node) || node.name.getText() !== 'className') return null;
  const init = node.initializer;
  if (!init) return null;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression) {
    const parts = [];
    const visit = (n) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) parts.push(n.text);
      else if (ts.isTemplateExpression(n)) {
        parts.push(n.head.text);
        for (const span of n.templateSpans) {
          if (ts.isStringLiteral(span.literal)) parts.push(span.literal.text);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(init.expression);
    return parts.join(' ');
  }
  return null;
}

function classesOf(opening) {
  for (const attr of opening.attributes.properties) {
    const text = classText(attr);
    if (text !== null) return text;
  }
  return '';
}

/** The size a class list selects, or null when the element is not a sized control. */
function sizeOf(classes) {
  for (const size of SIZE_CLASSES) {
    if (new RegExp(`\\b${size}\\b`).test(classes)) return size;
  }
  if (/\bbtn\b/.test(classes)) return 'btn';
  return null;
}

/**
 * Whether a tag name reads as a control at the call site.
 *
 * A `*Button` is always a control. A `*Dialog` is ambiguous: some render a trigger button (and a
 * dialog only when opened), others render a whole dialog. Its size is resolved from its definition
 * instead of its name — see `componentSizes`.
 */
function isControl(name) {
  return name === 'button' || /Button$/.test(name) || /Dialog$/.test(name);
}

/**
 * Size of each locally-defined component whose **root** renders one sized control.
 *
 * `SaveFindingDialog` returns a trigger `<button className="… btn-sm">` (plus a dialog it opens), so
 * a caller writing `<SaveFindingDialog/>` beside a plain `.btn` reproduces the very bug this check
 * exists for — with no className at the call site. A component whose root is, say, a `<div>` that
 * merely contains buttons is a container, not a control, and is not recorded.
 */
function collectComponentSizes() {
  const sizes = new Map();
  for (const file of walkDir(SRC)) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node) => {
      if (
        (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) &&
        node.name &&
        ts.isIdentifier(node.name)
      ) {
        const root = rootElementOf(node);
        if (root && tagName(root) === 'button') {
          const size = sizeOf(classesOf(root));
          if (size) sizes.set(node.name.text, size);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return sizes;
}

/** The element a component's returned JSX starts with, unwrapping parens, fragments, ternaries. */
function rootElementOf(fn) {
  let found = null;

  const firstElementOf = (e) => {
    if (!e) return;
    if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e)) {
      found = ts.isJsxElement(e) ? e.openingElement : e;
      return;
    }
    if (ts.isParenthesizedExpression(e)) return firstElementOf(e.expression);
    if (ts.isJsxFragment(e)) {
      for (const child of e.children) {
        if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
          found = ts.isJsxElement(child) ? child.openingElement : child;
          return;
        }
      }
      return;
    }
    if (ts.isConditionalExpression(e)) {
      firstElementOf(e.whenTrue);
      if (!found) firstElementOf(e.whenFalse);
    }
  };

  const visit = (n) => {
    if (found) return;
    if (ts.isReturnStatement(n) && n.expression) firstElementOf(n.expression);
    ts.forEachChild(n, visit);
  };
  visit(fn);
  return found;
}

function tagName(opening) {
  const tag = opening.tagName;
  return ts.isIdentifier(tag) ? tag.text : tag.getText();
}

/** Whether an expression contains a control anywhere inside it. */
function containsControl(expr) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isJsxElement(n)) {
      if (isControl(tagName(n.openingElement))) found = true;
      return;
    }
    if (ts.isJsxSelfClosingElement(n)) {
      if (isControl(tagName(n))) found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(expr);
  return found;
}

/**
 * Whether this element holds a ternary whose branches *both* contain a control.
 *
 * `{editing ? <Save/> <Cancel/> : <Edit/>}` is a choice, not a row: counting both branches reports
 * controls that never render together.
 */
function hasExclusiveBranches(node) {
  for (const child of node.children) {
    if (!ts.isJsxExpression(child) || !child.expression) continue;
    const expr = child.expression;
    if (!ts.isConditionalExpression(expr)) continue;
    if (containsControl(expr.whenTrue) && containsControl(expr.whenFalse)) return true;
  }
  return false;
}

const findings = [];
/** Filled before the scan: component name → the button size it renders. */
let componentSizes = new Map();

function checkFile(file) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const rel = path.relative(ROOT, file);

  const visit = (node) => {
    if (ts.isJsxElement(node)) {
      if (!hasExclusiveBranches(node)) {
        // Direct children that are controls. A control wrapped in `{ok && <FooButton/>}` still
        // counts as a direct child; anything inside a nested element belongs to that element.
        const expanded = [];
        for (const child of node.children) {
          if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
            expanded.push(child);
          } else if (ts.isJsxExpression(child) && child.expression) {
            const collect = (n) => {
              if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
                expanded.push(n);
                return;
              }
              // Only unwrap expressions and fragments — never descend into element children.
              if (ts.isParenthesizedExpression(n) || ts.isConditionalExpression(n) ||
                  ts.isBinaryExpression(n) || ts.isJsxFragment(n)) {
                ts.forEachChild(n, collect);
              }
            };
            collect(child.expression);
          }
        }

        const sizes = new Set();
        for (const child of expanded) {
          const opening = ts.isJsxElement(child) ? child.openingElement : child;
          const name = tagName(opening);
          if (!isControl(name)) continue;
          // A component's size lives in its own definition; the call site has no className.
          const size = sizeOf(classesOf(opening)) ?? componentSizes.get(name);
          if (size) sizes.add(size);
        }

        if (sizes.size > 1) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          findings.push(
            `${rel}:${line + 1}: buttons in one group mix sizes ` +
              `(${[...sizes].sort().join(', ')})`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
}

componentSizes = collectComponentSizes();
for (const file of walkDir(SRC)) checkFile(file);
const baseline = new Set(
  fs.existsSync(BASELINE)
    ? fs
        .readFileSync(BASELINE, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
    : [],
);

/** Baselines key on `file`, not line: a line shifts with every edit above it. */
const key = (line) => line.slice(0, line.indexOf(':'));

const fresh = findings.filter((line) => !baseline.has(key(line)));
const stale = [...baseline].filter((entry) => !findings.some((line) => key(line) === entry));

if (process.argv.includes('--all')) {
  for (const line of findings) {
    console.log(`${baseline.has(key(line)) ? '[baseline] ' : '[new]      '}${line}`);
  }
  console.log(`\n${findings.length} finding(s), ${baseline.size} file(s) in baseline.`);
  process.exit(0);
}

for (const line of fresh) console.log(line);
if (stale.length) {
  console.error(
    'check-shared-styles: baseline lists files with no findings left — remove these lines:',
  );
  for (const line of stale) console.error(`  ${line}`);
}
if (fresh.length || stale.length) {
  console.error(
    `check-shared-styles: ${fresh.length} new mixed-size group(s) — see docs/design-system.md`,
  );
  process.exit(1);
}
console.log('check-shared-styles: button sizes OK');
