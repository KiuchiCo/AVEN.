# Section 1.61 · Task discussion filters

Task discussions can be narrowed to all comments, comments written by the current user, or comments that mention the current user. The filter combines with the existing comment search and date ordering. Empty results explain the active filter and provide a clear-filters action; the header count continues to show the full discussion size.

## Verification

- Create comments as multiple members and mention the signed-in user in at least one.
- Switch between All comments, Mine, and Mentioning me and confirm the matching comments appear.
- Combine each filter with a search phrase and both sort directions.
- Select a filter with no matches and clear filters; confirm all comments return and the total count remains unchanged.

No database migration is required.

Suggested commit:

```sh
git add README.md apps/web/app/workspace/tasks/'[taskId]'/components/task-comments-panel.tsx docs/sections/61-task-discussion-filters.md
git commit -m "feat: filter task discussions"
git push origin main
```
