#!/usr/bin/env node
/**
 * Buttons that share a row must share a size, and a group of controls must actually be a row.
 *
 * Two failures that render, lint and typecheck cleanly and only show up as a crooked screenshot:
 *
 * **A. Mixed sizes on one line.** `btn` and `btn-sm` differ in padding *and* line height
 * (10px/20px vs 6px/18px). Inside `align-items: center` their boxes centre on each other, so the
 * top and bottom edges land at different heights — it reads as two rows that were meant to be one.
 *
 * **B. A group of controls with no row container.** Siblings in a plain block stack vertically.
 *
 * This reads the real JSX tree via the TypeScript compiler. A regex over source cannot tell a
 * sibling from an unrelated element twenty lines away, which made the first version of this check
 * report 132 false positives across the app and would have taught everyone to ignore it.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const BASELINE = path.join(__dirname, 'button-row-baseline.txt');

/** Size classes that change a button's box. */
const SIZE_CLASSES = ['btn-sm', 'btn-lg'];

/** A class list that already lays children out in a row. */
const ROW_CLASSES = /^(openkms-flex-row|.*-actions$|.*-toolbar$|.*-controls$)/;

function walkDir(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, out);
    else if (entry.name.endsWith('.tsx') && !/\.test\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** The static text of a className attribute, or null when it is computed. */
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
  const attrs = opening.attributes.properties;
  for (const attr of attrs) {
    const text = classText(attr);
    if (text !== null) return text;
  }
  return '';
}

function sizeOf(classes) {
  for (const size of SIZE_CLASSES) {
    if (new RegExp(`\\b${size}\\b`).test(classes)) return size;
  }
  if (/\bbtn\b/.test(classes)) return 'btn';
  return null;
}

/** Whether a tag name reads as a control to a reviewer. */
function isControl(name) {
  return name === 'button' || /Button$/.test(name) || /Dialog$/.test(name);
}

function tagName(opening) {
  const tag = opening.tagName;
  if (ts.isIdentifier(tag)) return tag.text;
  return tag.getText();
}

const findings = [];
const flexClasses = new Set();

/** Collect every class that declares `display: flex` so a parent class can be recognised. */
function collectFlexClasses() {
  const scssFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.scss')) scssFiles.push(full);
    }
  };
  walk(SRC);
  for (const file of scssFiles) {
    const css = fs.readFileSync(file, 'utf8');
    const re = /\.([a-z][\w-]*)\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
      if (/display:\s*(inline-)?flex/.test(m[2])) flexClasses.add(m[1]);
    }
  }
}

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
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      const container = ts.isJsxElement(node) ? node.openingElement : null;

      // Direct children that are controls. A control nested in a control is that control's child,
      // and one wrapped in a JSX expression (`{ok && <FooButton/>}`) is still a direct child.
      const children = node.children;
      const expanded = [];
      for (const c of children) {
        if (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) {
          expanded.push(c);
        } else if (ts.isJsxExpression(c) && c.expression) {
          const visitExpr = (n) => {
            if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
              expanded.push(n);
              return;
            }
            ts.forEachChild(n, visitExpr);
          };
          visitExpr(c.expression);
        }
      }

      const controls = expanded.filter(
        (c) => ts.isJsxElement(c) && isControl(tagName(c.openingElement)),
      );
      const selfClosing = expanded.filter(
        (c) => ts.isJsxSelfClosingElement(c) && isControl(tagName(c)),
      );
      const all = [...controls, ...selfClosing];

      if (all.length >= 2) {
        const sizes = new Set();
        for (const c of all) {
          const opening = ts.isJsxElement(c) ? c.openingElement : c;
          const size = sizeOf(classesOf(opening));
          if (size) sizes.add(size);
        }
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        const where = `${rel}:${line + 1}`;

        if (sizes.size > 1) {
          findings.push(
            `${where}: buttons on one row mix sizes (${[...sizes].sort().join(', ')}) — ` +
              'pick one size for the group',
          );
        } else if (container) {
          const classes = classesOf(container);
          const row =
            ROW_CLASSES.test(classes) ||
            classes.split(/\s+/).some((token) => flexClasses.has(token));
          if (!row) {
            findings.push(
              `${where}: ${all.length} controls share a parent that is not a flex row — ` +
                'they stack or misalign',
            );
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
}

collectFlexClasses();
for (const file of walkDir(SRC)) checkFile(file);

// Baselines are keyed by `file | kind`, not by line: a line number changes with every unrelated
// edit above it, which would make the baseline fail for reasons nobody can act on.
const baseline = new Set(
  fs.existsSync(BASELINE)
    ? fs
        .readFileSync(BASELINE, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
    : [],
);

const key = (line) => {
  const m = line.match(/^(src\/[^:]+):\d+: (.*)$/);
  if (!m) return line;
  const kind = /mix sizes/.test(m[2]) ? 'mixed-sizes' : 'no-row-container';
  return `${m[1]} | ${kind}`;
};

const fresh = findings.filter((line) => !baseline.has(key(line)));
const stale = [...baseline].filter((entry) => !findings.some((line) => key(line) === entry));

for (const line of fresh) console.log(line);
if (stale.length) {
  console.error(
    'check-shared-styles: baseline lists issues that no longer exist — remove these lines:',
  );
  for (const line of stale) console.error(`  ${line}`);
}
if (fresh.length || stale.length) {
  console.error(
    `check-shared-styles: ${fresh.length} new button-row issue(s) — see docs/design-system.md`,
  );
  process.exit(1);
}
console.log('check-shared-styles: button rows OK');
