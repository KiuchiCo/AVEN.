# AVEN. Phase 7: full product completion, device validation, integration testing and repository optimisation

Date: 28 November 2026 · Base commit: `de54e43` (Phase 6), branch `main` · Nothing committed, pushed, deployed or published.
Pre-existing uncommitted change kept: `apps/desktop/package.json` (an electron-builder 26 schema fix made while packaging the macOS app before this phase).

## Executive summary

**Result.** The two missing features named in Phase 6 (message reactions; calendar drag, drop and resize) are built end to end with database, API, permissions, live updates, UI, translations and tests. Clerk's sign-in, sign-up and account screens now follow AVEN's language. The 49 signed-in browser tests that had never run now run automatically against a throwaway Clerk test user and pass, and the suite grew to cover the new features. Every outside service with credentials was exercised for real in test mode, through AVEN's own client code. The app was run in the iOS Simulator (real WebKit, and the real AVEN iOS app), which found and fixed four iPhone-only problems. The working repository shrank by about 1.5 GB of reproducible build output, and the tracked source by 42 % (6.1 MB) by replacing 52 generated text files with a 36 KB generator.

**Readiness: Beta-ready, close to production-ready pending external verification** (see the final assessment for what is still missing).

## Safe working environment (step 2)

- Git: `main` at `de54e43`; the only pre-existing change was `apps/desktop/package.json` (kept).
- Running: web dev server on :3000, API on :4000, PostgreSQL in Docker (`aven-postgres-1`).
- Credentials present in `.env` (names only): Clerk (development instance, `sk_test_`), Stripe (**test mode**, `sk_test_`), Google Gemini, Resend (sender on Resend's own `resend.dev` test domain), web push (VAPID), Tavily, Google Calendar OAuth, token encryption. **Not configured:** Microsoft/Outlook, S3/Cloudflare R2, embeddings provider, APNs.
- Devices: **no physical iPhone or iPad is connected** (`xcrun devicectl list devices`: none). Xcode 26.6 with iOS 26.5 simulators (iPhone 17 Pro, iPad Pro 11-inch M5 and others) is available.
- Isolation: API tests ran in a scratch copy against a separate `aven_integration` database; browser tests use a throwaway `aven_e2e_*` database the runner drops; signed-in tests and device tests used throwaway Clerk users that were deleted afterwards.

## Implemented features

### Message reactions
- **Data:** new table `channel_message_reactions` (message, user, emoji; primary key on all three, so a duplicate is impossible; cascades with the message or user). Migration `20261212090000_message_reactions` (additive). Applied to the local development and integration databases.
- **API:** `POST /api/v1/workspaces/:w/channels/:c/messages/:m/reactions` with `{ emoji, active }`. It *sets* a state rather than toggling, so double taps and retries are harmless. Only a fixed set of eight emoji is accepted (👍 ❤️ 😂 🎉 😮 😢 🙏 ✅). Same access rules as sending: members only, guests read-only (403), other workspaces and private conversations one is not in get 404, deleted messages take no reactions (404), and deleting a message removes its reactions. Every message now carries its reactions; changes are published live (`message_reactions`) only to people who can see the conversation.
- **Web:** `apps/web/app/workspace/messages/reactions.tsx`: quiet chips under a message (yours outlined in bronze, `aria-pressed`, accessible name "Celebrate: 2, from Mayu, you"), and an "Add a reaction" picker (8 large targets; closes on choice, Escape or a tap outside; focus returns). Updates are optimistic and put back with an explanation if the server refuses; live events from others update the conversation and open thread. On desktop the add button appears on hover/focus; on touch screens it and the message tools are always visible.
- **Tests:** integration `message-reactions.test.mjs` (add, multiple people, repeats, remove, invalid emoji, guests, outsiders, private conversations, deleted messages, live events and their privacy); component `phase7.test.tsx` (optimistic update, chip naming, picker, read-only); browser journey (react, reload, take back). Verified by touch in the iOS Simulator.

### Calendar drag and drop, resizing, and the phone alternative
- **Interaction** (`calendar-drag.ts`): pointer events, so a mouse and a finger behave the same. A mouse drags after 5 px; a finger after a 350 ms hold (a swipe still scrolls; while dragging, the page does not scroll). Escape cancels. A floating label shows where the event will land, the target day or hour is highlighted, and the click that ends a drag does not also open the event.
  - Month and week views: drag an event to another day (same time of day, same length).
  - Day view: drag to another hour (minutes kept), or drag the lower edge to change the length in 15-minute steps (live preview of the new end time; at least 15 minutes, never past midnight).
- **Saving:** the change shows at once, is saved with the event's version (`baseUpdatedAt`) so a simultaneous edit by someone else is reported (409) instead of overwritten, is put back with the reason on failure, and is confirmed with a notice that has **Undo**. Saved events are pushed to connected Google/Outlook calendars the same way as dialog edits.
- **Data integrity** (`calendar-moves.ts`): wall-clock times are kept across daylight-saving changes and month/year boundaries; all-day events move by date only; repeating series and task deadlines are deliberately not draggable (moving one occurrence would move the series): they change through the event dialog.
- **Phones:** no drag (the drag hint is hidden below 760 px); the event dialog's date and time fields are the equivalent, as they are for keyboard and screen-reader users.
- **Tests:** unit `calendar-moves.test.mjs` (6 tests, run in Sydney and New York time zones, including both daylight-saving changes); browser journey (drag to another day, no dialog opened, Undo, resize by one hour, saved after reload).

### Clerk localisation
- `@clerk/localizations` **4.26.0** added (the version built for the installed `@clerk/shared` 4.48.3; exact pin). The root layout passes German, French or Spanish Clerk wording to `ClerkProvider` and sets `<html lang>` from the first byte.
- One language decision, not two: `app/i18n/request-language.ts` uses the person's chosen language (kept in an `aven-lang` cookie by AVEN's existing language provider) or else the browser's. The workspace now uses the same rule when no language has been saved, instead of defaulting to English while Clerk followed the browser.
- AVEN's own words around the Clerk cards (tagline, footer, home link, loading text) are translated.
- **Verified:** sign-in and sign-up in German, French, Spanish and English in the browser (Clerk title, labels and buttons, e.g. "In AVEN. Development einloggen", "Créez votre compte", "Continuar"); a new browser test covers all four. Clerk's account screens (Settings → Security) receive the same localisation. **Not exercised:** Clerk's verification-code, password-reset and error screens in each language (they come from the same Clerk locale file, but no test account went through them).

### Signed-in browser tests (the 49 skipped tests)
- **Why they were skipped:** they needed an existing user of the Clerk development instance, and none was provided.
- **Fix:** `npm run test:e2e` now creates a throwaway Clerk test user through Clerk's backend API (`aven-e2e-…+clerk_test@example.com`, no password, development keys only, refused for live keys) and deletes it at the end (also on failure). Sign-in uses Clerk's official testing tickets; nothing in the app's authentication was changed or bypassed. Two configuration bugs found on the first run were fixed (the test process needed `CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY` under Clerk's own names).
- **First real run** found one genuine accessibility bug (below). After the fix all signed-in tests pass; the two Phase 7 journeys were added to them.

## Device testing

**Physical devices: none tested.** No iPhone or iPad was connected to this Mac. Everything below is simulation.

| Environment | What was tested | Result |
|---|---|---|
| **iOS Simulator, iPhone 17 Pro (iOS 26.5), the real AVEN iOS app** (Capacitor shell, development build) | App launch, sign-in screen in the native shell | Renders correctly; header clear of the Dynamic Island; safe areas respected |
| **iOS Simulator, iPhone 17 Pro, Safari (real WebKit)**, signed in with a throwaway user | Home, Messages (create channel, send, react, reload), Calendar (month, phone layout) | Worked after the fixes below |
| **iOS Simulator, iPad Pro 11-inch (M5), Safari**, signed in | Calendar in portrait (sidebar + full calendar, drag hint shown) | Layout correct. **Touch dragging on iPad was not exercised**: controlling a second simulator needs a permission you can only grant at the computer |
| Chrome (Playwright), signed in | Every main screen at 1440 × 900, 768 × 1024 and 390 × 844: no sideways scroll, no WCAG 2.2 AA violations (axe); journeys | All pass |
| Chrome (Playwright), public pages | Responsive checks at 1440, 1024, 768, 430, 390, 375 px; accessibility | All pass |

**iPhone-only problems found in the Simulator and fixed** (none were visible in desktop emulation):
1. **Safari zoomed into any form field under 16 px when focused, and stayed zoomed** (seen on the channel-name field), cutting off the right of the screen. On touch screens every text field, select and editor is now at least 16 px.
2. The channel-name field auto-capitalised; it now has `autocapitalize="none"`, no autocorrect or spell check.
3. The open conversation's header and tabs touched both screen edges and clipped the info button; they now keep the 16 px gutter.
4. The message tools (reply, edit, delete) and the reaction button only appeared on hover, so they could not be reached by touch; they are always visible on touch screens.
Also improved from what the device run showed: the calendar was a card inside a card (≈40 px of width lost on phones); the empty Messages screen now has a "New channel" button; the last message's reactions are no longer hidden under the composer.

## Integration report

| Integration | Test performed | Result | Environment | Remaining |
|---|---|---|---|---|
| **Stripe** | Real API, test mode: Plus/Pro/Business prices exist, active, AUD, monthly, amounts match `plans.ts`; a Checkout session created through AVEN's `StripeClient` (opened on `checkout.stripe.com`, then expired) | Pass | Stripe test mode (`sk_test_`) | A completed checkout with a test card, the webhook round trip from Stripe (needs the Stripe CLI or a public URL), portal and cancellation were not run live; covered by existing stub/contract tests (signature checks, idempotent events, entitlements) |
| **Gemini** (AVEN Intelligence) | Real streamed request through AVEN's `GeminiProvider` | Pass ("OK", stop `end_turn`) | Google AI Studio key from `.env` | Quota, invalid-key and timeout paths remain stub-tested |
| **Resend** | Real send through AVEN's `ResendMailer` to Resend's test inbox `delivered@resend.dev` | Pass (accepted) | Resend, `resend.dev` sender | Sending to real people needs a verified sending domain |
| **Tavily** | Real search through AVEN's `TavilyWebSearch` | Pass (6 results) | Tavily key from `.env` | — |
| **Clerk** | Real development instance: users created and deleted through the backend API; sign-in tickets; localised UI | Pass | Clerk development instance | Production instance, MFA plan, email deliverability (owner decisions) |
| **Google Calendar** | Not re-run live (needs your Google account to grant OAuth in a browser). Existing stand-in suite passed (calendar-sync, two-way); a real round trip was done in an earlier phase | Pass (stand-in) | Local stand-in for Google's API | Live OAuth with a test Google account |
| **Outlook / Microsoft Graph** | No credentials. Stand-in tests pass | Pass (stand-in) | Local stand-in | Azure app registration and a test Microsoft account |
| **S3 / Cloudflare R2** | No credentials. Stand-in tests pass (local disk storage is what runs) | Pass (stand-in) | Local stand-in | A test bucket |
| **Embeddings** (search by meaning) | No credentials. Stand-in tests pass | Pass (stand-in) | Local stand-in | Any OpenAI-compatible key |
| **Web push** | VAPID keys present; encryption/signing tests pass. Real delivery needs a browser that has granted notification permission | Pass (unit) | — | A real browser subscription |
| **APNs** (iOS push) | Not configured | Not run | — | Apple push key |

`npm run check:live --workspace @aven/api` (new, `apps/api/scripts/live-integration-check.mjs`) repeats the live rows above; it refuses live Stripe keys, writes only to Resend's test inbox, expires the Checkout session it opens and never prints a key. Result on 28 Nov 2026: all 7 checks passed.

## Testing report (exact results, all run on 28 Nov 2026)

| Suite | Command | Result |
|---|---|---|
| Web lint | `npm run lint` (apps/web) | pass, 0 problems |
| Web type check | `npm run typecheck` (apps/web) | pass |
| Web unit | `npm test` (apps/web) | **202 / 202** (193 before; +6 calendar maths, +3 coaching generator) |
| Web component (jsdom + axe) | `npm run test:components` | **63 / 63** (59 before; +4 reactions) |
| Web production build | `NEXT_DIST_DIR=.next-audit npm run build` | pass (output removed afterwards) |
| API type check | `npm run typecheck` (apps/api) | pass |
| API unit | scratch copy, `node --test test/*.test.mjs` | **329 / 329** |
| API integration (real PostgreSQL) | scratch copy, `aven_integration`, `--test-concurrency=1` | **236 / 236** (233 before; +3 reactions) |
| Browser, signed in | `npm run test:e2e -- authenticated.spec.ts` (throwaway Clerk user) | **51 / 51**: the 49 previously skipped + 2 Phase 7 journeys |
| Browser, complete | `npm run test:e2e` | **114 / 114**, 0 skipped, 0 failed (51 signed-in + 63 public; was 62 passed / 49 skipped) |
| Accessibility | axe (WCAG 2.2 A/AA) inside the browser tests: every signed-in screen at three widths, public pages, new components | 0 violations after the fix below |
| Live integrations | `npm run check:live` | 7 / 7 pass |
| Device | iOS Simulator (iPhone 17 Pro, iPad Pro 11) | see Device testing |

## Repository cleanup

**Baseline (before):** working directory 6.3 GB; tracked files 14.6 MB in 956 files; `.git` 7.8 MB. Nearly all size is generated: web dev cache 3.4 GB, `node_modules` 1.5 GB, iOS build output 680 MB, desktop packaging output 484 MB.

| Removed | Size | Why it was safe |
|---|---|---|
| 52 per-template task-coaching files (`presets/task-coaching/*.ts`) replaced by `coaching-text.ts` + `coaching-catalog.ts` | 6.0 MB → 36 KB tracked | All 312 entries were one text with the template name and task title filled in; the generator was checked to reproduce **every entry exactly** before the files were deleted; a unit test guards it; the loader's interface is unchanged and still lazy-loaded |
| iOS build outputs except the development build (`apps/mobile/build/production`, loose Xcode data) | ≈ 420 MB | Git-ignored; rebuilt by `apps/mobile/scripts/build-ios.mjs` |
| Desktop packaging leftovers (unpacked app, zip, block maps, debug log); **the `.dmg` installer was kept** | ≈ 360 MB | Git-ignored; rebuilt by `npm run dist:mac --workspace @aven/desktop` |
| Web build cache `apps/web/.next/cache` | 722 MB | Rebuilt on demand; the running dev server uses `.next/dev` and kept working |
| Graphify dated backups, a stray root `.next/` (18 Nov traces), `.DS_Store` | ≈ 20 MB | Ignored, unused |
| Browser-test outputs (`.next-e2e`, `e2e/test-results`) | ≈ 215 MB | Recreated by each run |

**After:** working directory **4.7 GB** (from 6.3 GB, −1.6 GB; what remains is mostly `node_modules` 1.5 GB and the running dev server's `.next` 2.8 GB, both reproducible). Tracked files: **8.5 MB** (−42 %).
**Dependencies:** every manifest was checked against actual imports; nothing is unused (the six flagged packages are peer or tool dependencies: `@testing-library/dom`, `rxjs`, `@prisma/client`, `@nestjs/cli`, `typescript`, `@capacitor/core`/`ios`). One dependency was added: `@clerk/localizations`. `npm audit --omit=dev`: **0 vulnerabilities**; 6 moderate ones exist only in the desktop packaging tool chain (`minimatch` under `electron-builder`), fixable only by a forced major upgrade, so left as is.
**Kept on purpose:** `apps/web/.next/dev` (the running dev server), `apps/mobile/build/development` (the built iOS app used for Simulator testing), the desktop `.dmg`, `extended-catalog.ts` (386 KB: formulaic but mixed with per-template specifics, not worth the risk), Phase 6 and this report.
**Documentation corrected:** README (OCR and meaning search over tasks and files *are* built; AI provider is Gemini by default; dated paragraph labelled), DEPLOYMENT (default AI model), AVEN-DESIGN-SYSTEM (dark mode exists), TESTING (signed-in tests now run automatically), INTEGRATIONS (the live check).

## Security

| Found | Fix | Regression test |
|---|---|---|
| Accessibility/voice-control: the top-bar search link's accessible name did not contain its visible words (WCAG 2.5.3), found by the first signed-in browser run | The link is named by its own words; the ⌘K hint is hidden from assistive technology; on narrow screens the words are hidden visually, not removed | Every signed-in screen is checked with axe at three widths |
| New reaction endpoint: input and access | Emoji allow-list, workspace and conversation checks, guests refused, deleted messages refused, live events limited to the conversation's audience | `message-reactions.test.mjs`; the route-by-route access audit covers the new route automatically |
| A one-time Clerk sign-in ticket for the throwaway device-test user appeared in a command's error output during testing | Revocation was refused because it had already been used; it was single-use with a 15-minute expiry, and the user it belonged to was deleted minutes later | — (process lesson; not a product issue) |

Also re-checked without findings: production dependencies (0 known vulnerabilities); calendar changes go through the existing validated update path (end after start, series rules, version check); Clerk keys stay server-side (`CLERK_SECRET_KEY` used only by the test runner and server). **No penetration test was performed.**

## Remaining work

| Item | Why it remains | What is needed |
|---|---|---|
| Testing on a physical iPhone and iPad | None connected | Connect a device (or a test-flight build) and repeat the Simulator checks |
| iPad touch dragging in the calendar | Driving a second simulator needs a permission you grant at the computer | Grant Simulator access for the iPad, or test on a device |
| Live Stripe checkout, webhooks, portal, cancellation | Completing checkout needs a browser session through Stripe; webhooks need the Stripe CLI or a public URL | `stripe listen --forward-to localhost:4000/api/v1/billing/webhook` and a test card on a signed-in session |
| Live Outlook, R2, embeddings, APNs | No credentials | The keys listed in `docs/INTEGRATIONS.md` |
| Clerk verification, password-reset and error screens in each language | No test account went through them | A manual pass on the development instance with a `+clerk_test` address (code 424242) |
| Hosting, production email domain, privacy decisions | Owner/legal decisions | See `docs/PRIVACY-DECISIONS.md` |
| 139 hard-coded strings (mostly English fallback errors) | Lower priority than this phase's scope | Continue the ratchet in `tests/hardcoded-text.test.mjs` |

## Files changed (main)
- **Reactions:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261212090000_message_reactions/`, `apps/api/src/messaging/{message-rules,messaging.service,messaging.controller,channel-events}.ts`, `apps/web/app/workspace/messages/{reactions.tsx,messages-workspace.tsx}`.
- **Calendar:** `apps/web/app/workspace/{calendar-drag.ts,calendar-moves.ts,connected-records.tsx}`.
- **Localisation:** `apps/web/app/layout.tsx`, `apps/web/app/i18n/{request-language.ts,index.tsx,en,de,fr,es}.ts`, sign-in and sign-up pages, `apps/web/app/workspace/layout.tsx`, `apps/web/package.json` (+ `@clerk/localizations`).
- **Tests and tooling:** `apps/web/e2e/{run.mjs,tests/authenticated.spec.ts,tests/public.spec.ts}`, `apps/web/tests/{calendar-moves,task-coaching}.test.mjs`, `apps/web/component-tests/phase7.test.tsx`, `apps/api/test/integration/message-reactions.test.mjs`, `apps/api/scripts/live-integration-check.mjs`, `apps/api/package.json` (`check:live`).
- **Accessibility and touch:** `apps/web/app/workspace/workspace-shell.tsx`, `apps/web/app/design-system.css` (Phase 7 section).
- **Repository:** `apps/web/app/workspace/projects/templates/presets/task-coaching/` (52 files → generator + catalog).
- **Docs:** README, DEPLOYMENT, INTEGRATIONS, TESTING, AVEN-DESIGN-SYSTEM, this report.

## Data changed
- Local development database: the reactions migration (one new table). The device-test user's personal workspace and user row were created by signing in and then **deleted**; nothing else in your workspace was changed (the browser pane was signed out this phase, so no records were added there).
- Clerk development instance: throwaway users created by each signed-in browser run and the device test; **all deleted** (none left).
- Stripe test mode: one Checkout session, **expired**. Resend: one email to `delivered@resend.dev`. Gemini and Tavily: one request each.
- Integration and browser-test databases: their own (`aven_integration`; `aven_e2e_*` dropped by the runner).
- No real emails, invitations, payments or production data.

## Final assessment
**Beta-ready, close to production-ready pending external verification.** The product is feature-complete for its documented scope, the signed-in experience is now proven by automated browser tests on every main screen, the configured outside services work for real in test mode, and real iOS WebKit has been exercised. What keeps it short of production-ready is outside the code: a physical-device pass, a live payment and webhook round trip, credentials for Outlook, storage, embeddings and push, a production Clerk instance, and the open hosting, email and privacy decisions.
