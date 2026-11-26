'use client';

import { useId, type ReactNode } from 'react';
import { Icon, type IconName } from './home-icons';

export type { IconName };

/** The page title block every screen opens with: a small caps line, the serif title and one sentence. An icon tile may sit beside the title. */
export function PageHeader({ eyebrow, title, description, icon, children }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; icon?: IconName; children?: ReactNode }) {
  return <header className={`rd-header${icon ? ' rd-header--icon' : ''}`}>
    {icon && <span className="rd-tile rd-tile--large" aria-hidden="true"><Icon name={icon} size={30} /></span>}
    <div className="rd-header__text">{eyebrow && <p className="workspace-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="rd-header__description">{description}</p>}</div>
    {children && <div className="rd-header__actions">{children}</div>}
  </header>;
}

/** A figure with an icon, a large serif number and what it counts. `delta` shows a small trend pill (up is good unless `bad`). */
export function StatCard({ icon, value, label, tone = 'bronze', delta, bad, aside }: { icon: IconName; value: ReactNode; label: ReactNode; tone?: 'bronze' | 'green' | 'violet' | 'blue' | 'red'; delta?: ReactNode; bad?: boolean; aside?: ReactNode }) {
  return <div className={`rd-stat rd-stat--${tone}`}>
    <span className="rd-tile" aria-hidden="true"><Icon name={icon} size={24} /></span>
    <div><strong>{value}</strong><span>{label}</span></div>
    {aside}
    {delta !== undefined && <em className={`rd-delta${bad ? ' rd-delta--bad' : ''}`}>{delta}</em>}
  </div>;
}

export function StatRow({ children, columns = 4, label }: { children: ReactNode; columns?: number; label?: string }) {
  return <div className="rd-stats" style={{ ['--rd-cols' as string]: columns }} role="group" aria-label={label}>{children}</div>;
}

/** A row of pill buttons that switch what is shown below (or filter it). */
export function PillTabs<T extends string>({ items, value, onChange, label, size }: { items: { key: T; label: ReactNode; icon?: IconName; count?: number }[]; value: T; onChange: (key: T) => void; label: string; size?: 'small' }) {
  return <div className={`rd-tabs${size === 'small' ? ' rd-tabs--small' : ''}`} role="group" aria-label={label}>
    {items.map((item) => <button type="button" key={item.key} aria-pressed={value === item.key} className={value === item.key ? 'is-active' : ''} onClick={() => onChange(item.key)}>
      {item.icon && <Icon name={item.icon} size={18} />}<span>{item.label}</span>{item.count !== undefined && <small>{item.count}</small>}
    </button>)}
  </div>;
}

/** A soft white panel with an optional icon tile, small caps line, serif heading and actions at the right. */
export function Panel({ icon, eyebrow, title, subtitle, actions, children, className = '', id }: { icon?: IconName; eyebrow?: ReactNode; title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  const autoId = useId();
  const titleId = `${id ?? autoId}-title`;
  return <section className={`rd-panel ${className}`} aria-labelledby={title ? titleId : undefined}>
    {(title || actions) && <header className="rd-panel__head">
      {icon && <span className="rd-tile" aria-hidden="true"><Icon name={icon} size={24} /></span>}
      <div className="rd-panel__titles">{eyebrow && <p className="workspace-eyebrow">{eyebrow}</p>}{title && <h2 id={titleId}>{title}</h2>}{subtitle && <p>{subtitle}</p>}</div>
      {actions && <div className="rd-panel__actions">{actions}</div>}
    </header>}
    {children}
  </section>;
}

const arts: Record<string, ReactNode> = {
  tag: <><path d="M26 74V44a6 6 0 0 1 6-6h30l32 32a6 6 0 0 1 0 8.5L77 95a6 6 0 0 1-8.5 0z" fill="var(--m-tile)" stroke="var(--m-focus)" strokeWidth="2.5" /><circle cx="42" cy="53" r="5" fill="var(--m-card-solid)" stroke="var(--m-focus)" strokeWidth="2.5" /><path d="M86 22l6 6M98 34l8 3M78 16l2 8" stroke="var(--m-focus)" strokeWidth="2.5" strokeLinecap="round" /><rect x="52" y="64" width="38" height="38" rx="8" fill="var(--m-track)" opacity=".7" /></>,
  envelope: <><rect x="24" y="48" width="72" height="50" rx="8" fill="var(--m-tile)" stroke="var(--m-focus)" strokeWidth="2.5" /><path d="m26 52 34 26 34-26" fill="none" stroke="var(--m-focus)" strokeWidth="2.5" strokeLinejoin="round" /><path d="M56 22l-2 10M72 24l5 8M88 32l8 5" stroke="var(--m-focus)" strokeWidth="2.5" strokeLinecap="round" /></>,
  stack: <><path d="m60 22 38 20-38 20-38-20z" fill="var(--m-tile)" stroke="var(--m-focus)" strokeWidth="2.5" strokeLinejoin="round" /><path d="m22 58 38 20 38-20M22 74l38 20 38-20" fill="none" stroke="var(--m-focus)" strokeWidth="2.5" strokeLinejoin="round" /></>,
  check: <><rect x="28" y="28" width="64" height="64" rx="14" fill="var(--m-tile)" stroke="var(--m-focus)" strokeWidth="2.5" /><path d="m44 62 12 12 22-26" fill="none" stroke="var(--m-focus)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></>,
  search: <><circle cx="54" cy="54" r="26" fill="var(--m-tile)" stroke="var(--m-focus)" strokeWidth="2.5" /><path d="m74 74 22 22" stroke="var(--m-focus)" strokeWidth="3" strokeLinecap="round" /></>,
  chat: <><path d="M24 34a8 8 0 0 1 8-8h56a8 8 0 0 1 8 8v36a8 8 0 0 1-8 8H56L38 94V78h-6a8 8 0 0 1-8-8z" fill="var(--m-tile)" stroke="var(--m-focus)" strokeWidth="2.5" strokeLinejoin="round" /><path d="M40 46h40M40 58h26" stroke="var(--m-focus)" strokeWidth="2.5" strokeLinecap="round" /></>,
  folder: <><path d="M20 40a8 8 0 0 1 8-8h22l8 10h34a8 8 0 0 1 8 8v36a8 8 0 0 1-8 8H28a8 8 0 0 1-8-8z" fill="var(--m-tile)" stroke="var(--m-focus)" strokeWidth="2.5" strokeLinejoin="round" /></>,
};

/** Friendly empty state: a small line illustration, a serif heading, one sentence and (optionally) actions. */
export function EmptyState({ art = 'stack', title, text, children, compact }: { art?: keyof typeof arts; title: ReactNode; text?: ReactNode; children?: ReactNode; compact?: boolean }) {
  return <div className={`rd-empty${compact ? ' rd-empty--compact' : ''}`}>
    <svg aria-hidden="true" viewBox="0 0 120 120" width={compact ? 64 : 110} height={compact ? 64 : 110}>{arts[art]}</svg>
    <h3>{title}</h3>{text && <p>{text}</p>}{children && <div className="rd-empty__actions">{children}</div>}
  </div>;
}

/** A small coloured pill, for statuses, priorities and counts. */
export function Pill({ tone = 'neutral', children }: { tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'bronze'; children: ReactNode }) {
  return <span className={`rd-pill rd-pill--${tone}`}>{children}</span>;
}

const avatarTones = ['#e8c9a8', '#d8b9b5', '#cdd6c4', '#c9d4e6', '#e0cfa6', '#d6c7e0'];
/** A round initials badge; the tone comes from the name so a person keeps their colour everywhere. */
export function Avatar({ name, size = 36, online }: { name: string; size?: number; online?: boolean }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase() ?? '').join('') || '?';
  const tone = avatarTones[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % avatarTones.length];
  return <span className="rd-avatar" style={{ width: size, height: size, background: tone, fontSize: Math.round(size * 0.38) }} aria-hidden="true">{initials}{online !== undefined && <i className={online ? 'is-on' : ''} />}</span>;
}
