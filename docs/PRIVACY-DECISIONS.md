# Privacy and data protection: what is built, and what needs a decision

This is a technical note, not legal advice. Items under "Decisions" need legal or management approval before they are changed in code or written in a privacy notice.

## What is built

- **Data export** (`GET /api/v1/session/export`, Settings → Your data): a JSON copy of the person's profile, workspaces and roles, and what they created or are assigned in workspaces they still belong to (tasks, documents, Knowledge items, comments, messages, AI conversations, file names, pins, calendar connections). Excludes other people's content, tasks of team-only projects they are outside of, passwords (held by Clerk) and tokens. It is generated on request and sent straight to the person (`Cache-Control: no-store`), so there is no stored export file or download link to expire. Each request is logged (who and when, never the content) and counted.
- **Account deletion** (`POST /api/v1/session/delete-account`, Settings → Your data): needs the email typed back; unlinks the sign-in at once; removes memberships, devices, calendar connections, AI conversations, pins; strips the account row of everything identifying; deletes workspaces owned alone; keeps work in shared workspaces as "Deleted user"; refuses while the person owns a workspace with other members or a paid plan. Optionally deletes the Clerk account too.
- Logs and error reports are scrubbed of tokens, keys, emails and share/invitation secrets. Access to workspace data is checked on the server on every request and again while a live stream is open.

## Decisions needed

1. **Retention periods** for: AI conversations; audit-log entries; activity; files in the recycle bin; deleted-account tombstones (the stripped account row is kept so authorship can show "Deleted user"); application logs; backups. AVEN. has no automatic expiry for the first five (they last until a person, workspace or file is deleted); log retention is whatever your log host does; `scripts/backup.sh` keeps backups for 14 days (`KEEP_DAYS`).
2. **Backups and deletion:** deleted data remains in backups until they expire. Decide whether that is acceptable and how it is described.
3. **Cross-border disclosure:** Clerk (sign-in), Stripe (payments), the AI provider (conversation content and workspace excerpts sent for answers), the email provider, the embeddings provider (document, Knowledge and task text), Brave (search queries), the error tracker (scrubbed errors) and the object store may process data outside Australia. Decide which are acceptable, region choices (e.g. S3 in ap-southeast-2, a Sydney database), and what the privacy notice says. `S3_REGION` defaults to `us-east-1` when unset: set it.
4. **Privacy notice, collection notice and consent wording** (including AI processing and optional email/push notifications), and where they are shown at sign-up.
5. **Breach response:** who decides, who is told, within what time (the Notifiable Data Breaches scheme applies to eligible breaches), and the template. The metrics and alerts in [OPERATIONS.md](OPERATIONS.md) help detect; they do not replace a process.
6. **Other people's data in an export or deletion:** messages a person wrote in a conversation with others are included in their export and kept (as "Deleted user") after deletion. Confirm that is the intended policy.
7. **Account deletion and paid plans:** the owner of a workspace with a paid plan must cancel or hand it over first. Decide whether AVEN. should do any of that automatically.
8. **Children and age limits**, if relevant to the intended users.
