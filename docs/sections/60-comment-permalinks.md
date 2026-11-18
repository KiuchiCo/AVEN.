# Section 1.60 · Comment permalinks

Each task comment now has a Copy link action that creates a direct URL with a comment-specific fragment. Opening that URL loads the task, scrolls the discussion to the matching comment, and highlights it. The link stays within the AVEN task page and is still protected by the workspace's existing access checks.

## Verification

- Copy the link for a comment and open it in a new tab.
- Confirm the task discussion scrolls to and highlights that comment after comments load.
- Confirm a user without access to the workspace cannot use the URL to bypass task permissions.
- Confirm comment links continue to identify the same comment when discussion order is changed.

No database migration is required.

Suggested commit:

```sh
git add README.md apps/web/app/globals.css apps/web/app/workspace/tasks/'[taskId]'/components/comment-card.tsx apps/web/app/workspace/tasks/'[taskId]'/components/task-comments-panel.tsx docs/sections/60-comment-permalinks.md
git commit -m "feat: add links to task comments"
git push origin main
```
