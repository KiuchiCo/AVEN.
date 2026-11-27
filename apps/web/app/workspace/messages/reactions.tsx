'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import type { Key } from '../../i18n/en';
import { Icon } from '../home-icons';

/** The same short list the API accepts (apps/api/src/messaging/message-rules.ts). */
export const reactionEmoji = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🙏', '✅'] as const;
const emojiNames: Record<string, Key> = { '👍': 'msg.r.thumbs', '❤️': 'msg.r.heart', '😂': 'msg.r.laugh', '🎉': 'msg.r.party', '😮': 'msg.r.wow', '😢': 'msg.r.sad', '🙏': 'msg.r.thanks', '✅': 'msg.r.done' };
export type Reaction = { emoji: string; userIds: string[] };

/** The reactions a message would have after one person's change: used for the optimistic update. */
export function applyReaction(reactions: Reaction[], emoji: string, userId: string, active: boolean): Reaction[] {
  const order = reactionEmoji as readonly string[];
  const next = reactions.map((group) => group.emoji !== emoji ? group : { emoji, userIds: active ? (group.userIds.includes(userId) ? group.userIds : [...group.userIds, userId]) : group.userIds.filter((id) => id !== userId) });
  if (active && !next.some((group) => group.emoji === emoji)) next.push({ emoji, userIds: [userId] });
  return next.filter((group) => group.userIds.length > 0).sort((a, b) => order.indexOf(a.emoji) - order.indexOf(b.emoji));
}

/** Chips for the reactions a message has (tap to add or take back yours), and a small picker for a new one. */
export function MessageReactions({ reactions, userId, names, readOnly, onToggle }: { reactions: Reaction[]; userId: string; names: Map<string, string>; readOnly: boolean; onToggle: (emoji: string, active: boolean) => void }) {
  const t = useT();
  const picker = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  // A tap or click anywhere else closes the picker, like any menu.
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!picker.current?.contains(event.target as Node)) picker.current?.removeAttribute('open'); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const who = (ids: string[]) => ids.map((id) => (id === userId ? t('msg.r.you') : names.get(id) ?? t('msg.r.someone'))).join(', ');
  if (readOnly && reactions.length === 0) return null;
  return <div className="msgs-reactions">
    {reactions.map((group) => { const mine = group.userIds.includes(userId); return <button key={group.emoji} type="button" className={`msgs-reaction${mine ? ' is-mine' : ''}`} aria-pressed={mine} disabled={readOnly}
      aria-label={t('msg.r.chip', { name: t(emojiNames[group.emoji] ?? 'msg.r.thumbs'), n: group.userIds.length, who: who(group.userIds) })} title={who(group.userIds)} onClick={() => onToggle(group.emoji, !mine)}>
      <span aria-hidden="true">{group.emoji}</span><span aria-hidden="true">{group.userIds.length}</span></button>; })}
    {!readOnly && <details ref={picker} className="msgs-react-picker" onToggle={(event) => setOpen(event.currentTarget.open)} onKeyDown={(event) => { if (event.key === 'Escape' && picker.current?.open) { event.stopPropagation(); picker.current.removeAttribute('open'); picker.current.querySelector('summary')?.focus(); } }}>
      <summary className="msgs-reaction msgs-reaction--add" aria-label={t('msg.r.add')} title={t('msg.r.add')}><Icon name="smile" size={16} /></summary>
      {open && <div className="msgs-react-picker__panel" role="group" aria-label={t('msg.r.add')}>{reactionEmoji.map((emoji) => { const mine = reactions.some((group) => group.emoji === emoji && group.userIds.includes(userId)); return <button key={emoji} type="button" aria-pressed={mine} aria-label={t(emojiNames[emoji])} title={t(emojiNames[emoji])} onClick={() => { picker.current?.removeAttribute('open'); picker.current?.querySelector('summary')?.focus(); onToggle(emoji, !mine); }}>{emoji}</button>; })}</div>}
    </details>}
  </div>;
}
