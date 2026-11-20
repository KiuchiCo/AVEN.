'use client';

import { Fragment, type ReactNode } from 'react';
import { useT } from '../../../i18n';
import { Icon } from '../../home-icons';
import type { Key } from '../../../i18n/en';
import { filterSlash, parseInline, type BlockType, type Mark } from './editor-model';

/** Shows a block's text with its inline marks applied. Everything is rendered as React nodes, never as HTML. */
export function RichText({ text }: { text: string }) {
  return <>{parseInline(text).map((run, index) => {
    const key = `${index}-${run.kind}`;
    if (run.kind === 'bold') return <strong key={key}>{run.text}</strong>;
    if (run.kind === 'italic') return <em key={key}>{run.text}</em>;
    if (run.kind === 'strike') return <s key={key}>{run.text}</s>;
    if (run.kind === 'code') return <code key={key}>{run.text}</code>;
    if (run.kind === 'link') return <a key={key} href={run.href} target="_blank" rel="noopener noreferrer">{run.text}</a>;
    return <Fragment key={key}>{run.text}</Fragment>;
  })}</>;
}

/** The "/" menu: block types matching what was typed. Arrow keys, Enter and Esc are handled by the editor; this only draws it. */
export function SlashMenu({ query, index, onPick, onHover }: { query: string; index: number; onPick: (type: BlockType) => void; onHover: (index: number) => void }) {
  const t = useT();
  const items = filterSlash(query, (type) => t(`bt.${type}` as Key));
  return <div className="document-slash rd-menu__list" role="listbox" aria-label={t('ed.slashLabel')} onMouseDown={(event) => event.preventDefault()}>
    {items.length === 0 ? <p className="document-slash__empty">{t('ed.slashEmpty')}</p> : items.map((item, position) => <button type="button" role="option" aria-selected={position === index} className={position === index ? 'is-active' : ''} key={item.type} onMouseEnter={() => onHover(position)} onClick={() => onPick(item.type)}>{t(`bt.${item.type}` as Key)}</button>)}
  </div>;
}
export const slashCount = (query: string, label: (type: BlockType) => string) => filterSlash(query, label).length;

/** Appears above a block while text is selected. Uses the same small buttons as the block controls. */
export function FormatBar({ onMark, onLink }: { onMark: (mark: Mark) => void; onLink: () => void }) {
  const t = useT();
  const items: { label: ReactNode; title: Key; run: () => void }[] = [
    { label: <b>B</b>, title: 'ed.fmt.bold', run: () => onMark('bold') },
    { label: <i>I</i>, title: 'ed.fmt.italic', run: () => onMark('italic') },
    { label: <s>S</s>, title: 'ed.fmt.strike', run: () => onMark('strike') },
    { label: <code>{'</>'}</code>, title: 'ed.fmt.code', run: () => onMark('code') },
    { label: <Icon name="link" size={14} />, title: 'ed.fmt.link', run: onLink },
  ];
  return <div className="document-formatbar" role="toolbar" aria-label={t('ed.fmt.label')} onMouseDown={(event) => event.preventDefault()}>
    {items.map((item) => <button type="button" key={item.title} title={t(item.title)} aria-label={t(item.title)} onClick={item.run}>{item.label}</button>)}
  </div>;
}
