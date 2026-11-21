/** Pure rules for document folders, kept apart from the database so they are easy to test. */
export const documentTypes = ['BLANK', 'MEETING_NOTES', 'PROJECT_BRIEF', 'TASK_PLAN', 'RESEARCH_NOTES', 'DECISION_LOG', 'WEEKLY_PLAN', 'STUDY_NOTES'] as const;
export type DocumentType = (typeof documentTypes)[number];
export const MAX_FOLDER_DEPTH = 8;
export const MAX_BULK = 100;

type Node = { id: string; parentId: string | null };

/** Folders from the top level down to this one (inclusive). Stops if the data loops. */
export function folderPath<T extends Node>(folders: T[], id: string | null): T[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: T[] = [];
  const seen = new Set<string>();
  let current = id ? byId.get(id) : undefined;
  while (current && !seen.has(current.id)) { seen.add(current.id); path.unshift(current); current = current.parentId ? byId.get(current.parentId) : undefined; }
  return path;
}

/** Moving a folder into itself or anything inside it would cut it off from the tree. */
export const wouldCycle = (folders: Node[], folderId: string, newParentId: string | null) => newParentId !== null && folderPath(folders, newParentId).some((folder) => folder.id === folderId);

/** How many levels deep the folder with this id (or a new child of it) would sit. */
export const depthOf = (folders: Node[], id: string | null) => folderPath(folders, id).length;

/** How many levels a folder and everything inside it span (a folder with no subfolders is 1). */
export function subtreeHeight(folders: Node[], id: string): number {
  const children = folders.filter((folder) => folder.parentId === id);
  return 1 + Math.max(0, ...children.map((child) => subtreeHeight(folders, child.id)));
}

export const duplicateTitle = (title: string) => `${title.slice(0, 190)} copy`;
