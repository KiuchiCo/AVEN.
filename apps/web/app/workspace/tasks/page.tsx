'use client';

import Link from 'next/link';
import { useT } from '../../i18n';
import { MyTasksWorkspace } from '../workspace-productivity';

export default function TasksPage() {
  const t = useT();
  return <><div className="task-labels-callout"><span>{t('tasks.callout')}</span><Link href="/workspace/labels">{t('labels.browse')}</Link></div><MyTasksWorkspace /></>;
}
