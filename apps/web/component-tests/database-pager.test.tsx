import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RecordPager, type PagingState } from '../app/workspace/database-pager';
import { accessibilityProblems } from './axe';

const state = (overrides: Partial<PagingState> = {}): PagingState => ({ total: 3000, loading: false, loaded: 50, error: '', capped: false, ...overrides });
const handlers = () => ({ onPage: vi.fn(), onPageSize: vi.fn(), onRetry: vi.fn() });

describe('RecordPager (pages)', () => {
  it('says which records are shown, how many there are and which page this is, and is accessible', async () => {
    const { container } = render(<RecordPager mode="pages" page={2} pageSize={50} state={state()} {...handlers()} />);
    expect(screen.getByRole('navigation', { name: 'Records pages' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Showing 51–100 of 3,000');
    expect(screen.getByText('Page 2 of 60')).toBeTruthy();
    expect(await accessibilityProblems(container)).toEqual([]);
  });

  it('moves between pages, disables the ends, and changes the page size', async () => {
    const user = userEvent.setup(); const h = handlers();
    const { rerender } = render(<RecordPager mode="pages" page={1} pageSize={50} state={state()} {...h} />);
    expect((screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Next page' })); expect(h.onPage).toHaveBeenCalledWith(2);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Per page' }), '200'); expect(h.onPageSize).toHaveBeenCalledWith(200);
    rerender(<RecordPager mode="pages" page={60} pageSize={50} state={state()} {...h} />);
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Showing 2,951–3,000 of 3,000');
  });

  it('shows loading, an empty result and an error with a retry, without offering to move while loading', async () => {
    const user = userEvent.setup(); const h = handlers();
    const { rerender } = render(<RecordPager mode="pages" page={1} pageSize={50} state={state({ loading: true })} {...h} />);
    expect(screen.getByRole('status').textContent).toBe('Loading records…'); expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<RecordPager mode="pages" page={1} pageSize={50} state={state({ total: 0 })} {...h} />);
    expect(screen.getByRole('status').textContent).toBe('No records to show');
    rerender(<RecordPager mode="pages" page={1} pageSize={50} state={state({ error: 'boom' })} {...h} />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load records.');
    await user.click(screen.getByRole('button', { name: 'Try again' })); expect(h.onRetry).toHaveBeenCalled();
  });
});

describe('RecordPager (layouts that need every record)', () => {
  it('shows progress while loading, and the plain total when done', () => {
    const { rerender } = render(<RecordPager mode="all" page={1} pageSize={500} state={state({ loading: true, loaded: 1500, total: 3000 })} {...handlers()} />);
    expect(screen.getByRole('status').textContent).toBe('Loading 1,500 of 3,000 records…');
    rerender(<RecordPager mode="all" page={1} pageSize={500} state={state({ loaded: 3000, total: 3000 })} {...handlers()} />);
    expect(screen.getByText('3,000 records')).toBeTruthy();
  });

  it('never hides the rest silently: past the limit it says how many are shown and where to find the others', () => {
    render(<RecordPager mode="all" page={1} pageSize={500} state={state({ total: 50_000, loaded: 10_000, capped: true })} {...handlers()} />);
    expect(screen.getByRole('status').textContent).toContain('first 10,000 of 50,000 records');
    expect(screen.getByRole('status').textContent).toContain('Table');
  });
});
