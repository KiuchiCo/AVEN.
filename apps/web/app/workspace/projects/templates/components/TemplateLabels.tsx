export function TemplateLabels({ labels }: { labels: string[] }) {
  return labels.length ? <ul className="project-template-labels" aria-label="Task labels">{labels.map((label) => <li key={label}>#{label}</li>)}</ul> : null;
}
