# AVEN. · Design system

AVEN uses a premium editorial interface: warm ivory backgrounds, white paper-like surfaces, charcoal text, quiet bronze accents, elegant serif headings, and readable sans-serif controls. The supplied dashboard, document, database, calendar, project, and Intelligence concepts share this visual language. Build from that shared language without copying screenshot artifacts or fictional production data.

## Visual principles

- Keep the canvas warm and the working surfaces light.
- Use charcoal for primary actions and navigation emphasis; reserve bronze for brand details and selected emphasis.
- Use green, amber, red, and blue as semantic status colours, paired with labels or icons.
- Set page titles in an editorial serif and dense controls in a clear sans-serif.
- Use spacious layouts, subtle borders, and restrained shadows instead of stacked decoration.
- Use mountain-haze artwork as a quiet contextual accent on overview pages, not as a background behind dense data.
- Keep the persistent navigation clear and let each module provide its own contextual navigation.
- Label sample content as preview data and replace it with persisted records in functional views.

## Colour tokens

| Token | Value | Use |
| --- | --- | --- |
| Ivory | `#F8F6F1` | Application canvas |
| Paper | `#FFFFFF` | Cards and work surfaces |
| Sand | `#E9E3D9` | Selected navigation and subtle grouping |
| Taupe | `#D2C7B9` | Soft borders and neutral emphasis |
| Bronze | `#A48766` | AVEN wordmark accent and warm highlights |
| Umber | `#6B5746` | Secondary warm emphasis |
| Charcoal | `#2B2A27` | Primary text and primary controls |
| Ink | `#111111` | Strong text and display headings |
| Muted text | `#77766E` | Supporting copy and metadata |
| Border | `#DCD9D0` | Dividers and outlines |
| Success | `#34765A` | Positive task and project status |
| Warning | `#C18A42` | At-risk and approaching deadlines |
| Error | `#B95353` | Errors and blocked status |
| Information | `#567BA8` | Informational status |

Use CSS custom properties for these values. Do not introduce one-off colours when a semantic token fits.

## Typography

- **Display and page headings:** Playfair Display, with Georgia as a local fallback.
- **Interface and body:** Inter, with system sans-serif fallbacks.
- Use serif type selectively for page titles, editorial panels, and prominent briefing headings.
- Use sans-serif type for navigation, forms, tables, buttons, and dense content.
- Keep control text readable at 14–16px, metadata at 11–12px, and use uppercase letter-spaced labels sparingly.

## Geometry and layout

- Base spacing unit: 4px. Prefer 8, 12, 16, 24, and 32px increments.
- Expanded sidebar: about 252px; collapsed sidebar: about 68px.
- Top navigation: about 60px.
- Standard cards: 12px radius; large panels: 18px radius.
- Standard controls: 38–42px high with visible focus states.
- Use soft, low-contrast outlines and shallow shadows for floating surfaces only.

## Shared patterns

- **Primary action:** charcoal fill, white label, compact rounded corners.
- **Selected navigation:** warm sand fill with charcoal text.
- **Status:** semantic tint, concise label, and optional icon.
- **AI panel:** bronze spark detail, restrained copy, clearly described actions, and visible context.
- **Dashboard:** answer what needs attention today, then provide quick access to projects and recent work.
- **Empty state:** explain what belongs in the area and give one clear next action.

## Themes

Light mode is the default. Define semantic tokens so a future dark theme can change surface and text values without changing component structure. Dark mode is built: Settings → Appearance offers light (default), dark, or matching the device, and the choice applies before the first paint.

## Current implementation

The static dashboard is a visual prototype. It uses sample figures and names for layout exploration; those values are not live workspace data. Its palette and typography now follow these tokens; the framework migration will replace the static prototype with reusable application components.

## Reference images

The UI reference screens are not in the repository. They live in `/Users/Business/Desktop/AVEN. UI/` (20 images: Analytics, Automations, Calendar, Documents, Intelligence, Knowledge, My Tasks, People, Project Templates, Task Board (two), Task Labels, Inbox, Whiteboards, Workspace Dashboard, Database, Projects, Files, Messaging, Activity). There is no reference for Settings or the account-data screens, so those follow the existing settings cards and the tokens above.
