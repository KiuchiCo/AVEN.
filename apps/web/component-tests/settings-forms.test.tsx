import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accessibilityProblems } from './axe';

const project = vi.hoisted(() => ({ request: vi.fn(), reloadMilestones: vi.fn(async () => undefined), say: vi.fn(), setBusy: vi.fn(), busy: false }));
vi.mock('../app/workspace/projects/project-context', () => ({ useProject: () => ({ project: { id: 'p1', name: 'Site' }, ...project }) }));

import { MilestoneDialog } from '../app/workspace/projects/milestones/milestone-dialog';
import { ThemeCard } from '../app/workspace/settings/theme-card';

describe('ThemeCard', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });

  it('is a labelled radio group with one tab stop, and arrow keys move and apply the choice', async () => {
    const user = userEvent.setup();
    const { container } = render(<ThemeCard />);
    const group = screen.getByRole('radiogroup'); const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(radios.map((radio) => radio.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(radios.every((radio) => !(radio as HTMLButtonElement).disabled), 'the chosen one stays focusable').toBe(true);
    await user.tab(); expect(document.activeElement).toBe(radios[0]);
    await user.keyboard('{ArrowRight}');
    expect(radios[1].getAttribute('aria-checked')).toBe('true'); expect(document.activeElement).toBe(radios[1]);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark'); expect(localStorage.getItem('aven-theme')).toBe('dark');
    await user.keyboard('{ArrowLeft}{ArrowLeft}'); expect(radios[2].getAttribute('aria-checked')).toBe('true'); expect(document.documentElement.getAttribute('data-theme')).toBe('system');
    expect(await accessibilityProblems(container)).toEqual([]);
  });

  it('starts from the saved choice and applies a click', async () => {
    localStorage.setItem('aven-theme', 'dark'); const user = userEvent.setup();
    render(<ThemeCard />);
    const radios = screen.getAllByRole('radio'); expect(radios[1].getAttribute('aria-checked')).toBe('true');
    await user.click(radios[0]); expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

describe('MilestoneDialog', () => {
  beforeEach(() => { project.request.mockReset(); project.reloadMilestones.mockClear(); project.say.mockClear(); project.busy = false; });

  it('creates a milestone from the form, then reloads, says so and closes', async () => {
    const user = userEvent.setup(); const onClose = vi.fn(); project.request.mockResolvedValue({});
    const { baseElement } = render(<MilestoneDialog milestone={null} onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(within(dialog).getByLabelText(/name/i));
    expect(await accessibilityProblems(baseElement)).toEqual([]);
    await user.type(within(dialog).getByLabelText(/name/i), '  Beta launch  ');
    await user.type(within(dialog).getByLabelText(/due date/i), '2026-12-01');
    await user.click(within(dialog).getByRole('button', { name: /add milestone/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [path, init] = project.request.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/projects/p1/milestones'); expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ title: 'Beta launch', description: null, dueAt: '2026-12-01' });
    expect(project.reloadMilestones).toHaveBeenCalled(); expect(project.say).toHaveBeenCalled();
  });

  it('requires a name before it will submit, and limits its length', async () => {
    const user = userEvent.setup();
    render(<MilestoneDialog milestone={null} onClose={() => undefined} />);
    const name = screen.getByLabelText(/name/i) as HTMLInputElement;
    expect(name.required).toBe(true); expect(name.maxLength).toBe(160);
    await user.click(screen.getByRole('button', { name: /add milestone/i }));
    expect(project.request).not.toHaveBeenCalled();
  });

  it('edits an existing milestone with PATCH and shows a server refusal as an alert without closing', async () => {
    const user = userEvent.setup(); const onClose = vi.fn(); project.request.mockRejectedValue(new Error('Due date is invalid.'));
    render(<MilestoneDialog milestone={{ id: 'm1', title: 'Old', description: 'About', dueAt: '2026-05-04T00:00:00.000Z' } as never} onClose={onClose} />);
    const name = screen.getByLabelText(/name/i) as HTMLInputElement; expect(name.value).toBe('Old');
    await user.clear(name); await user.type(name, 'New');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect((await screen.findByRole('alert')).textContent).toContain('Due date is invalid.');
    expect((project.request.mock.calls[0] as [string, RequestInit])[1].method).toBe('PATCH');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('disables the save button while a save is in progress', () => {
    project.busy = true;
    render(<MilestoneDialog milestone={null} onClose={() => undefined} />);
    expect((screen.getByRole('button', { name: /saving|add milestone/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
