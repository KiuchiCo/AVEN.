const labels: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent' };
export function TemplatePriority({ value }: { value: string }) { return <span className={`project-template-priority project-template-priority--${value.toLowerCase()}`}>{labels[value] ?? value}</span>; }
