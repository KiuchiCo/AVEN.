export function TemplateEditorHeading({ onCancel }: { onCancel: () => void }) {
  return <div className="project-template-editor__heading"><div><p className="workspace-eyebrow">UPDATE YOUR STARTER</p><h3>Edit project template</h3></div><button type="button" onClick={onCancel}>Cancel</button></div>;
}
