# Section 1.59 · Inline comment editing

Task comments can now be edited in place rather than through a browser prompt. The editor preserves the current body and mentions, allows both to be changed, shows the character count, validates the same limits as comment creation, and stays open if the save fails. Cancel restores the saved comment values.

## Verification

- Edit a comment you authored and confirm the editor starts with its saved text and selected mentions.
- Change the text and mentions, save, and confirm the updated comment and mention names render.
- Attempt to save an empty comment and confirm validation keeps the editor open.
- Cancel an edit and confirm the original text and mentions remain.
- Confirm another member's comment has no edit control and that controls are disabled while a save is in progress.

No database migration is required.

Suggested commit:

```sh
git add README.md apps/web/app/globals.css apps/web/app/workspace/tasks/'[taskId]'/components/comment-card.tsx apps/web/app/workspace/tasks/'[taskId]'/components/comment-list.tsx apps/web/app/workspace/tasks/'[taskId]'/components/task-comments-panel.tsx apps/web/app/workspace/tasks/'[taskId]'/hooks/use-task-comments.ts docs/sections/59-inline-comment-editing.md
git commit -m "feat: edit task comments inline"
git push origin main
```
