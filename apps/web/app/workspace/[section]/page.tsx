import Link from 'next/link';
import { notFound } from 'next/navigation';

const sections: Record<string, { title: string; description: string; next: string }> = {
  inbox: { title: 'Inbox', description: 'A place for updates and things that need your attention.', next: 'Notifications will appear here when inbox workflows are connected.' },
  activity: { title: 'Activity', description: 'See the changes happening across your workspace.', next: 'Workspace activity will appear when product updates are available.' },
};

export default async function WorkspaceSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const content = sections[section];
  if (!content) notFound();

  return (
    <div className="workspace-section-page">
      <p className="workspace-eyebrow">My workspace</p>
      <h1>{content.title}</h1>
      <p className="workspace-section-page__description">{content.description}</p>
      <section className="workspace-section-empty">
        <span className="workspace-section-empty__icon" aria-hidden="true">◇</span>
        <h2>This section is ready for its next step.</h2>
        <p>{content.next}</p>
        <Link href="/workspace">Back to your workspace <span aria-hidden="true">→</span></Link>
      </section>
    </div>
  );
}
