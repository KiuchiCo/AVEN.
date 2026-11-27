# AVEN. Phase 6: product excellence, UX refinement and cross-device audit

Date: 27 November 2026 · Base commit: `da38efb` (Phase 5) · Nothing committed, pushed or deployed.

## Executive summary

**Before.** After Phases 2 to 5 AVEN was functionally broad, well tested and largely accessible, but several of its most-used screens were built "form first": a permanently open creation form (Calendar, Knowledge) or a stack of statistics and filters (My Tasks) pushed the actual content below the fold, and on a phone none of those three pages showed a single task, event or Knowledge item on the first screen. A few controls looked like one thing and did another (My Tasks' "Board" view switch opened the Projects directory; the "List" button did nothing; the week view's "+" only selected a day). Billing was entirely in English with no way to compare plans, relative times ("3 days ago") were English-only everywhere, an iPad-portrait top bar pushed the Create button off screen, and the one known flaky integration test was still flaky.

**After.** The calendar, My Tasks and Knowledge now give their content the page and open their forms in a dialog (a bottom sheet on phones) from an obvious primary button; My Tasks has a real Board view, one-tap summary filters and a single Filters button; the task page edits title and description in place and changes the assignee from the side panel; Automations separates workflows from simple rules; Billing shows a translated plan comparison; relative times and due dates follow the reader's language; whiteboard, project, database and search details were fixed; and the flaky calendar test was traced to a test-isolation fault and fixed. A 175-page device sweep (25 routes × 7 sizes) finds no dead buttons, unnamed controls, duplicate IDs or horizontal overflow.

**Assessment: Beta-ready** (see the final section for why it is not higher).

## How the audit was done

1. Read the current code (not just earlier reports) for each module, the shared UI kit (`ui.tsx`, the `Modal`/`ConfirmDialog` in `projects/project-ui.tsx`), the CSS layers and the i18n system.
2. Walked every route in the signed-in app as a first-time user at 1440 × 900 and 390 × 844, taking screenshots and noting what was confusing, crowded or misleading.
3. Ran a **dead-control scanner** in the live pages: React 19 keeps each element's props on the DOM node, so the script lists every `<button>` with no click handler on itself or its parents (excluding form submits and `<summary>`), every button without an accessible name, disabled buttons with no explanation, clickable non-interactive elements, `href="#"` links and duplicate IDs.
4. Fixed, then re-inspected the rendered result, in several rounds.
5. Ran a **device sweep**: each route loaded in a same-origin iframe sized to each device width (media queries follow the iframe), checking horizontal overflow plus the scanner rules.

## Modules and pages inspected

Home, Inbox, Calendar (month, week, day, agenda, event dialog), My Tasks (list, board, filters, quick add), task detail, Activity, Projects directory, project workspace (overview, tasks, milestones, team, files, settings), Documents list, document editor and side panel, Databases (settings, views, pager), Knowledge (library, dialog, card menu, archive), Whiteboards list, Messages, Files, Automations (workflows, simple rules), Intelligence, Analytics, Task Labels, People, Search, Settings (general, billing, language, connections, audit log), plus dark mode and German.

## Problems found, by severity

### P1: misleading or broken controls and workflows
| # | Problem | Where |
|---|---|---|
| 1 | "Board" in My Tasks' view switch opened the Projects directory; "List" was a button with no handler | `workspace-productivity.tsx` |
| 2 | Calendar: a permanent event form took a third of the width; month cells truncated every event ("Fix c…"); on phones the calendar grid was below the fold | `connected-records.tsx` |
| 3 | Calendar week view's "+" on an empty day only selected the day; the hour "+" in day view scrolled to a far-away form | `connected-records.tsx` |
| 4 | My Tasks: four large stat cards, toolbar, quick add and two rows of filters before the first task; on phones no task was visible | `workspace-productivity.tsx` |
| 5 | Knowledge: permanent "Add to Knowledge" form squeezed the library; on phones no item was visible; each card carried five small text actions | `knowledge-hub.tsx` |
| 6 | iPad portrait (834 px): the top bar overflowed by up to 31 px and cut off the Create button on ten pages | shell CSS |
| 7 | Billing card entirely hard-coded English; no plan comparison; "Choose" buttons could be disabled with no reason; money always formatted as US English | `settings/billing-card.tsx` |
| 8 | Flaky integration test "background sync…" (232/233) | `calendar-sync.test.mjs` |

### P2: confusing, inconsistent or incomplete
| # | Problem | Where |
|---|---|---|
| 9 | Task page: a near-empty "Task details · Title, description, and owner · Edit details" card; assignee could only be changed inside that form | task detail components |
| 10 | Relative times ("5m ago", "yesterday") and Home due dates ("15 days ago", which read like a creation date) were English-only | `relative-time.ts`, `home-dashboard.tsx` |
| 11 | Automations stacked two different systems (workflows and simple rules) with their own forms, stats and lists on one page | `automations-workspace.tsx` |
| 12 | Search ignored `?q=`, so a search could not be linked to or restored with Back; a URL query would flash "no results" | `search/page.tsx` |
| 13 | Whiteboards: two pickers for the same template choice (a select and chips); template names English-only; card thumbnails shrank to their text width because an old list rule made each card a flex row | `whiteboards-workspace.tsx`, CSS |
| 14 | Databases: pager showed "Page 1 of 1" with two disabled buttons; view label rendered "TABLE view" | `database-pager.tsx`, `connected-databases.tsx` |
| 15 | Project page breadcrumb read "All projects / ⟨workspace⟩" (workspace shown inside Projects); milestones with no tasks showed "0/0" and an empty bar | project layout and overview |
| 16 | Stray "Group and find work by label. Browse task labels →" callouts floating above My Tasks and Inbox | `tasks/page.tsx`, `inbox/page.tsx` |
| 17 | Secondary buttons inside forms rendered as primary (a `.productivity-form button` rule outranked `.rd-btn--soft`) | CSS |
| 18 | One-column `.rd-grid` grew to its widest child (a board) instead of letting it scroll, overflowing the page | CSS |
| 19 | Settings language note said "Other screens are still in English for now", which is no longer true | i18n |
| 20 | Document side panel: six tool tabs wrapped raggedly; the active tab was conveyed by colour only | document editor |

### P3: polish
Home "Ask" button had an English-only label; Home "Deep work" link sent an English prompt in every language; calendar conflict and error messages and Knowledge error messages were English-only; calendar day list squeezed titles and wrapped "Edit"/"Delete" letter by letter on phones.

## Changes implemented

### Workflow redesigns

**Calendar: add or edit an event**
- Before: scroll to (or past) a permanent form beside a narrow calendar, fill it in, find the save button; editing an event loaded it into that same form, far from the event; on phones the form came first.
- After: **New event** in the page header, **Add event** under the selected day, the week view's **+** and the day view's hour **+** all open the same dialog, pre-filled with that date and time. **Edit** opens it with the event; the dialog has **Delete event**, **Cancel** and **Save**, with the action row pinned to the bottom of the sheet on phones. Escape closes it and focus returns to the opener. The calendar keeps the full width; view, show/hide and event-type controls sit on one bar (the six type chips became one select); Export and Import moved into a "More" menu; on phones month cells show coloured dots instead of truncated names, and the selected day's list is laid out as type · title over time · actions.

**My Tasks: find and act on tasks**
- Before: four big stat cards, then tabs, group-by and three view icons (one wrong, one dead), quick add, then two rows of five filters, then the list.
- After: one row of counts that are also one-tap filters (open, due today, this week, high priority), then tabs, search, a single **Filters** button showing how many are active (status, project, priority, label, group by, clear), a real **List / Board** switch (remembered per browser), quick add and the list. The **Board** shows To do / In progress / In review / Completed columns with drag and drop *and* a status menu on every card (keyboard and touch), at full width. With filters active the empty state says "No tasks match" and offers **Clear filters** instead of "You're all clear".

**Knowledge: add, edit and browse**
- Before: a large permanent form beside a two-column library; every card had History, Links, Pin, Edit and Archive as separate small buttons.
- After: **New item** in the header opens a dialog (links to project, document or task folded into an expandable section, opened automatically when editing an item that has links); the library takes the page; each card shows **Edit** plus a "⋯" menu for History, Links, Pin and Archive; the empty state offers **New item**.

**Task page: edit details and assignee**
- Before: a separate card that only held an "Edit details" button; the assignee could be changed only inside that form.
- After: **Edit details** sits under the title and opens the title/description form in place (Escape cancels); the assignee is a picker in the side panel that saves at once, like status and priority.

**Automations**
- Before: workflows, then rule stats, rule form, rule list and run history on one long page.
- After: two tabs, **Workflows** and **Simple rules** (with a count); nothing was removed.

**Billing (Settings)**
- Before: an English-only list of usage bars and "Choose Plus · A$9.99" buttons.
- After: a translated plan comparison (name, price in the reader's locale, tagline, projects, members, storage, AI credits and features per plan; per-seat amounts for Business), the current plan marked, honest notes when a plan cannot be bought ("Not available to buy yet", "Payments aren't set up…", "To switch to this plan, use Manage billing", Enterprise "Arranged directly…"), errors announced as alerts. No checkout or portal session was started.

### Smaller fixes
- **Search** reads `?q=` on arrival and keeps the address in sync; shows "Searching…" until the results belong to the typed query (no false empty state).
- **Relative time** (`relative-time.ts`) now uses `Intl.RelativeTimeFormat` in the page's language (`ago()` and a new `dueDay()`); Home shows "Overdue · 23 Feb" or "Due tomorrow" in the reader's language; the unused English `greeting()` was removed.
- **Whiteboards**: one template picker (the chips) with the chosen template described underneath; template names and descriptions translated; thumbnails fill their cards.
- **Databases**: page controls appear only when there is more than one page (the page-size picker stays when there are more records than the smallest page); "Table view" label.
- **Projects**: breadcrumb is just "← All projects"; milestones with no tasks say "No tasks linked yet".
- **Documents**: side-panel tools in an even 3 × 2 grid with `aria-pressed` on the active tool.
- **Shell**: below 900 px the top-bar search collapses to its icon, so Create stays on screen on iPad portrait.
- **CSS foundations**: dialog forms drop their card chrome; secondary buttons stay secondary inside forms; one-column grids can shrink.
- **Copy**: stray label callouts removed; the language note corrected in all four languages; Home "Ask" label and "Deep work" prompt translated; calendar conflict/error and Knowledge action errors translated.

### Translations
106 new strings, each added to English, German (informal "du"), French and Spanish; 3 obsolete strings removed; the language note rewritten in all four. Hard-coded interface strings fell from 158 to 143 and the ratchet in `tests/hardcoded-text.test.mjs` was lowered to 143.

## Device audit (actual sizes)

| Class | Sizes tested | How |
|---|---|---|
| Desktop | 1920 × 1080, 1440 × 900 | iframe sweep (1920); screenshots and interaction tests (1440) |
| Laptop | 1280 × 800 | iframe sweep, screenshots (billing, German) |
| iPad landscape | 1180 × 820, 1024 × 768 | iframe sweep (1180); dark-mode screenshots of board and Knowledge dialog (1024) |
| iPad portrait | 834 × 1194, 768 × 1024 | iframe sweep (both); screenshots and the overflow fix at 834 |
| iPhone | 393 × 852, 390 × 844, 360 × 780 | iframe sweep (393, 360); screenshots and dialog/sheet tests (390) |

Final sweep: 25 routes × 7 widths = 175 page loads, **no** dead buttons, unnamed buttons or duplicate IDs. The only findings were the 834 px top-bar overflows (10 pages, 4–31 px), which were fixed and rechecked (0 px). A German pass over the redesigned pages at 1280, 834 and 390 px found no overflow.

Not tested: 375 × 812 and larger phones specifically (393 and 360 bracket them); real devices or the iOS Simulator (browser emulation only); landscape phones.

## Accessibility
- Dialogs reuse the existing `Modal`: `role="dialog"`, `aria-modal`, labelled by their title, focus moves to the first field, Tab is trapped, Escape closes, focus returns to the opener (checked in the browser for Calendar and Knowledge).
- Every new control has an accessible name; status menus on board cards give keyboard and touch users an alternative to drag and drop; quick filters, view switch and document tools expose state with `aria-pressed`; "Choose plan" buttons that are disabled point to their reason with `aria-describedby`; billing errors use `role="alert"`; the week view's "+" is named "Add an event on ⟨date⟩".
- Automated: the new board is checked with axe in the component tests (no violations); the existing axe-based component tests still pass.
- Not done: a screen-reader session (VoiceOver/NVDA) and a manual contrast audit of every new colour pairing (new styles reuse the existing tokens `--m-ink`, `--m-muted`, `--m-bad-ink`, `--m-focus`, so they inherit the earlier AA checks).

## Functionality checked in the browser
Calendar: create, edit and delete an event through the dialog (test event "AUDIT P6 event", deleted). My Tasks: quick filters (33 → 9 high priority → 1 due today → back), Filters panel, Board switch and its memory, quick add, status change by menu and by drag (test task "AUDIT P6 board card", deleted through the task page's Delete). Task page: edit description, change assignee. Knowledge: dialog open/cancel/Escape, edit pre-fill (no data changed). Automations tabs. Search deep link (`?q=design` → 17 results). Billing rendering (no checkout started). Language switch to German and back (the account's language was restored to "not set", as it was before).

## Tests (exact results, all run on 27 November 2026)
| Suite | Command | Result |
|---|---|---|
| Web lint | `npm run lint` (apps/web) | pass, 0 problems |
| Web type check | `npm run typecheck` (apps/web) | pass |
| Web unit | `npm test` (apps/web) | 193 / 193 pass |
| Web component (jsdom, axe) | `npm run test:components` | 59 / 59 pass (51 existing + 8 new in `component-tests/phase6.test.tsx`) |
| Web production build | `NEXT_DIST_DIR=.next-audit npm run build` | pass (output removed afterwards) |
| Web browser (e2e) | `npm run test:e2e` | 62 passed, 49 skipped (the skipped tests need a signed-in Clerk test user, which this environment does not have) |
| API type check | `npm run typecheck` (apps/api) | pass |
| API unit | scratch copy, `node --test test/*.test.mjs` | 329 / 329 pass |
| API integration | scratch copy, `aven_integration` database, `--test-concurrency=1` | 233 / 233 pass (was 232 / 233 before the calendar-sync test fix) |

New and changed tests: `component-tests/phase6.test.tsx` (single-page pager, task board columns/menu/locking with axe, assignee picker, in-place title/description editor including Escape and empty-title validation); `tests/relative-time.test.mjs` (relative times in en/de/fr/es, due-day labels); `tests/hardcoded-text.test.mjs` baseline 158 → 143.

**The flaky test.** "background sync: a due connection is synced…" asserted that `syncDue()` returned 0, but `syncDue()` processes every due connection in the database and the integration database is reused between runs, so leftovers from earlier runs became due (it returned 10). It could also fail the other way: with only a 6-minute "due" age, this test's connection could fall outside the 10-connection batch behind older leftovers. The service was correct; the test was not isolated. The test now checks its own connection's `lastSyncedAt` and failure count, and marks the connection as the longest-waiting before each run. It passed 3 times in a row on its own, and in the full run below.

## Remaining issues (and why)
- **Outside services are still unverified with real credentials** (Stripe checkout and webhooks, Gemini, Resend, Outlook, S3/R2, Tavily, embeddings, push): no live credentials were used, by instruction.
- **No message reactions and no calendar drag-to-move/resize**: new features rather than fixes; left out to avoid feature creep.
- **Clerk sign-in pages are English only**: hosted by Clerk; needs Clerk localisation configuration.
- **143 hard-coded strings remain**, mostly English fallback errors used only when a server sends no message (largest: `connected-databases.tsx`, the document editor, People, workspace switcher).
- **Settings sub-page tabs sit above each page's heading**: a deliberate section-menu pattern, left as is.
- **Task page while editing** shows the title and description above the open form (a brief duplicate while editing).
- **Board "Completed" column** lists every completed task; with hundreds it becomes long (no cap or "show more" yet).
- **README is still stale** about AI provider, OCR and meaning search (tracked as a NEXUS task); not changed in this phase.
- **Tested only in browser emulation**: no physical iPhone/iPad, no screen-reader session.

## Important files changed
- Calendar: `apps/web/app/workspace/connected-records.tsx`
- My Tasks and board: `apps/web/app/workspace/workspace-productivity.tsx`, `tasks/page.tsx`, `inbox/page.tsx`
- Task page: `tasks/[taskId]/components/task-edit-panel.tsx`, `task-summary.tsx`, `task-detail-header.tsx`, `task-detail-view.tsx`
- Knowledge: `knowledge/knowledge-hub.tsx`
- Automations: `automations/automations-workspace.tsx`
- Billing: `settings/billing-card.tsx`
- Search: `search/page.tsx`
- Relative time and Home: `relative-time.ts`, `home-dashboard.tsx`
- Whiteboards, Databases, Projects, Documents: `whiteboards/whiteboards-workspace.tsx`, `database-pager.tsx`, `connected-databases.tsx`, `projects/[projectId]/layout.tsx`, `projects/[projectId]/page.tsx`, `documents/[documentId]/page.tsx`
- Styles: `apps/web/app/design-system.css` (Phase 6 section at the end), `globals.css` (removed an obsolete rule)
- Translations: `apps/web/app/i18n/{en,de,fr,es}.ts`
- Tests: `apps/web/component-tests/phase6.test.tsx` (new), `apps/web/tests/relative-time.test.mjs`, `apps/web/tests/hardcoded-text.test.mjs`, `apps/api/test/integration/calendar-sync.test.mjs`

No API source, schema or migration changed.

## Data changed
- Created and deleted in the development workspace: calendar event "AUDIT P6 event" (created, edited, deleted) and task "AUDIT P6 board card" (created, moved, description and assignee changed, deleted). Verified afterwards: no tasks or events titled "AUDIT P6" remain.
- The account's interface language was switched to German for a translation check and restored to "not set".
- Browser-only: `localStorage` keys `aven:my-tasks-view` (set back to list) and `aven-theme` (set back to light) in the test browser.
- The integration and e2e suites use their own databases (`aven_integration`, and a throwaway `aven_e2e_*` that the runner drops).
- No emails, invitations, notifications, payments or external calendar changes were sent or made.

## Final assessment: **Beta-ready**
AVEN now reads as one product: the busiest screens lead with their content, creation and editing use one consistent dialog pattern, controls do what they say, and the sweep finds no dead controls or layout breaks across desktop, laptop, iPad and iPhone widths in light, dark and German. It is ready for real people to explore and use day to day in a beta. It is not "near production-ready" yet because the paid and outside-service paths (Stripe, AI provider, email, storage, Outlook) have never run against real credentials, the hosting, email and privacy decisions are still open, and the native apps and screen-reader experience have only been checked through emulation.
