import { InboxWorkspace } from '../workspace-productivity';
import Link from 'next/link';

export default function InboxPage() {
  return <><div className="task-labels-callout"><span>Need a label-based view?</span><Link href="/workspace/labels">Browse task labels →</Link></div><InboxWorkspace /></>;
}
