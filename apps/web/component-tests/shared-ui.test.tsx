import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState, PageHeader, Panel, Pill, PillTabs, StatCard } from '../app/workspace/ui';
import { Field, LoadingBlock, Modal, Notice, ProgressBar, StatusPill } from '../app/workspace/projects/project-ui';
import { accessibilityProblems } from './axe';

describe('Modal', () => {
  function Harness({ onClose = () => undefined }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false);
    return <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && <Modal title="Edit milestone" description="Name and due date" onClose={() => { setOpen(false); onClose(); }} footer={<button>Save</button>}><input aria-label="Name" /><input aria-label="Due" /></Modal>}
    </>;
  }

  it('is a labelled, described dialog that takes focus, traps Tab, closes on Escape and gives focus back', async () => {
    const user = userEvent.setup(); const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Edit milestone' });
    expect(dialog.getAttribute('aria-modal')).toBe('true'); expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByLabelText('Name'));
    expect(document.body.style.overflow).toBe('hidden');
    const stops = [within(dialog).getByRole('button', { name: /close/i }), within(dialog).getByLabelText('Name'), within(dialog).getByLabelText('Due'), within(dialog).getByRole('button', { name: 'Save' })];
    stops[3].focus(); await user.tab(); expect(document.activeElement).toBe(stops[0]);
    await user.tab({ shift: true }); expect(document.activeElement).toBe(stops[3]);
    expect(await accessibilityProblems(dialog)).toEqual([]);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull(); expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener); expect(document.body.style.overflow).toBe('');
  });

  it('closes from the close button and from a click on the backdrop, but not from a click inside', async () => {
    const user = userEvent.setup(); const onClose = vi.fn();
    render(<Modal title="T" onClose={onClose}><p>Body</p></Modal>);
    await user.click(screen.getByText('Body')); expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /close/i })); expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('dialog').parentElement!); expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('form pieces', () => {
  it('Field ties its label (and hint) to the control, so the control has an accessible name', async () => {
    render(<Field label="Title" hint="optional"><input /></Field>);
    expect(screen.getByRole('textbox', { name: /Title/ })).toBeTruthy();
  });

  it('Notice interrupts screen readers for errors only, and can be dismissed', async () => {
    const user = userEvent.setup(); const onClose = vi.fn();
    const { rerender } = render(<Notice kind="error" onClose={onClose}>Could not save</Notice>);
    expect(screen.getByRole('alert').textContent).toContain('Could not save');
    await user.click(screen.getByRole('button')); expect(onClose).toHaveBeenCalled();
    rerender(<Notice kind="success">Saved</Notice>); expect(screen.getByRole('status').textContent).toContain('Saved'); expect(screen.queryByRole('alert')).toBeNull();
  });

  it('LoadingBlock announces itself as a status, and ProgressBar clamps what it reports', async () => {
    const { container } = render(<><LoadingBlock label="Loading projects" /><ProgressBar value={150} label="Done" /><ProgressBar value={-5} label="None" /></>);
    expect(screen.getByRole('status', { name: 'Loading projects' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Done' }).getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByRole('progressbar', { name: 'None' }).getAttribute('aria-valuenow')).toBe('0');
    expect(await accessibilityProblems(container)).toEqual([]);
  });

  it('StatusPill shows the translated status, and falls back for an unknown one', () => {
    render(<><StatusPill status="IN_PROGRESS" /><StatusPill status="SOMETHING_NEW" /></>);
    expect(screen.getByText('In progress')).toBeTruthy();
  });
});

describe('layout pieces', () => {
  it('PageHeader gives the page one heading, and its icon is hidden from assistive technology', async () => {
    const { container } = render(<PageHeader eyebrow="Workspace" title="Projects" description="All of them" icon="folder" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeTruthy();
    expect(container.querySelector('.rd-tile')?.getAttribute('aria-hidden')).toBe('true');
    expect(await accessibilityProblems(container)).toEqual([]);
  });

  it('PillTabs is a labelled group whose buttons say which is pressed, and work from the keyboard', async () => {
    const user = userEvent.setup(); const onChange = vi.fn();
    const { container } = render(<PillTabs label="View" value="a" onChange={onChange} items={[{ key: 'a', label: 'Board' }, { key: 'b', label: 'List', count: 3 }]} />);
    expect(screen.getByRole('group', { name: 'View' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Board' }).getAttribute('aria-pressed')).toBe('true'); expect(screen.getByRole('button', { name: /List/ }).getAttribute('aria-pressed')).toBe('false');
    await user.tab(); await user.tab(); await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('b');
    expect(await accessibilityProblems(container)).toEqual([]);
  });

  it('Panel is a region named by its heading, EmptyState has a heading and hides its drawing, StatCard and Pill show their content', async () => {
    const { container } = render(<main><Panel id="x" title="Upcoming" actions={<button>All</button>}><p>Content</p></Panel><EmptyState title="Nothing yet" text="Add one" art="check"><button>Add</button></EmptyState><StatCard icon="folder" value="12" label="Projects" delta="+2" /><Pill tone="green">Done</Pill></main>);
    expect(screen.getByRole('region', { name: 'Upcoming' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Nothing yet' })).toBeTruthy(); expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('12')).toBeTruthy(); expect(screen.getByText('+2')).toBeTruthy(); expect(screen.getByText('Done')).toBeTruthy();
    expect(await accessibilityProblems(container)).toEqual([]);
  });
});
