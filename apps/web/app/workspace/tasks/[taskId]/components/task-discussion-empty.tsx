export function TaskDiscussionEmpty({ title, detail }: { title: string; detail: string }) {
  return <div className="task-collab__empty"><strong>{title}</strong><p>{detail}</p></div>;
}
