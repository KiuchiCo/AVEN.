# Section 1.57 · Task discussion search

Task discussions can now be searched locally by comment text, author, or mentioned teammate, and sorted oldest-first or newest-first. Search and ordering are applied to the comments already loaded for the task; they do not add API requests or change saved data.

## Verification

- Add several comments from different workspace members and include mentions.
- Search for a phrase, author name, and mentioned teammate; confirm matching comments remain visible.
- Search for text with no matches and use Clear search.
- Switch between oldest-first and newest-first and confirm the order changes.
- Confirm the full comment count remains visible while filtering.

No database migration is required.

Suggested commit:

```sh
git add README.md apps/web/app/workspace/tasks/'[taskId]'/components/task-comments-panel.tsx apps/web/app/globals.css docs/sections/57-task-discussion-search.md
git commit -m "feat: search and sort task discussions"
git push origin main
```
