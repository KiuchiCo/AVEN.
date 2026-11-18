# Section 1.52 · Task comment lifecycle updates

Task followers receive an Inbox update when a comment is edited or deleted. Newly mentioned members receive an update when they are added to an edited comment. Removing a mention does not send a new alert to that person. Saving an unchanged comment does not create extra activity.

The comment author remains the only member who can edit or delete that comment. The API responds with Forbidden for attempts to change another member's comment. Shared workspace activity records the edit or deletion without copying the comment text into the activity message.

## Database

No schema migration is required. The existing recipient-scoped activity and receipt fields are used.

## Verification

```bash
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
git diff --check
```

Use two members on a task. Follow the task from one member, then have the author edit and delete a comment. Confirm the follower receives a task-linked update in Inbox and the shared Activity page records the changes. Edit a comment to add a new mention and confirm that person receives an update; save an unchanged comment and confirm it creates no additional activity. Try editing another member's comment and confirm the API rejects the request.

## Commit and push

```bash
git add README.md apps/api/src/productivity/task-collaboration/task-comments.service.ts docs/sections/52-task-comment-lifecycle.md
git commit -m "feat: notify task followers about comment changes"
git push origin main
```
