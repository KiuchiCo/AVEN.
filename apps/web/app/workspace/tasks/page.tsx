import Link from 'next/link';

export default function TasksPage() {
  return (
    <div className="workspace-section-page">
      <p className="workspace-eyebrow">YOUR WORKSPACE</p>
      <h1>My Tasks</h1>
      <p className="workspace-section-page__description">Create tasks, set priorities, and move work through a simple board.</p>
      <section className="workspace-section-empty">
        <span className="workspace-section-empty__icon" aria-hidden="true">☑</span>
        <h2>Tasks live alongside your projects.</h2>
        <p>Open your projects board to create workspace tasks, attach them to a project, and update their status. Your changes are saved to AVEN.</p>
        <Link href="/workspace/projects">Open the projects board <span aria-hidden="true">→</span></Link>
      </section>
    </div>
  );
}
