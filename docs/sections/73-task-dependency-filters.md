# Section 1.73 · Task dependency filters

The task board can now show tasks that are blocked by unfinished prerequisites, tasks that block other open work, tasks with any dependency links, or tasks with none. Dependency badges on task cards give a quick view of blocked prerequisites and downstream tasks. The dependency filter is part of shared saved views, so teammates see the same filter when they apply a view.

Older saved views without a dependency filter continue to load with **Any dependency state** selected. No database migration is required.

## Verification

- Filter the task board to blocked tasks and confirm completed prerequisites no longer count as blockers.
- Filter to tasks blocking open work and confirm completed or cancelled downstream tasks are excluded.
- Save each dependency filter as a shared view, reload, and apply it.
- Confirm an older saved view without the dependency field still applies.
- Confirm clearing filters restores all dependency states.

Suggested commit after reviewing the changes:

```sh
git add README.md apps/api/src/productivity/productivity.service.ts apps/web/app/globals.css apps/web/app/workspace/projects/page.tsx docs/sections/73-task-dependency-filters.md
git commit -m "feat: filter tasks by dependency state"
git push origin main
```
