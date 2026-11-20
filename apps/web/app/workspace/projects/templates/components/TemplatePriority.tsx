'use client';

import { useT } from '../../../../i18n';
import type { Key } from '../../../../i18n/en';

const keys: Record<string, Key> = { LOW: 'prio.low', MEDIUM: 'prio.medium', HIGH: 'prio.high', URGENT: 'prio.urgent' };
export function TemplatePriority({ value }: { value: string }) { const t = useT(); return <span className={`project-template-priority project-template-priority--${value.toLowerCase()}`}>{keys[value] ? t(keys[value]).replace(/^./, (c) => c.toLocaleUpperCase()) : value}</span>; }
