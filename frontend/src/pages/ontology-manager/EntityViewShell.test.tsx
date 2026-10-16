import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { EntityViewHeader, EntityViewLoading, EntityViewPanel, EntityViewShell } from './EntityViewShell';

/**
 * The shell is shared chrome, so its contract is worth pinning: what a nav item does with `to`, what
 * it does with `sectionId` (a dashboard's own table of contents), and that a panel can be an anchor
 * target.
 */
describe('EntityViewShell', () => {
  const renderShell = (navItems: Parameters<typeof EntityViewShell>[0]['navItems']) =>
    render(
      <MemoryRouter>
        <EntityViewShell
          backTo="/data-explorer"
          backLabel="All dashboards"
          title="估值体检"
          meta="一个问题"
          navItems={navItems}
        >
          <EntityViewPanel id="report-0" title="按月">
            body
          </EntityViewPanel>
        </EntityViewShell>
      </MemoryRouter>,
    );

  it('navigates with a route item, and scrolls with a section item', () => {
    renderShell([
      { to: '/data-model/m1', label: 'Fields' },
      { sectionId: 'report-0', label: '按月', hint: 'Daily basic' },
    ]);
    expect(screen.getByRole('link', { name: 'Fields' })).toHaveAttribute('href', '/data-model/m1');
    const section = screen.getByRole('link', { name: /按月/ });
    expect(section).toHaveAttribute('href', '#report-0');
    expect(screen.getByText('Daily basic')).toBeInTheDocument();
  });

  it('scrolls the pane when a section item is clicked', () => {
    /* jsdom has no layout and no `scrollIntoView`; stub it and assert the pane was asked to move —
       because the first version of this link looked right and scrolled nothing (the scrolling box is
       the pane, and the report sections had no id to find). */
    const scrolled: string[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoViewStub() {
      scrolled.push(this.id);
    };
    try {
      renderShell([{ sectionId: 'report-0', label: '按月' }]);
      fireEvent.click(screen.getByRole('link', { name: /按月/ }));
      expect(scrolled).toEqual(['report-0']);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('does nothing when the section is not on the page', () => {
    renderShell([{ sectionId: 'gone', label: 'Missing' }]);
    fireEvent.click(screen.getByRole('link', { name: 'Missing' }));
    // no anchor, no throw: the href is still a usable fallback
    expect(screen.getByRole('link', { name: 'Missing' })).toHaveAttribute('href', '#gone');
  });

  it('makes a panel an anchor target, and renders the identity', () => {
    const { container } = renderShell([]);
    expect(container.querySelector('#report-0')).not.toBeNull();
    expect(screen.getByRole('heading', { name: '估值体检' })).toBeInTheDocument();
    expect(screen.getByText('一个问题')).toBeInTheDocument();
  });

  it('renders a header with actions but no title, and a loader', () => {
    render(
      <MemoryRouter>
        <EntityViewHeader title="" actions={<button type="button">Run</button>} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();

    render(<EntityViewLoading label="Loading" />);
    expect(screen.getByText('Loading')).toBeInTheDocument();
  });

  it('leaves the rail without a nav when a page has no sections', () => {
    const { container } = renderShell([]);
    expect(container.querySelector('.entity-view__nav')).toBeNull();
  });
});
