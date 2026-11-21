'use client';

// The document-level bar: where this document lives, its title, whether it is saved, and the things you do with the whole document
// (ask AI, share, export, print). Formatting belongs to the toolbar below it, not here.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useT } from '../../../i18n';
import { FavouriteStar } from '../../favourites';
import { Popover } from '../library-ui';
import { EditorIcon } from './editor-icons';

export type SaveStatus = 'saving' | 'saved' | 'unsaved' | 'failed' | 'offline';
type Props = {
  title: string; onTitle: (title: string) => void; readOnly: boolean; where: string; documentId: string | undefined; status: SaveStatus; message: string;
  onRetry: () => void; local: boolean; aiReady: boolean; onAi: () => void; onShare: () => void; exporting: 'pdf' | 'docx' | null; onExport: (format: 'pdf' | 'docx') => void;
  onPrint: () => void; onSaveNow: () => void; dirty: boolean; panelOpen: boolean; onPanel: (open: boolean) => void; onHistory: () => void; onComments: () => void;
};

export function DocumentHeader(props: Props) {
  const t = useT();
  const { status, local } = props;
  const label = status === 'saving' ? t('ed.saving') : status === 'unsaved' ? t('ed.unsaved') : status === 'failed' ? t('ed.tb.saveFailed') : status === 'offline' ? t('ed.tb.savedOffline') : props.message || t('ed.allSaved');
  const menu = (close: () => void): ReactNode => <>
    <button type="button" role="menuitem" disabled={!props.dirty || props.readOnly} onClick={() => { close(); props.onSaveNow(); }}><EditorIcon name="download" size={16} />{t('ed.saveNow')}</button>
    <button type="button" role="menuitem" onClick={() => { close(); props.onPrint(); }}><EditorIcon name="print" size={16} />{t('ed.tb.print')}</button>
    {!local && <button type="button" role="menuitem" onClick={() => { close(); props.onComments(); }}><EditorIcon name="comment" size={16} />{t('ed.tab.comments')}</button>}
    {!local && <button type="button" role="menuitem" onClick={() => { close(); props.onHistory(); }}><EditorIcon name="undo" size={16} />{t('ed.tab.history')}</button>}
    <button type="button" role="menuitem" onClick={() => { close(); props.onPanel(!props.panelOpen); }}><EditorIcon name="panel" size={16} />{props.panelOpen ? t('ed.tb.hidePanel') : t('ed.tb.showPanel')}</button>
  </>;
  return <header className="dh">
    <button type="button" className={`rd-iconbtn dh-panel${props.panelOpen ? ' is-on' : ''}`} aria-pressed={props.panelOpen} title={props.panelOpen ? t('ed.tb.hidePanel') : t('ed.tb.showPanel')} aria-label={props.panelOpen ? t('ed.tb.hidePanel') : t('ed.tb.showPanel')} onClick={() => props.onPanel(!props.panelOpen)}><EditorIcon name="panel" size={20} /></button>
    <Link className="dh-back" href="/workspace/documents" title={t('ed.allDocuments')} aria-label={t('ed.allDocuments')}><EditorIcon name="back" size={18} /><span>{t('ed.crumbDocuments')}</span></Link>
    <div className="dh-title">
      <input value={props.title} readOnly={props.readOnly} maxLength={200} onChange={(event) => props.onTitle(event.target.value)} placeholder={t('ed.titlePh')} aria-label={t('ed.tb.documentTitle')} />
      <small>{props.where}</small>
    </div>
    <span className={`dh-status dh-status--${status}`} role="status" aria-live="polite"><i aria-hidden="true" />{label}{status === 'failed' && <button type="button" onClick={props.onRetry}>{t('ed.retry')}</button>}</span>
    <div className="dh-actions">
      <FavouriteStar kind="DOCUMENT" entityId={props.documentId} />
      {props.aiReady && <button type="button" className="rd-btn rd-btn--soft rd-btn--small dh-ai" onClick={props.onAi}>{t('ed.ai')}</button>}
      {!local && <button type="button" className="rd-btn rd-btn--soft rd-btn--small" onClick={props.onShare}><EditorIcon name="share" size={16} />{t('sh.title')}</button>}
      {!local && <Popover label={t('ed.export')} buttonClass="rd-btn rd-btn--soft rd-btn--small" buttonContent={<><EditorIcon name="download" size={16} />{props.exporting ? t('ed.exporting') : t('ed.export')}<EditorIcon name="chevron" size={14} /></>} className="dl-menu" disabled={props.exporting !== null}>{(close) => <>
        <button type="button" role="menuitem" onClick={() => { close(); props.onExport('pdf'); }}>{t('ed.exportPdf')}</button>
        <button type="button" role="menuitem" onClick={() => { close(); props.onExport('docx'); }}>{t('ed.exportWord')}</button></>}</Popover>}
      <Popover label={t('ed.tb.moreActions')} buttonClass="rd-iconbtn" buttonLabel={t('ed.tb.moreActions')} buttonContent={<EditorIcon name="more" size={20} />} className="dl-menu">{menu}</Popover>
    </div>
  </header>;
}
