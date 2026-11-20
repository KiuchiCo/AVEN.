# Deploying AVEN

AVEN is two Node processes and a PostgreSQL 17 database: the web app (`apps/web`, Next.js) and the API (`apps/api`, NestJS). Node 24 or newer is required.

## 1. Configuration

Copy `.env.example` to `.env` once and fill it in. Never copy it over an existing `.env`. Required in production:

| Setting | Why |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `WEB_ORIGIN` | The public web address, e.g. `https://app.example.com` (also used in emails and billing redirects) |
| `NEXT_PUBLIC_API_BASE_URL` | Public API address including `/api/v1`. It is baked in when the web app is built |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_ISSUER` | Sign-in. Use a production Clerk instance, not a development one |
| `TRUST_PROXY` | Number of proxies in front of the API (usually `1`). Without it every visitor looks like the proxy's address and shares one rate limit |

Optional features switch on when their keys are present: `ANTHROPIC_API_KEY` (AVEN Intelligence), `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` (browser push notifications; generate a pair with `npm run vapid:generate --workspace @aven/api` after building; the web app must be served over HTTPS), `WEB_SEARCH_API_KEY` (Brave Search for the assistant; verified only against a local stub), `EMAIL_API_KEY` + `EMAIL_FROM` (invitations and notification emails), `STRIPE_*` (paid plans). With no key, the feature says it is off rather than pretending.

The API refuses to start with an invalid configuration and says which setting is wrong.

## 2. Build and run

```bash
npm ci
npm run db:generate
npm run db:migrate:deploy       # applies pending migrations; safe to repeat
npm run build                   # builds both apps
npm run start --workspace @aven/api    # node apps/api/dist/main.js
npm run start --workspace @aven/web    # next start
```

Run migrations before starting the new API version, on every release. Migrations only add to the database; AVEN never deletes user content when a plan changes.

Put both behind HTTPS (a reverse proxy or your platform's load balancer). The API sends HSTS and the web app does too, in production only.

## 3. Health checks

- `GET /api/v1/health` is liveness: the process is up. Use it to decide when to restart.
- `GET /api/v1/health/ready` is readiness: the database answers (503 if not). Use it for load balancing.

Neither needs a sign-in and neither is rate limited. The API shuts down cleanly on SIGTERM (it closes database connections).

## 4. One API instance, for now

Two things live in the API process's memory, so run **one** API instance until they are moved:

- Live messaging updates only reach people connected to the same process (`apps/api/src/messaging/channel-events.ts`; swap in Postgres `LISTEN/NOTIFY` or Redis).
- Rate limit counters are per process.

Workflows, email summaries and scheduled work run inside the API process too. If you ever run more than one, set `WORKFLOWS_DISABLED=true` on all but one. Claiming of due work uses `FOR UPDATE SKIP LOCKED`, so a duplicate would not run a step twice.

## 5. Files

Uploads are stored on local disk in `STORAGE_DIR` (default under `apps/api`). Use a persistent volume. Alternatively set `STORAGE_DRIVER=s3` with `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and, for non-AWS stores (R2, MinIO, Spaces), `S3_ENDPOINT`. The driver signs requests itself (SigV4, path-style) and buffers each upload in memory up to `MAX_UPLOAD_BYTES`. It is verified against a local S3 stub (request shape, payload hash, size cap), not a live bucket (awaiting credentials). Back up the bucket with your provider's versioning/replication instead of rsync.

## 6. Backups and restore

Back up the database and `STORAGE_DIR` together, on a schedule (daily is a sensible start):

```bash
DATABASE_URL=postgresql://... ./scripts/backup.sh /var/backups/aven   # keeps 14 days; KEEP_DAYS to change
rsync -a "$STORAGE_DIR/" /var/backups/aven-files/
```

Restore into an empty database, then start the API:

```bash
gunzip -c aven-20260101T020000Z.sql.gz | psql "postgresql://.../aven"
```

Practise a restore into a scratch database before you need one. A backup you have never restored is a guess.

## 7. Payments

Create three monthly prices in Stripe (A$9.99, A$19.99, A$29.99 per seat) and set `STRIPE_PRICE_PLUS|PRO|BUSINESS`. Add a webhook endpoint at `POST <api>/api/v1/billing/webhook` for `checkout.session.completed`, `customer.subscription.*` and `invoice.*`, and set `STRIPE_WEBHOOK_SECRET`. Plan limits can be tuned without code through `BILLING_PLAN_OVERRIDES`.

## 8. Calendar sync (Google Calendar and Outlook)

Owners and administrators can connect a calendar under **Settings → Connected apps**. AVEN imports events from the last 30 days to the next 6 months into the workspace calendar, and re-checks every five minutes (or on **Sync now**). Events from a connected calendar are visible to everyone in the workspace.

**Set up Google:** in Google Cloud Console create a project, enable the *Google Calendar API*, configure the OAuth consent screen, and create an *OAuth client ID* of type *Web application*. Add `<API_PUBLIC_URL>/api/v1/integrations/calendar/callback` as an authorised redirect URI. Put the client ID and secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. AVEN asks for `calendar.events` access and the account's email address.

**Set up Outlook:** in Microsoft Entra admin centre register an application (accounts in any organisational directory and personal accounts), add the same redirect URI as a *Web* redirect, create a client secret, and put them in `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`. AVEN asks for `Calendars.ReadWrite`, `User.Read` and `offline_access`.

Both need `TOKEN_ENCRYPTION_KEY` (32 random bytes, base64: `openssl rand -base64 32`). Sign-in tokens are stored encrypted with it and are never sent to the browser. If you lose the key, people reconnect their calendars; nothing else is affected.

How it behaves, so nothing surprises you:
- Events are matched by the provider's own id, never by title, so a sync can't create duplicates. Running it twice changes nothing.
- A change on one side is copied to the other. If an event was edited in both places, the later edit wins and a note is added to the activity feed.
- An event deleted on the provider is removed from AVEN (if it falls inside the synced window). An event deleted in AVEN stays deleted: it is not re-imported.
- Sending AVEN events *to* the calendar is off by default and chosen per connection. An event made in AVEN goes to one calendar only, and repeating events made in AVEN are not sent, because providers use their own repeat rules.
- If the provider revokes access, the connection shows *Needs to be reconnected* and nothing is lost.
- Disconnecting forgets the tokens; events already imported stay in AVEN but stop updating.
- Run syncing on one API server (set `CALENDAR_SYNC_DISABLED=true` on others). A claim on each connection stops two servers syncing the same account at once.

## 9. Security notes

- Every request is tied to a Clerk identity and checked against workspace membership on the server; guests are read-only everywhere. Other workspaces' data returns 404.
- The API sends `nosniff`, `frame-ancestors 'none'` and related headers. The web app sends `nosniff`, `X-Frame-Options: SAMEORIGIN`, a referrer policy and a permissions policy. It does not yet send a Content-Security-Policy: Clerk loads scripts and frames from its own domains, so a correct policy needs testing against your Clerk instance.
- `apps/api/test/integration/auth-coverage.test.mjs` walks every route the API registers. It checks that anonymous requests get 401 (except the three documented public routes), that a signed-in non-member gets 404 on every workspace route, and that a guest is refused on every route that changes something. A new route that forgets its access check fails this test.
- A person can hold at most five live message connections open at once.
- Outgoing webhooks from workflows refuse private and internal addresses (checked after DNS resolution, no redirects). `WORKFLOW_ALLOW_PRIVATE_WEBHOOKS` is refused in production.
- Stripe webhooks are verified by signature with a five-minute replay window; each event is applied once.
- Keep `.env` out of version control and rotate any key that has been pasted anywhere public.
