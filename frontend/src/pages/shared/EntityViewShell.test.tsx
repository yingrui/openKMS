import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { EntityViewHeader, EntityViewLoading, EntityViewPanel, EntityViewShell } from './EntityViewShell';

/**
 * The shell is shared chrome, so its contract is worth pinning: what a nav item does with `to`, what
 * it does with `sectionId` (a story's own table of contents), and that a panel can be an anchor
 * target.
 */
const renderShell = (navItems: Parameters<typeof EntityViewShell>[0]['navItems']) =>
  render(
    <MemoryRouter>
      <EntityViewShell
        backTo="/data-insights"
        backLabel="All stories"
        title="估值体检"
        meta="一个问题"
        navItems={navItems}
      >
        <EntityViewPanel id="finding-0" title="按月">
          body
        </EntityViewPanel>
      </EntityViewShell>
    </MemoryRouter>,
  );

describe('EntityViewShell', () => {

  it('navigates with a route item, and scrolls with a section item', () => {
    renderShell([
      { to: '/data-model/m1', label: 'Fields' },
      { sectionId: 'finding-0', label: '按月', hint: 'Daily basic' },
    ]);
    expect(screen.getByRole('link', { name: 'Fields' })).toHaveAttribute('href', '/data-model/m1');
    const section = screen.getByRole('link', { name: /按月/ });
    expect(section).toHaveAttribute('href', '#finding-0');
    expect(screen.getByText('Daily basic')).toBeInTheDocument();
  });

  it('scrolls the pane, and never the document, when a section item is clicked', () => {
    /* Two failures in a row on this link, so both halves are pinned.
       First it scrolled nothing (the scrolling box is the pane). Then it used `scrollIntoView`, which
       scrolls *every* scrollable ancestor — `body { overflow: hidden }` does not stop a programmatic
       scroll, so the document moved, the pinned shell was pushed out of the viewport, and the top of the
       page could not be reached again. jsdom has no layout, so the assertion is on *what* was asked to
       move. */
    const intoView: string[] = [];
    const scrolled: string[] = [];
    const originalIntoView = Element.prototype.scrollIntoView;
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    Element.prototype.scrollIntoView = function scrollIntoViewStub() {
      intoView.push(this.id);
    };
    HTMLElement.prototype.scrollTo = function scrollToStub(this: HTMLElement) {
      scrolled.push(this.className);
    } as typeof HTMLElement.prototype.scrollTo;
    try {
      renderShell([{ sectionId: 'finding-0', label: '按月' }]);
      fireEvent.click(screen.getByRole('link', { name: /按月/ }));
      expect(scrolled).toEqual(['entity-view__main']);
      expect(intoView).toEqual([]);
      expect(document.documentElement.scrollTop).toBe(0);
    } finally {
      Element.prototype.scrollIntoView = originalIntoView;
      HTMLElement.prototype.scrollTo = originalScrollTo;
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
    expect(container.querySelector('#finding-0')).not.toBeNull();
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

describe('EntityViewShell — the rail follows the reader', () => {
  /** jsdom has no IntersectionObserver and no layout: a stub reports every section as being read. */
  function stubObserver() {
    const original = window.IntersectionObserver;
    class ObserverStub {
      private readonly callback: (entries: unknown[]) => void;
      constructor(callback: (entries: unknown[]) => void) {
        this.callback = callback;
      }
      observe(element: Element) {
        this.callback([{ target: element, isIntersecting: true }]);
      }
      disconnect() {}
      unobserve() {}
    }
    window.IntersectionObserver = ObserverStub as unknown as typeof IntersectionObserver;
    return () => {
      window.IntersectionObserver = original;
    };
  }

  it('marks the section the reader is in, and announces it', async () => {
    const restore = stubObserver();
    try {
      renderShell([{ sectionId: 'finding-0', label: '按月' }]);
      const item = screen.getByRole('link', { name: /按月/ });
      // At the top of the page the header is what is being read, so nothing is highlighted yet.
      expect(item.className).not.toContain('entity-view__nav-item--active');

      const pane = document.querySelector('.entity-view__main') as HTMLElement;
      pane.scrollTop = 120;
      fireEvent.scroll(pane);
      await waitFor(() => expect(item.className).toContain('entity-view__nav-item--active'));
      expect(item).toHaveAttribute('aria-current', 'true');
    } finally {
      restore();
    }
  });
});
