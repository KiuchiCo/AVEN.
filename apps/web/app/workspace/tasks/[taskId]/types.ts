export type TaskSummary = { id: string; title: string; description: string | null; status: string; priority: string; labels: string[]; dueAt: string | null; project: { id: string; name: string } | null; assignee: { id: string; displayName: string } | null };
export type TaskComment = { id: string; body: string; mentionedUserIds: string[]; createdAt: string; updatedAt: string; author: { id: string; displayName: string } };
export type ChecklistItem = { id: string; title: string; position: number; completedAt: string | null; createdAt: string; createdBy: { id: string; displayName: string }; completedBy: { id: string; displayName: string } | null };
export type TaskFollower = { id: string; displayName: string; email: string; followedAt: string };
export type WorkspaceMember = { userId: string; displayName: string; role: string };
