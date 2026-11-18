# Section 1.62 · Task activity filters

The task activity timeline can now be filtered to task updates, discussion, or checklist events. Each filter shows its event count, while the panel heading continues to show the total number of entries. If a category has no entries, the panel offers a one-click return to the full timeline.

## Verification

- Create task updates, discussion comments, and checklist changes.
- Select each activity category and confirm only matching entries are shown.
- Confirm category counts and the overall total remain correct.
- Choose a category with no events and use Show all activity.

No database migration is required.

Suggested commit:

```sh
git add README.md apps/web/app/globals.css apps/web/app/workspace/tasks/'[taskId]'/components/task-activity-panel.tsx docs/sections/62-task-activity-filters.md
git commit -m "feat: filter task activity"
git push origin main
```
