export type FileCategory = 'DOCUMENTS' | 'IMAGES' | 'MEDIA' | 'OTHER';
export const fileCategories: FileCategory[] = ['DOCUMENTS', 'IMAGES', 'MEDIA', 'OTHER'];

/** A file's category from its type. Files are kept in one place in AVEN; categories are only a way to browse them. */
export function categoryOf(mimeType: string, name = ''): FileCategory {
  if (mimeType.startsWith('image/')) return 'IMAGES';
  if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) return 'MEDIA';
  if (/^(application\/(pdf|msword|rtf|json|xml|vnd\.|x-)|text\/)/.test(mimeType) && !/zip|octet/.test(mimeType)) return 'DOCUMENTS';
  if (/\.(pdf|docx?|xlsx?|pptx?|txt|md|csv|rtf)$/i.test(name)) return 'DOCUMENTS';
  return 'OTHER';
}
export const canPreview = (mimeType: string) => /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain)$/.test(mimeType);

export type FileSort = 'MODIFIED' | 'NAME' | 'SIZE';
export function sortItems<T extends { name: string; sizeBytes: number; updatedAt: string }>(items: T[], sort: FileSort): T[] {
  return [...items].sort((a, b) => sort === 'NAME' ? a.name.localeCompare(b.name) : sort === 'SIZE' ? b.sizeBytes - a.sizeBytes || a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
}
