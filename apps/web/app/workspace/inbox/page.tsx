'use client';

import Link from 'next/link';
import { useT } from '../../i18n';
import { InboxWorkspace } from '../workspace-productivity';

export default function InboxPage() {
  const t = useT();
  return <><div className="task-labels-callout"><span>{t('inbox.callout')}</span><Link href="/workspace/labels">{t('labels.browse')}</Link></div><InboxWorkspace /></>;
}
