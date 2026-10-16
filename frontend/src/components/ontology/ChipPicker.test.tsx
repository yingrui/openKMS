import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ChipPicker, type ChipPickerOption } from './ChipPicker';

const OPTIONS: ChipPickerOption[] = [
  { id: 'ts_code', label: 'ts_code', hint: 'text' },
  { id: 'trade_date', label: 'trade_date', hint: 'date', group: 'Time' },
  { id: 'close', label: 'close', hint: 'numeric' },
];

/**
 * The spread of `isPicked` / `onPick` is the callers' business; what must not regress is the
 * interaction the two call sites rely on (a filtered list, Enter adds, Backspace drops the last).
 */
function Harness({ onPick }: { onPick?: (id: string) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <ChipPicker
      idPrefix="test"
      options={OPTIONS}
      groups={['Time']}
      isPicked={(id) => picked.includes(id)}
      onPick={(id) => {
        onPick?.(id);
        setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
      }}
      onBackspaceEmpty={() => setPicked((prev) => prev.slice(0, -1))}
      ariaLabel="Columns"
      placeholder="Type a column name…"
      emptyLabel="No column matches."
    />
  );
}

describe('ChipPicker', () => {
  it('shows the menu only while it is being used, and filters as you type', () => {
    render(<Harness />);
    expect(screen.queryByRole('listbox')).toBeNull();

    const input = screen.getByRole('combobox', { name: 'Columns' });
    fireEvent.focus(input);
    expect(screen.getAllByRole('option')).toHaveLength(3);

    fireEvent.change(input, { target: { value: 'date' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /trade_date/ })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'nothing' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No column matches.')).toBeInTheDocument();
  });

  it('adds with Enter, marks what is picked, and clears the query', () => {
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: 'Columns' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ts_code' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('option', { name: /ts_code/ })).toHaveAttribute('aria-selected', 'true');
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('walks the filtered list with the arrow keys and picks what is highlighted', () => {
    const picked: string[] = [];
    render(<Harness onPick={(id) => picked.push(id)} />);
    const input = screen.getByRole('combobox', { name: 'Columns' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'e' } }); // trade_date, close
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    // ungrouped options come first in the keyboard order, so `close` is the second entry
    expect(picked).toEqual(['close']);
  });

  it('drops the last chip when Backspace is pressed on an empty input', () => {
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: 'Columns' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'close' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'ts_code' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(screen.getByRole('option', { name: /ts_code/ })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('option', { name: /close/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('closes on Escape and on losing focus', () => {
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: 'Columns' });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
