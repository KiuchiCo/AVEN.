import Link from 'next/link';
import { notFound } from 'next/navigation';

const sections: Record<string, { title: string; description: string; next: string }> = {
  inbox: { title: 'Inbox', description: 'A place for updates and things that need your attention.', next: 'Notifications will appear here when inbox workflows are connected.' },
  tasks: { title: 'My Tasks', description: 'A clear view of the work you want to move forward.', next: 'Task creation and tracking are part of the next productivity build step.' },
  projects: { title: 'Projects', description: 'Bring plans, people, and progress together.', next: 'Project creation and task boards are coming in the next productivity build step.' },
  documents: { title: 'Documents', description: 'Keep plans, notes, and decisions in one calm place.', next: 'Document editing will be connected after the project and task foundation.' },
  calendar: { title: 'Calendar', description: 'See your work and life on one schedule.', next: 'Calendar events will be connected after projects and tasks.' },
  databases: { title: 'Databases', description: 'Organise structured information your way.', next: 'Database views will arrive after the first connected records are available.' },
  intelligence: { title: 'AVEN Intelligence', description: 'Plan, analyse, and move work forward with context.', next: 'Intelligence will be connected only after AVEN has real workspace content to work with.' },
  activity: { title: 'Activity', description: 'See the changes happening across your workspace.', next: 'Workspace activity will appear when product updates are available.' },
};

export default async function WorkspaceSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const content = sections[section];
  if (!content) notFound();

  return (
    <div className="workspace-section-page">
      <p className="workspace-eyebrow">MY WORKSPACE</p>
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
