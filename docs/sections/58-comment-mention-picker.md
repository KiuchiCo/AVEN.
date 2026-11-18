# Section 1.58 · Comment mention picker

The task comment composer now presents workspace members as checkboxes instead of a modifier-key multi-select. The picker shows the selected count, limits selection to the API's 20-mention maximum, and explains that selected teammates receive a notification when the comment is posted.

## Verification

- Open a task discussion and select one or more teammates in the mention picker.
- Confirm selected teammates are visually indicated and the count updates.
- Select 20 members and confirm additional members cannot be selected; deselect one and confirm another can be chosen.
- Post a comment and confirm the selected members are shown as mentioned and receive the existing notification.
- Confirm the picker is disabled while a comment is being posted.

No database migration is required.

Suggested commit:

```sh
git add README.md apps/web/app/workspace/tasks/'[taskId]'/components/member-picker.tsx apps/web/app/globals.css docs/sections/58-comment-mention-picker.md
git commit -m "feat: improve task comment mentions"
git push origin main
```
