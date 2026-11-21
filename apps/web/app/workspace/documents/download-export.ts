/** Downloads a document as PDF or Word through the existing export endpoint. Resolves to the file name. */
export async function downloadExport(args: { apiBase: string; workspaceId: string; documentId: string; title: string; format: 'pdf' | 'docx'; token: string }): Promise<string> {
  const response = await fetch(`${args.apiBase}/workspaces/${args.workspaceId}/documents/${args.documentId}/export?format=${args.format}`, { headers: { Authorization: `Bearer ${args.token}` }, cache: 'no-store' });
  if (!response.ok) { const body = await response.json().catch(() => null) as { message?: string } | null; throw new Error(body?.message ?? 'The document could not be exported.'); }
  const disposition = response.headers.get('content-disposition') ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const name = encoded ? decodeURIComponent(encoded) : `AVEN - ${args.title || 'Untitled'}.${args.format}`;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}
