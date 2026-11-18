export function TemplateEditorHeading({ onCancel, title = 'Edit project template', eyebrow = 'UPDATE YOUR STARTER' }: { onCancel: () => void; title?: string; eyebrow?: string }) {
  return <div className="project-template-editor__heading"><div><p className="workspace-eyebrow">{eyebrow}</p><h3>{title}</h3></div><button type="button" onClick={onCancel}>Cancel</button></div>;
}
