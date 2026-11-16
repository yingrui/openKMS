/**
 * The list skeleton's contract: title and actions in the page header, the tab strip under it, one toolbar
 * row, then the body. Every Catalog list relies on this order — it is what makes them look alike.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListPage } from './ListPage';

describe('ListPage', () => {
  it('puts the header, tabs, toolbar and body in one order', () => {
    const { container } = render(
      <ListPage
        title="列表标题"
        subtitle="列表说明"
        actions={<button type="button">新建</button>}
        tabs={<nav aria-label="app tabs">tabs</nav>}
        toolbar={<input aria-label="搜索" />}
      >
        <table />
      </ListPage>,
    );

    const shell = container.querySelector('.ds-page');
    expect(shell).not.toBeNull();
    const order = Array.from(shell!.children).map(
      (child) => child.className.split(' ')[0] || child.tagName.toLowerCase(),
    );
    expect(order).toEqual(['page-header', 'nav', 'ds-list-page__body']);

    expect(screen.getByRole('heading', { name: '列表标题' })).toBeTruthy();
    expect(screen.getByText('列表说明')).toBeTruthy();
    const header = container.querySelector('.page-header')!;
    expect(header.querySelector('.page-header-actions')?.textContent).toBe('新建');
    expect(container.querySelector('.ds-list-page__body .ds-list-toolbar')).not.toBeNull();
    expect(container.querySelector('.ds-list-page__body table')).not.toBeNull();
  });

  it('omits the toolbar row when there is none', () => {
    const { container } = render(
      <ListPage title="只有表格">
        <table />
      </ListPage>,
    );
    expect(container.querySelector('.ds-list-toolbar')).toBeNull();
  });
});
