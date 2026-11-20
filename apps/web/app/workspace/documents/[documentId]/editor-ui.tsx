'use client';

import { Fragment, useState, type ReactNode } from 'react';
import { useT } from '../../../i18n';
import { Icon } from '../../home-icons';
import type { Key } from '../../../i18n/en';
import { filterSlash, parseInline, type Mark } from './editor-model';
import { BlockIcon } from '../../block-icons';
import { readRecent } from './recent-blocks';
import { catalogCategories, type CatalogEntry } from './block-catalog';

/** Shows a block's text with its inline marks applied. Everything is rendered as React nodes, never as HTML. */
export function RichText({ text }: { text: string }) {
  return <>{parseInline(text).map((run, index) => {
    const key = `${index}-${run.kind}`;
    if (run.kind === 'bold') return <strong key={key}>{run.text}</strong>;
    if (run.kind === 'italic') return <em key={key}>{run.text}</em>;
    if (run.kind === 'strike') return <s key={key}>{run.text}</s>;
    if (run.kind === 'underline') return <u key={key}>{run.text}</u>;
    if (run.kind === 'highlight') return <mark key={key}>{run.text}</mark>;
    if (run.kind === 'code') return <code key={key}>{run.text}</code>;
    if (run.kind === 'link') return <a key={key} href={run.href} target="_blank" rel="noopener noreferrer">{run.text}</a>;
    return <Fragment key={key}>{run.text}</Fragment>;
  })}</>;
}

const nameOf = (id: string) => `blk.${id}` as Key;

/** The "/" menu: blocks matching what was typed, each with its icon, name and a short description. The editor handles the keys; this only draws it. */
export function SlashMenu({ query, index, onPick, onHover }: { query: string; index: number; onPick: (entry: CatalogEntry) => void; onHover: (index: number) => void }) {
  const t = useT();
  const items = filterSlash(query, (item) => t(nameOf(item.id)), readRecent());
  return <div className="document-slash rd-menu__list" role="listbox" aria-label={t('ed.slashLabel')} onMouseDown={(event) => event.preventDefault()}>
    {items.length === 0 ? <p className="document-slash__empty">{t('ed.slashEmpty')}</p> : items.map((item, position) => <button type="button" role="option" aria-selected={position === index} className={position === index ? 'is-active' : ''} key={item.id} ref={(node) => { if (node && position === index) node.scrollIntoView({ block: 'nearest' }); }} onMouseEnter={() => onHover(position)} onClick={() => onPick(item)}>
      <BlockIcon id={item.id} size={20} /><span><strong>{t(nameOf(item.id))}</strong><small>{t(`${nameOf(item.id)}.d` as Key)}</small></span>
    </button>)}
  </div>;
}
export const slashCount = (query: string, label: (item: CatalogEntry) => string) => filterSlash(query, label).length;

/** The visual block browser: every block in the catalogue as an icon tile, grouped like the slash menu. */
export function BlockBrowser({ onPick, onClose }: { onPick: (entry: CatalogEntry) => void; onClose: () => void }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const entries = filterSlash(query, (item) => t(nameOf(item.id)));
  return <div className="document-browser" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <div className="document-browser__panel" role="dialog" aria-modal="true" aria-label={t('blk.browserTitle')}>
      <header><h2>{t('blk.browserTitle')}</h2><button type="button" className="rd-iconbtn" aria-label={t('blk.close')} onClick={onClose}><Icon name="close" size={18} /></button></header>
      <input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('blk.search')} aria-label={t('blk.search')} />
      <div className="document-browser__scroll">
        {entries.length === 0 && <p className="document-slash__empty">{t('ed.slashEmpty')}</p>}
        {catalogCategories.map((category) => { const group = entries.filter((entry) => entry.category === category); return group.length ? <section key={category}><h3>{t(`blk.cat.${category}` as Key)}</h3><div className="document-browser__grid">{group.map((entry) => <button type="button" key={entry.id} onClick={() => onPick(entry)} title={t(`${nameOf(entry.id)}.d` as Key)}><BlockIcon id={entry.id} size={22} /><span>{t(nameOf(entry.id))}</span></button>)}</div></section> : null; })}
      </div>
    </div>
  </div>;
}

/** Appears above a block while text is selected. Uses the same small buttons as the block controls. */
export function FormatBar({ onMark, onLink, onAi }: { onMark: (mark: Mark) => void; onLink: () => void; onAi?: () => void }) {
  const t = useT();
  const items: { label: ReactNode; title: Key; run: () => void }[] = [
    { label: <b>B</b>, title: 'ed.fmt.bold', run: () => onMark('bold') },
    { label: <i>I</i>, title: 'ed.fmt.italic', run: () => onMark('italic') },
    { label: <s>S</s>, title: 'ed.fmt.strike', run: () => onMark('strike') },
    { label: <u>U</u>, title: 'ed.fmt.underline', run: () => onMark('underline') },
    { label: <mark>H</mark>, title: 'ed.fmt.highlight', run: () => onMark('highlight') },
    { label: <code>{'</>'}</code>, title: 'ed.fmt.code', run: () => onMark('code') },
    { label: <Icon name="link" size={14} />, title: 'ed.fmt.link', run: onLink },
  ];
  return <div className="document-formatbar" role="toolbar" aria-label={t('ed.fmt.label')} onMouseDown={(event) => event.preventDefault()}>
    {items.map((item) => <button type="button" key={item.title} title={t(item.title)} aria-label={t(item.title)} onClick={item.run}>{item.label}</button>)}
    {onAi && <button type="button" className="document-formatbar__ai" onClick={onAi}>{t('ed.ai')}</button>}
  </div>;
}
