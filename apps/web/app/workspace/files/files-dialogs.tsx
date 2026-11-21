'use client';

import { useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import { Icon } from '../home-icons';
import { messageOf } from '../projects/project-api';
import { Modal } from '../projects/project-ui';

/** Choose where a file goes, from the places the listing offers (top level, the parent folder, or a subfolder). Same look as the Documents picker. */
export function MoveTargetDialog({ title, targets, onMove, onClose }: { title: string; targets: { id: string; name: string }[]; onMove: (folderId: string | null) => Promise<void>; onClose: () => void }) {
  const t = useT();
  const [target, setTarget] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (target === undefined) return;
    setBusy(true); setProblem('');
    try { await onMove(target === '' ? null : target); onClose(); } catch (reason) { setProblem(messageOf(reason, t('dl.actionFailed'))); setBusy(false); }
  }
  return <Modal title={title} size="sm" onClose={onClose}>
    <form className="pw-form" onSubmit={(event) => void submit(event)}>
      <ul className="dl-picker" role="radiogroup" aria-label={t('dl.chooseFolder')}>{targets.map((option) => <li key={option.id || 'root'}><label className={target === option.id ? 'is-on' : ''} style={{ paddingInlineStart: 12 }}><input type="radio" name="dest" checked={target === option.id} onChange={() => setTarget(option.id)} /><Icon name="folder" size={16} /><span>{option.name}</span></label></li>)}</ul>
      {problem && <p className="pw-notice pw-notice--error" role="alert">{problem}</p>}
      <div className="pw-actions"><button type="button" className="rd-btn rd-btn--soft" onClick={onClose}>{t('msg.cancel')}</button><button type="submit" className="rd-btn" disabled={busy || target === undefined}>{busy ? t('set.saving') : t('dl.move')}</button></div>
    </form>
  </Modal>;
}
