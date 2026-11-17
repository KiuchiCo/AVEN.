# AVEN. · Design system

AVEN's interface follows the same visual direction as the product mockups: a warm, editorial workspace with an ivory canvas, quiet sage accents, considered typography, and clear, spacious panels. New sections should extend these tokens and patterns rather than introducing a separate visual style.

## Visual principles

- Use warm ivory for the application canvas and soft white for working surfaces.
- Use muted botanical greens for primary actions, selected navigation, and positive states.
- Keep borders low contrast and use spacing to distinguish groups.
- Give each page one clear heading and a small uppercase eyebrow for context.
- Keep charts, tables, and project controls calm and legible; reserve stronger colour for meaningful status.
- Use restrained shadows only where an element floats above the page, such as a menu or dialog.

## Core tokens

| Token | Value | Use |
| --- | --- | --- |
| Canvas | `#F6F4EE` | Main application background |
| Sidebar | `#FCFBF7` | Primary navigation surface |
| Surface | `#FFFEFA` | Cards, panels, menus |
| Ink | `#30342F` | Main text |
| Muted ink | `#898D84` | Supporting text and labels |
| Sage | `#66816A` | Primary actions and selected states |
| Deep sage | `#49664F` | Hover and emphasis |
| Soft sage | `#EEF2E9` | Selected navigation and quiet highlights |
| Border | `#EAE8E0` | Dividers and panel outlines |
| Warm accent | `#B59A72` | Occasional secondary emphasis |

## Type and layout

- Use Manrope for page headings and compact display values.
- Use DM Sans for navigation, labels, controls, and body copy.
- Keep headings medium weight with slightly tight tracking; use uppercase, letter-spaced eyebrows sparingly.
- Prefer generous page margins and consistent panel padding. On smaller screens, keep content readable and move navigation to a compact bottom bar.

## Shared patterns

- **Navigation:** quiet labels, a soft sage selected state, and simple line-like symbols.
- **Panels:** soft white surfaces, subtle warm borders, and clear internal spacing.
- **Primary action:** deep sage fill, white text, compact rounded corners.
- **Status:** use muted semantic colours and always pair colour with a label or icon.
- **Empty states:** explain what belongs in the area and offer one clear next action.

## Current implementation

The first dashboard shell uses these principles and the shared tokens in `styles.css`. Each new section brief should identify any additional component patterns while keeping the foundation palette and typography intact.
