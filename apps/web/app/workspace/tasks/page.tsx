import { MyTasksWorkspace } from '../workspace-productivity';
import Link from 'next/link';

export default function TasksPage() {
  return <><div className="task-labels-callout"><span>Group and find work by label.</span><Link href="/workspace/labels">Browse task labels →</Link></div><MyTasksWorkspace /></>;
}
