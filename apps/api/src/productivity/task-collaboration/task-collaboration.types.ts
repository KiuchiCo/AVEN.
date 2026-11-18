import type { AuthenticatedIdentity } from '../../auth/auth.types.js';

export type TaskCollaborationIdentity = AuthenticatedIdentity;
export type TaskContext = { userId: string; task: { id: string; title: string } };
export type CommentInput = { body: unknown; mentionedUserIds?: unknown };
export type ChecklistInput = { title: unknown; position?: unknown };
export type MentionedMember = { id: string; displayName: string; email: string };
