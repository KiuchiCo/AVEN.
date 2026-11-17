# Section 01 · Application shell

**Status:** In progress  
**Suggested commit:** `feat: add responsive AVEN application shell`

**Visual direction:** Follow the shared [AVEN design system](../AVEN-DESIGN-SYSTEM.md), based on the warm ivory, sage, and spacious panel styling established in the product mockups.

## Goal

Create the first runnable AVEN interface: a responsive navigation rail, workspace switcher, dashboard landing page, and working navigation between the initial areas.

## Included

- AVEN name and product promise.
- Workspace switcher control.
- Navigation for Home, Inbox, Projects, Documents, Databases, Calendar, and Intelligence.
- Dashboard overview with a small set of example priorities and project activity.
- Responsive layout for narrow screens.
- Accessible buttons and navigation labels.

## Not yet included

Authentication, persistent user data, backend services, real project records, or AI execution. The current screen is a functional front-end starting point; module data will arrive in later sections.

## Files

- `index.html` — application structure and entry point.
- `styles.css` — responsive visual system and layouts.
- `app.js` — workspace, navigation, and dashboard interactions.

## Review checklist

- Open `index.html` in a browser.
- Select each navigation destination and confirm the selected state and page heading update.
- Use the workspace control and confirm its menu opens and closes.
- Check that the navigation remains usable at a narrow window width.
