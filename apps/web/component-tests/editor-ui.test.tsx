import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BlockBrowser, FormatBar, RichText, SlashMenu } from '../app/workspace/documents/[documentId]/editor-ui';
import { accessibilityProblems } from './axe';

describe('SlashMenu', () => {
  const props = { query: '', index: 0, category: null, onCategory: () => undefined, onPick: () => undefined, onHover: () => undefined };

  it('is a labelled listbox of blocks, each with a name and a description, and marks the active one', async () => {
    const { container } = render(<SlashMenu {...props} index={1} />);
    const list = screen.getByRole('listbox'); const options = within(list).getAllByRole('option');
    expect(options.length).toBeGreaterThan(10);
    expect(options[1].getAttribute('aria-selected')).toBe('true'); expect(options[0].getAttribute('aria-selected')).toBe('false');
    expect(await accessibilityProblems(container)).toEqual([]);
  });

  it('narrows to what was typed, and shows an empty state when nothing matches', () => {
    const { rerender } = render(<SlashMenu {...props} query="heading" />);
    const names = screen.getAllByRole('option').map((option) => option.textContent ?? '');
    expect(names.length).toBeGreaterThan(0); expect(names.every((name) => /head/i.test(name))).toBe(true);
    rerender(<SlashMenu {...props} query="zzzzqqqq" />);
    expect(screen.queryAllByRole('option')).toHaveLength(0); expect(screen.getByText(/no/i)).toBeTruthy();
  });

  it('picks a block on click, reports hover, and filters by category with pressed buttons', async () => {
    const user = userEvent.setup(); const onPick = vi.fn(); const onHover = vi.fn(); const onCategory = vi.fn();
    render(<SlashMenu {...props} onPick={onPick} onHover={onHover} onCategory={onCategory} />);
    const first = screen.getAllByRole('option')[2];
    await user.hover(first); expect(onHover).toHaveBeenCalledWith(2);
    await user.click(first); expect(onPick).toHaveBeenCalledTimes(1);
    const chips = within(screen.getByRole('group')).getAllByRole('button');
    expect(chips[0].getAttribute('aria-pressed')).toBe('true'); await user.click(chips[1]); expect(onCategory).toHaveBeenCalled();
  });
});

describe('BlockBrowser', () => {
  it('is a modal dialog with a search field that filters the tiles, and Escape closes it', async () => {
    const user = userEvent.setup(); const onClose = vi.fn(); const onPick = vi.fn();
    const { container } = render(<BlockBrowser onPick={onPick} onClose={onClose} />);
    const dialog = screen.getByRole('dialog'); expect(dialog.getAttribute('aria-modal')).toBe('true');
    const search = screen.getByRole('searchbox'); expect(document.activeElement).toBe(search);
    const before = within(dialog).getAllByRole('button').length;
    await user.type(search, 'table');
    const after = within(dialog).getAllByRole('button').length;
    expect(after).toBeLessThan(before);
    await user.click(within(dialog).getAllByRole('button').find((button) => /table/i.test(button.textContent ?? '') && !/close/i.test(button.getAttribute('aria-label') ?? ''))!);
    expect(onPick).toHaveBeenCalled();
    expect(await accessibilityProblems(container)).toEqual([]);
    await user.keyboard('{Escape}'); expect(onClose).toHaveBeenCalled();
  });

  it('says so when the search matches nothing', async () => {
    const user = userEvent.setup();
    render(<BlockBrowser onPick={() => undefined} onClose={() => undefined} />);
    await user.type(screen.getByRole('searchbox'), 'zzzzqqqq');
    expect(screen.getByText(/no/i)).toBeTruthy();
  });
});

describe('FormatBar', () => {
  it('is a toolbar of named buttons that apply a mark, and does not steal focus from the text', async () => {
    const user = userEvent.setup(); const onMark = vi.fn(); const onLink = vi.fn(); const onAi = vi.fn();
    const { container } = render(<FormatBar onMark={onMark} onLink={onLink} onAi={onAi} />);
    const bar = screen.getByRole('toolbar');
    const buttons = within(bar).getAllByRole('button');
    expect(buttons.every((button) => (button.getAttribute('aria-label') ?? button.textContent ?? '').trim().length > 0)).toBe(true);
    await user.click(within(bar).getByRole('button', { name: /bold/i })); expect(onMark).toHaveBeenCalledWith('bold');
    await user.click(within(bar).getByRole('button', { name: /link/i })); expect(onLink).toHaveBeenCalled();
    expect(await accessibilityProblems(container)).toEqual([]);
  });

  it('opens a colour palette, applies a colour, and can clear it', async () => {
    const user = userEvent.setup(); const onColour = vi.fn();
    render(<FormatBar onMark={() => undefined} onLink={() => undefined} onColour={onColour} />);
    const toggle = screen.getByRole('button', { name: /colour|color/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false'); await user.click(toggle); expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const palette = screen.getByRole('group', { name: /colour|color/i });
    await user.click(within(palette).getAllByRole('button')[0]); expect(onColour).toHaveBeenCalledWith(expect.any(String));
    await user.click(toggle); await user.click(within(screen.getByRole('group', { name: /colour|color/i })).getAllByRole('button').at(-1)!); expect(onColour).toHaveBeenLastCalledWith(null);
  });
});

describe('RichText', () => {
  it('shows combined formatting as real elements', () => {
    const { container } = render(<p><RichText text="plain **bold** and {red,size-24:big red} and `code`" /></p>);
    expect(container.querySelector('strong')?.textContent).toBe('bold'); expect(container.querySelector('code')?.textContent).toBe('code');
    const span = container.querySelector('span.md-c-red') as HTMLElement; expect(span.textContent).toBe('big red'); expect(span.style.fontSize).toBe('24px');
  });

  it('security: hostile text is shown as text, never run, and unsafe links are not links', () => {
    const { container } = render(<p><RichText text={'<img src=x onerror="window.__x=1"> <script>window.__x=1</script> [bad](javascript:alert(1)) [ok](https://example.com)'} /></p>);
    expect(container.querySelector('img')).toBeNull(); expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>');
    const links = [...container.querySelectorAll('a')];
    expect(links).toHaveLength(1); expect(links[0].getAttribute('href')).toBe('https://example.com');
    expect(links.every((link) => !/^javascript:/i.test(link.getAttribute('href') ?? ''))).toBe(true);
    expect(links[0].getAttribute('rel')).toContain('noopener');
    expect((window as unknown as { __x?: number }).__x).toBeUndefined();
  });
});
