import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RecordPager } from '../app/workspace/database-pager';
import { MyTaskBoard } from '../app/workspace/workspace-productivity';
import { TaskSummaryCard } from '../app/workspace/tasks/[taskId]/components/task-summary';
import { TaskEditPanel } from '../app/workspace/tasks/[taskId]/components/task-edit-panel';
import type { TaskSummary } from '../app/workspace/tasks/[taskId]/types';
import { accessibilityProblems } from './axe';

describe('RecordPager with a single page', () => {
  it('shows only the count: no disabled previous/next buttons and no page-size picker for a handful of records', () => {
    render(<RecordPager mode="pages" page={1} pageSize={50} state={{ total: 3, loading: false, loaded: 3, error: '', capped: false }} onPage={vi.fn()} onPageSize={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe('Showing 1–3 of 3');
    expect(screen.queryByRole('button', { name: 'Previous page' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Per page' })).toBeNull();
  });

  it('keeps the page-size picker when there are more records than the smallest page', () => {
    render(<RecordPager mode="pages" page={1} pageSize={50} state={{ total: 40, loading: false, loaded: 40, error: '', capped: false }} onPage={vi.fn()} onPageSize={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Per page' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
  });
});

const task = (id: string, status: string, extra: Record<string, unknown> = {}) => ({ id, title: `Task ${id}`, status, priority: 'HIGH', labels: [], dueAt: null, project: null, events: [], ...extra });

describe('MyTaskBoard', () => {
  it('puts tasks in status columns with counts, and is accessible', async () => {
    const { container } = render(<MyTaskBoard tasks={[task('a', 'TODO'), task('b', 'TODO'), task('c', 'IN_REVIEW', { project: { id: 'p', name: 'Launch' } })]} savingId={null} onStatus={vi.fn()} />);
    const todo = screen.getByRole('region', { name: /To do/ });
    expect(within(todo).getAllByRole('link').map((link) => link.textContent)).toEqual(['Task a', 'Task b']);
    expect(within(screen.getByRole('region', { name: /In review/ })).getByRole('link', { name: 'Launch' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: /In progress/ })).getByText('Nothing here. Drag a task in or change its status.')).toBeTruthy();
    expect(await accessibilityProblems(container)).toEqual([]);
  });

  it('moves a card with its status menu, so keyboard and touch users do not need drag and drop', async () => {
    const user = userEvent.setup(); const onStatus = vi.fn();
    render(<MyTaskBoard tasks={[task('a', 'TODO')]} savingId={null} onStatus={onStatus} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status for Task a' }), 'IN_PROGRESS');
    expect(onStatus).toHaveBeenCalledWith('a', 'IN_PROGRESS');
  });

  it('locks a card’s status menu while that card is saving', () => {
    render(<MyTaskBoard tasks={[task('a', 'TODO'), task('b', 'TODO')]} savingId="a" onStatus={vi.fn()} />);
    expect((screen.getByRole('combobox', { name: 'Status for Task a' }) as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole('combobox', { name: 'Status for Task b' }) as HTMLSelectElement).disabled).toBe(false);
  });
});

const summary: TaskSummary = { id: 't1', title: 'Write the brief', description: 'First draft', status: 'TODO', priority: 'MEDIUM', labels: ['docs'], startAt: null, dueAt: null, project: null, assignee: null } as unknown as TaskSummary;
const members = [{ userId: 'u1', displayName: 'Mayu Aoki', role: 'MEMBER' }, { userId: 'u2', displayName: 'Riku Nakamura', role: 'MANAGER' }];

describe('Task page: assignee in the side panel', () => {
  it('assigns and unassigns straight from the picker', async () => {
    const user = userEvent.setup(); const onUpdate = vi.fn();
    const { rerender } = render(<TaskSummaryCard task={summary} members={members} busy={false} onUpdate={onUpdate} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Assignee' }), 'u2');
    expect(onUpdate).toHaveBeenLastCalledWith({ assigneeId: 'u2' });
    rerender(<TaskSummaryCard task={{ ...summary, assignee: { id: 'u2', displayName: 'Riku Nakamura' } }} members={members} busy={false} onUpdate={onUpdate} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Assignee' }), '');
    expect(onUpdate).toHaveBeenLastCalledWith({ assigneeId: null });
  });
});

describe('Task page: title and description edited in place', () => {
  it('opens from one button, saves only title and description, and Escape cancels', async () => {
    const user = userEvent.setup(); const onSave = vi.fn();
    render(<TaskEditPanel task={summary} busy={false} onSave={onSave} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    const title = screen.getByRole('textbox', { name: 'Task title' });
    expect(document.activeElement).toBe(title);
    await user.clear(title); await user.type(title, 'Write the final brief');
    await user.click(screen.getByRole('button', { name: 'Save task details' }));
    expect(onSave).toHaveBeenCalledWith({ title: 'Write the final brief', description: 'First draft' });
    expect(screen.queryByRole('textbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('refuses an empty title with a message instead of saving', async () => {
    const user = userEvent.setup(); const onSave = vi.fn();
    render(<TaskEditPanel task={summary} busy={false} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    const title = screen.getByRole('textbox', { name: 'Task title' });
    await user.clear(title); await user.type(title, '   ');
    await user.click(screen.getByRole('button', { name: 'Save task details' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
