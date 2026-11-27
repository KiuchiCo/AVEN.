import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageReactions, applyReaction } from '../app/workspace/messages/reactions';
import { accessibilityProblems } from './axe';

const names = new Map([['u1', 'Mayu'], ['u2', 'Riku']]);

describe('applyReaction (the optimistic update)', () => {
  it('adds, keeps one entry per person, removes, and keeps the offered order', () => {
    const one = applyReaction([], '🎉', 'me', true);
    expect(one).toEqual([{ emoji: '🎉', userIds: ['me'] }]);
    expect(applyReaction(one, '🎉', 'me', true)).toEqual(one);
    expect(applyReaction([{ emoji: '🎉', userIds: ['u1'] }], '👍', 'me', true).map((group) => group.emoji)).toEqual(['👍', '🎉']);
    expect(applyReaction(one, '🎉', 'me', false)).toEqual([]);
  });
});

describe('MessageReactions', () => {
  it('names each chip with the reaction, the count and who reacted; yours is pressed; it is accessible', async () => {
    const { container } = render(<MessageReactions reactions={[{ emoji: '👍', userIds: ['u1', 'me'] }]} userId="me" names={names} readOnly={false} onToggle={vi.fn()} />);
    const chip = screen.getByRole('button', { name: 'Thumbs up: 2, from Mayu, you' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(await accessibilityProblems(container)).toEqual([]);
  });

  it('tapping your own reaction takes it back; the picker adds one and closes', async () => {
    const user = userEvent.setup(); const onToggle = vi.fn();
    render(<MessageReactions reactions={[{ emoji: '👍', userIds: ['me'] }]} userId="me" names={names} readOnly={false} onToggle={onToggle} />);
    await user.click(screen.getByRole('button', { name: /^Thumbs up/ }));
    expect(onToggle).toHaveBeenLastCalledWith('👍', false);
    await user.click(screen.getByLabelText('Add a reaction', { selector: 'summary' }));
    await user.click(screen.getByRole('button', { name: 'Celebrate' }));
    expect(onToggle).toHaveBeenLastCalledWith('🎉', true);
    expect(screen.queryByRole('button', { name: 'Celebrate' })).toBeNull();
  });

  it('read-only members see reactions but cannot change them, and see nothing when there are none', () => {
    const { rerender } = render(<MessageReactions reactions={[{ emoji: '❤️', userIds: ['u2'] }]} userId="me" names={names} readOnly onToggle={vi.fn()} />);
    expect((screen.getByRole('button', { name: /^Heart/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText('Add a reaction')).toBeNull();
    rerender(<MessageReactions reactions={[]} userId="me" names={names} readOnly onToggle={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
