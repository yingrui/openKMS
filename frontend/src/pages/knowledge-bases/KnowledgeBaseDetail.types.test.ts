import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TAB_ORDER } from './KnowledgeBaseDetail.types';

/**
 * Every section needs a label in both locales.
 *
 * The rail asks for `` t(`detail.tabs.${tab}`) `` — a built key, which `check-i18n-keys.py` can only
 * check by its prefix (`detail.tabs.` exists). So adding a tab without its word ships the raw key to the
 * reader, silently. This is the half a static prefix check cannot do.
 */
function tabLabels(locale: string): Record<string, string> {
  const raw = readFileSync(
    resolve(process.cwd(), 'src/i18n/locales', locale, 'knowledgeBase.json'),
    'utf-8',
  );
  return (JSON.parse(raw) as { detail: { tabs: Record<string, string> } }).detail.tabs;
}

describe.each(['en', 'zh-CN'])('knowledge base section labels (%s)', (locale) => {
  const labels = tabLabels(locale);

  it('has a word for every tab in TAB_ORDER', () => {
    for (const tab of TAB_ORDER) {
      expect(labels[tab], `${locale}: detail.tabs.${tab}`).toBeTruthy();
    }
  });

  it('has no label for a tab that is not in TAB_ORDER', () => {
    expect(Object.keys(labels).sort()).toEqual([...TAB_ORDER].sort());
  });
});
