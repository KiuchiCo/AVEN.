'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useT } from '../../i18n';
import type { Key } from '../../i18n/en';
import { Avatar, Pill } from '../ui';
import { Icon } from '../home-icons';
import { percent, type Project, type ProjectStatus } from './project-model';

export const statusKey: Record<string, Key> = { PLANNING: 'pj.s.planning', IN_PROGRESS: 'pj.s.inProgress', ON_HOLD: 'pj.s.onHold', COMPLETED: 'pj.s.completed', ARCHIVED: 'pj.s.archived', TODO: 'status.todo', IN_REVIEW: 'status.inReview', CANCELLED: 'status.cancelled' };
export const taskStatusKey: Record<string, Key> = { TODO: 'status.todo', IN_PROGRESS: 'status.inProgress', IN_REVIEW: 'status.inReview', COMPLETED: 'status.completed', CANCELLED: 'status.cancelled' };
export const priorityKey: Record<string, Key> = { LOW: 'prio.low', MEDIUM: 'prio.medium', HIGH: 'prio.high', URGENT: 'prio.urgent' };
export const roleKey: Record<string, Key> = { OWNER: 'role.owner', ADMINISTRATOR: 'role.administrator', MANAGER: 'role.manager', MEMBER: 'role.member', GUEST: 'role.guest' };
const tones: Record<string, 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'bronze'> = { PLANNING: 'violet', IN_PROGRESS: 'blue', ON_HOLD: 'amber', COMPLETED: 'green', ARCHIVED: 'neutral' };
const priorityTones: Record<string, 'neutral' | 'amber' | 'red' | 'bronze'> = { LOW: 'neutral', MEDIUM: 'bronze', HIGH: 'amber', URGENT: 'red' };

export const capitalise = (value: string) => value.replace(/^./, (character) => character.toLocaleUpperCase());
export const formatDate = (value: string | null | undefined, fallback: string) => (value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : fallback);
export const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 });

export function StatusPill({ status }: { status: string }) {
  const t = useT();
  return <Pill tone={tones[status] ?? 'neutral'}>{t(statusKey[status] ?? 'pj.s.planning')}</Pill>;
}
export function PriorityPill({ priority }: { priority: string }) {
  const t = useT();
  return <Pill tone={priorityTones[priority] ?? 'neutral'}>{capitalise(t(priorityKey[priority] ?? 'prio.medium'))}</Pill>;
}

/** The single progress bar every project screen uses. */
export function ProgressBar({ value, label, tone }: { value: number; label: string; tone?: 'warn' }) {
  const clamped = Math.max(0, Math.min(100, value));
  return <span className={`pw-progress${tone ? ` pw-progress--${tone}` : ''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped}><i style={{ width: `${clamped}%` }} /></span>;
}

/** A page-level message. Errors interrupt screen readers, confirmations do not. */
export function Notice({ kind, children, onClose }: { kind: 'error' | 'success'; children: ReactNode; onClose?: () => void }) {
  const t = useT();
  return <p className={`pw-notice pw-notice--${kind}`} role={kind === 'error' ? 'alert' : 'status'}><span>{children}</span>{onClose && <button type="button" className="pw-notice__close" aria-label={t('blk.close')} onClick={onClose}><Icon name="close" size={14} /></button>}</p>;
}

export function Field({ label, hint, children, wide }: { label: ReactNode; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return <label className={`pw-field${wide ? ' pw-field--wide' : ''}`}><span className="pw-field__label">{label}{hint && <small>{hint}</small>}</span>{children}</label>;
}

/** Skeleton shown while a screen's data loads, so the page keeps its shape. */
export function LoadingBlock({ rows = 3, label }: { rows?: number; label: string }) {
  return <div className="pw-loading" role="status" aria-label={label}>{Array.from({ length: rows }, (_, index) => <span key={index} />)}</div>;
}

/** A dialog on desktop and a full-width sheet on phones. Escape and the backdrop close it, and focus returns to what opened it. */
export function Modal({ title, onClose, children, footer, size = 'md', description }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg'; description?: ReactNode }) {
  const t = useT();
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea, button');
    first?.focus();
    const scroll = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = scroll; opener?.focus?.(); };
  }, []);
  function keys(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
    if (event.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])')].filter((node) => node.offsetParent !== null);
    if (!items.length) return;
    const [start, end] = [items[0], items[items.length - 1]];
    if (event.shiftKey && document.activeElement === start) { event.preventDefault(); end.focus(); } else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); start.focus(); }
  }
  return <div className="pw-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={keys}>
    <div ref={panel} className={`pw-modal__panel pw-modal__panel--${size}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={description ? `${id}-d` : undefined}>
      <header><div><h2 id={`${id}-t`}>{title}</h2>{description && <p id={`${id}-d`}>{description}</p>}</div><button type="button" className="rd-iconbtn" aria-label={t('blk.close')} onClick={onClose}><Icon name="close" size={18} /></button></header>
      <div className="pw-modal__body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </div>
  </div>;
}

/** Asks before something that cannot be undone. `confirmText` makes the person type a word first. */
export function ConfirmDialog({ title, children, confirmLabel, busy, danger = true, confirmText, onConfirm, onClose }: { title: ReactNode; children: ReactNode; confirmLabel: string; busy?: boolean; danger?: boolean; confirmText?: string; onConfirm: () => void; onClose: () => void }) {
  const t = useT();
  const [typed, setTyped] = useState('');
  const ready = !confirmText || typed.trim() === confirmText;
  function submit(event: FormEvent) { event.preventDefault(); if (ready && !busy) onConfirm(); }
  return <Modal title={title} size="sm" onClose={onClose}>
    <form className="pw-form" onSubmit={submit}>
      <div className="pw-confirm__text">{children}</div>
      {confirmText && <Field label={t('pw.typeToConfirm', { text: confirmText })}><input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" data-autofocus /></Field>}
      <div className="pw-actions"><button type="button" className="rd-btn rd-btn--soft" onClick={onClose}>{t('msg.cancel')}</button><button type="submit" className={`rd-btn${danger ? ' pw-btn--danger' : ''}`} disabled={!ready || busy}>{busy ? t('set.saving') : confirmLabel}</button></div>
    </form>
  </Modal>;
}

/** One project in the directory: everything a person needs to decide whether to open it. */
export function ProjectCard({ project }: { project: Project }) {
  const t = useT();
  const progress = percent(project.completedCount, project.taskCount);
  const overdue = project.dueAt && project.status !== 'COMPLETED' && project.status !== 'ARCHIVED' && project.dueAt.slice(0, 10) < new Date().toISOString().slice(0, 10);
  return <Link className="pw-card" href={`/workspace/projects/${project.id}`}>
    <span className="pw-card__top"><StatusPill status={project.status as ProjectStatus} /><span className="pw-card__updated">{t('pw.updated', { date: formatDate(project.updatedAt, '') })}</span></span>
    <strong className="pw-card__name">{project.name}</strong>
    <span className="pw-card__desc">{project.description || t('pj.defaultDesc')}</span>
    <span className="pw-card__progress"><ProgressBar value={progress} label={t('pw.progressOf', { name: project.name })} /><b>{progress}%</b></span>
    <span className="pw-card__meta">
      <span><Icon name="checkCircle" size={15} />{t('pw.tasksDone', { done: project.completedCount, total: project.taskCount })}</span>
      <span className={overdue ? 'is-overdue' : ''}><Icon name="calendar" size={15} />{project.dueAt ? formatDate(project.dueAt, '') : t('pj.noDate')}</span>
    </span>
    <span className="pw-card__owner"><Avatar name={project.owner.displayName} size={24} /><span>{project.owner.displayName}</span></span>
  </Link>;
}

export function PersonChip({ name }: { name: string | null | undefined }) {
  const t = useT();
  return name ? <span className="pw-person"><Avatar name={name} size={22} /><span>{name}</span></span> : <span className="pw-person pw-person--none">{t('pj.unassigned')}</span>;
}
