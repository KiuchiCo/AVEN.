export function projectTemplateFilename(name: string) {
  const base = name.normalize('NFKD').toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return `${base || 'aven-project-template'}.aven-template.json`;
}
