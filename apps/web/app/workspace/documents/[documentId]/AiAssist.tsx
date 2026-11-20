'use client';

import { useState } from 'react';
import { useT } from '../../../i18n';
import type { Key } from '../../../i18n/en';

export type AiAction = 'rewrite' | 'grammar' | 'tone' | 'summarize' | 'expand' | 'outline' | 'explain' | 'actions' | 'ask';
export type AiRequest = { action: AiAction; text?: string; tone?: string; question?: string };
/** What the panel is working on: a selection inside one block, or the whole document. */
export type AiTarget = { kind: 'selection'; blockId: string; start: number; end: number; text: string } | { kind: 'document' };

const selectionActions: { action: AiAction; tone?: string; label: Key }[] = [
  { action: 'rewrite', label: 'ed.ai.rewrite' }, { action: 'grammar', label: 'ed.ai.grammar' },
  { action: 'tone', tone: 'professional', label: 'ed.ai.tone.professional' }, { action: 'tone', tone: 'friendly', label: 'ed.ai.tone.friendly' },
  { action: 'tone', tone: 'concise', label: 'ed.ai.tone.concise' }, { action: 'tone', tone: 'confident', label: 'ed.ai.tone.confident' },
  { action: 'summarize', label: 'ed.ai.summarize' }, { action: 'expand', label: 'ed.ai.expand' }, { action: 'explain', label: 'ed.ai.explain' }, { action: 'actions', label: 'ed.ai.actions' },
];

/** The AI panel above the document: pick an action for the selected text, or ask about the whole document, then decide what to do with the answer. */
export function AiPanel({ target, run, onReplace, onInsert, onTasks, onClose }: {
  target: AiTarget; run: (request: AiRequest) => Promise<string>;
  onReplace: (text: string) => void; onInsert: (text: string) => void; onTasks: (titles: string[]) => void; onClose: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; action: AiAction } | null>(null);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  async function go(request: AiRequest) {
    setBusy(true); setError(''); setResult(null);
    try { setResult({ text: await run(request), action: request.action }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('ed.ai.failed')); }
    finally { setBusy(false); }
  }
  const items = result?.action === 'actions' ? result.text.split('\n').map((line) => line.replace(/^[-*]\s+/, '').trim()).filter((line) => line && !/^no action items/i.test(line)) : [];
  return <div className="aven-ai-panel" role="dialog" aria-label={t('ed.ai.title')} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <header><strong>{t('ed.ai.title')}</strong><button type="button" onClick={onClose} aria-label={t('ed.close')}>×</button></header>
    {!result && !busy && target.kind === 'selection' && <div className="aven-ai-panel__actions" role="group">
      <blockquote>{target.text.length > 160 ? `${target.text.slice(0, 160)}…` : target.text}</blockquote>
      {selectionActions.map((item) => <button type="button" key={`${item.action}${item.tone ?? ''}`} onClick={() => void go({ action: item.action, text: target.text, tone: item.tone })}>{t(item.label)}</button>)}
    </div>}
    {!result && !busy && target.kind === 'document' && <form className="aven-ai-panel__ask" onSubmit={(event) => { event.preventDefault(); if (question.trim()) void go({ action: 'ask', question }); }}>
      <input autoFocus value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t('ed.ai.askPh')} aria-label={t('ed.ai.askPh')} maxLength={1000} />
      <button type="submit" disabled={!question.trim()}>{t('ed.ai.ask')}</button>
      <button type="button" onClick={() => void go({ action: 'outline' })}>{t('ed.ai.outline')}</button>
    </form>}
    {busy && <p role="status" className="aven-ai-panel__busy">{t('ed.ai.thinking')}</p>}
    {error && <p role="alert" className="aven-ai-panel__error">{error}</p>}
    {result && <div className="aven-ai-panel__result">
      <div className="aven-ai-panel__text" tabIndex={0}>{result.text}</div>
      <div className="aven-ai-panel__buttons">
        {target.kind === 'selection' && result.action !== 'ask' && <button type="button" onClick={() => { onReplace(result.text); onClose(); }}>{t('ed.ai.replace')}</button>}
        <button type="button" onClick={() => { onInsert(result.text); onClose(); }}>{t('ed.ai.insertBelow')}</button>
        {items.length > 0 && <button type="button" onClick={() => { onTasks(items); onClose(); }}>{t('ed.ai.createTasks')}</button>}
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(result.text); }}>{t('ed.ai.copy')}</button>
        <button type="button" onClick={onClose}>{t('ed.ai.discard')}</button>
      </div>
    </div>}
    {error && <div className="aven-ai-panel__buttons"><button type="button" onClick={() => setError('')}>{t('ed.ai.discard')}</button></div>}
  </div>;
}
