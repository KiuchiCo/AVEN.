export type FileRecord = {
  id: string; name: string; mimeType: string; sizeBytes: number; version: number; folderId: string | null;
  createdAt: string; updatedAt: string; deletedAt: string | null; createdBy: { id: string; displayName: string };
};
export type FolderRecord = { id: string; name: string; parentId: string | null; createdAt: string };
export type FileListing = { folder: { id: string; name: string } | null; path: { id: string; name: string }[]; folders: FolderRecord[]; files: FileRecord[] };
export type FileUsage = { usedBytes: number; quotaBytes: number | null; maxFileBytes: number; storage?: 'local' | 's3' };
export type FileVersionRecord = { version: number; sizeBytes: number; createdAt: string; createdBy: { displayName: string }; current: boolean };
export type AttachmentRecord = { id: string; createdAt: string; file: FileRecord };
export type AttachmentTarget = { taskId: string } | { documentId: string } | { projectId: string };

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${Number((bytes / 1024 / 1024).toFixed(1))} MB`;
  return `${Number((bytes / 1024 ** 3).toFixed(2))} GB`;
}
