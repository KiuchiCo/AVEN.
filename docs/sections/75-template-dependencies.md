# Section 1.75 · Project template dependencies

Saving a project as a template now preserves prerequisite links between its starter tasks. The template editor can add, remove, and change prerequisites. Applying a template creates fresh tasks first, then reconnects their prerequisite graph in the same transaction as the project and milestones.

Template parsing validates prerequisite indexes, rejects duplicate and self links, and detects cycles before saving or applying. Older templates without prerequisite data continue to work as task lists with no dependencies. No database migration is required because task templates are stored as JSON.

## Verification

- Save a project whose tasks have prerequisites and confirm the template contains the same ordering.
- Edit prerequisite links in a template, including adding and removing tasks, and save the changes.
- Apply the template and confirm new tasks link to each other, not to tasks in the original project.
- Confirm new tasks are all open and preserve titles, descriptions, priorities, and labels.
- Verify malformed indexes, self-links, repeated prerequisites, and cycles are rejected.
- Apply an older template with no dependency data and confirm it still works without links.

Suggested commit after reviewing Section 1.75:

```sh
git add README.md apps/api/src/productivity/productivity.service.ts apps/web/app/globals.css apps/web/app/workspace/projects/page.tsx docs/sections/75-template-dependencies.md
git commit -m "feat: preserve dependencies in project templates"
git push origin main
```
