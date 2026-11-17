# Section 1.6 · Authenticated product shell

**Status:** Ready for review  
**Suggested commit:** `feat: build authenticated AVEN workspace shell`

## Goal

Give a signed-in user a real AVEN workspace surface with responsive navigation and the visual language of the mockups. Keep the preserved static design preview accessible while the product modules are implemented in later sections.

## Included

- Shared authenticated workspace layout with AVEN branding, current workspace details, user menu, sidebar, breadcrumb, and create menu.
- Responsive navigation drawer for small screens, visible keyboard focus states, and reduced-motion handling.
- Working routes for Home, Inbox, Tasks, Projects, Documents, Calendar, Databases, Intelligence, and Activity.
- Home screen uses the signed-in user's name and API-backed personal workspace.
- Empty states state which features are not connected yet; no sample tasks, events, projects, or AI insights are displayed as live content.
- The original static mockup remains available at `/prototype.html`.

The Create menu navigates to each section; it does not create records yet. Record creation is part of the later project/task workflow.

## Review checklist

- `npm run build`, `npm run typecheck`, and `npm run lint` pass.
- Navigation items open the correct section and expose the active item with `aria-current`.
- The mobile navigation can be opened and closed with an accessible button.
- The signed-in account and workspace name come from the authenticated session bootstrap response.
- No dashboard metrics, activity, or records are fabricated.
- `/prototype.html` still serves the visual reference.

Build, typecheck, lint, and `git diff --check` passed on 17 November 2026. The authenticated interface needs Clerk development keys and PostgreSQL to verify in a browser.
