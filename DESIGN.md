# Design rules

How the three Desk pages (Competitor Overview, Competitor Detail,
Competitor Comparison) are styled. These rules come from two sources:

- the `frappe-ui` design tokens (kept locally, untracked, under
  `docs/design/frappe-ui-reference/` — see `tailwind/tokens/` and
  `tailwind/tokens.js` there), and
- the stylesheets Frappe ships in the bench (`apps/frappe/frappe/public/scss/`:
  `common/css_variables.scss`, `desk/css_variables.scss`, `desk/dark.scss`,
  `espresso/_colors.scss`, `_typography.scss`, `_borders.scss`, `_shadows.scss`).
  Where the two differ, **Frappe's installed variables win**, because that is
  what actually renders on the Desk.

The HTML mockups in `docs/design/*.html` are the visual targets.

## 1. Never hardcode a theme colour

Desk has a light and a dark theme (`<html data-theme="light|dark">`). Frappe
redefines its CSS variables under `[data-theme="dark"]`, so a page that uses
the variables follows the theme for free, and a page that uses `#fff` or
`#111827` is unreadable in dark mode.

For **backgrounds, borders and text** always use a variable, never hex, `rgb()`,
`hsl()` or `oklch()`.

| Purpose | Variable |
| --- | --- |
| Card / panel / input surface | `--card-bg` (or `--fg-color`); popovers: `--popover-bg` |
| Page background | `--bg-color` |
| Subtle strip (table header, row hover) | `--subtle-accent`, `--fg-hover-color` |
| Track / well / chip fill | `--control-bg`, `--subtle-fg` |
| Border or divider | `--border-color` (stronger: `--dark-border-color`) |
| Heading / value text | `--heading-color` |
| Body text | `--text-color` |
| Secondary text / labels | `--text-muted` |
| Tertiary text / placeholders / timestamps | `--text-light` |
| Link / active tab | `--ink-blue-link` (`--ink-blue-3` for non-link accents) |
| Positive text / negative text | `--ink-green-3` / `--ink-red-4` |
| Primary (inverted) fill, e.g. active chip | `--btn-primary` with `--fg-color` text |

Status badges use Frappe's paired tokens, never custom tints:

| Badge | Background | Text |
| --- | --- | --- |
| red | `--bg-red` | `--text-on-red` |
| green | `--bg-green` | `--text-on-green` |
| amber | `--bg-orange` | `--text-on-orange` |
| blue | `--bg-blue` | `--text-on-blue` |
| purple | `--bg-purple` | `--text-on-purple` |
| gray | `--bg-gray` | `--text-on-gray` |

The small status dot inside a badge uses the palette step `--red-600`,
`--green-600`, `--amber-600`, `--blue-600`, `--purple-600`, `--gray-600`.

Allowed exceptions (these are data, not theme chrome):

- **Series/avatar colours** in JS arrays (chart series, company avatar
  backgrounds). They must read on both themes and are paired with white text.
- **Company logo backing** (`#fff`) so transparent logos stay legible.
- **Chart colours** passed to `frappe-charts`.
- Shadows (`box-shadow`) — prefer `--shadow-sm` / `--shadow-md` for new code.

## 2. Typography

- Family: `var(--font-stack)` (Inter Variable). Comparison page mixes in
  monospace only for small numeric/eyebrow labels.
- Sizes: Frappe's scale is `--text-tiny` 11px, `--text-xs` 12px,
  `--text-sm` 13px, `--text-base` 14px, `--text-lg` 16px, `--text-xl` 18px,
  `--text-2xl` 20px. Body copy on these pages is 13px; table/meta text 12px;
  captions 11px; card titles 13–14px; page titles 19–20px.
- Weights: regular 420, medium 500, semibold 600. No bold/black for UI text.
  Labels are medium, values and headings semibold.
- frappe-ui tracks small text slightly open (`0.01–0.02em`) and large titles
  slightly tight (`-0.01em`); keep large numbers tabular
  (`font-variant-numeric: tabular-nums`).

## 3. Shape, spacing, elevation

- Radius: frappe-ui radius scale is 4 / 5 / 6 / 8 / 10 / 12 / 16 / 20px,
  pill = 100px. Frappe Desk exposes `--border-radius-tiny` 4,
  `--border-radius-sm`/`--border-radius` 8, `--border-radius-md` 10,
  `--border-radius-lg` 12, `--border-radius-full` 999px. Cards 8px, popovers
  and dropdowns 10px, controls/chips 6–8px, badges and filter chips pill.
- Spacing: Frappe's `--padding-*`/`--margin-*` steps are 5 / 7 / 15 / 20 / 30 /
  40px (xs … 2xl). Pages use a 15px horizontal gutter; card padding 13–16px
  vertical, 16px horizontal; gaps between cards 12–14px.
- Elevation: cards are flat (1px border, no shadow). Only floating layers
  (dropdowns, popovers, date/metric panels) get a shadow.
- Borders are always 1px solid `--border-color`; the only 2px border is the
  active-tab underline.

## 4. Components

- **Card**: `--card-bg`, 1px `--border-color`, 8px radius; header row with a
  bottom divider and a semibold 13.5px title.
- **KPI tile**: muted 12px label above a 22px semibold value in
  `--heading-color`.
- **Badge**: pill, 11–12px medium, paired bg/text tokens from the table above,
  leading 6px dot.
- **Tabs**: transparent buttons, `--text-muted`; active tab gets
  `--ink-blue-link` text and a 2px bottom border in the same colour.
- **Table**: header on `--subtle-accent` with muted 11.5px medium text; rows
  divided by `--border-color`; hover `--fg-hover-color`.
- **Empty state**: centred, muted icon in a `--control-bg` circle, medium
  title in `--text-muted`, 12px hint in `--text-light`.
- **Filter chip**: pill with 1px border; active state inverts
  (`--btn-primary` background, `--fg-color` text).

## 5. Behaviour

- Pages must render correctly in both themes. Check by toggling
  *User menu → Toggle Theme* (or `document.documentElement.setAttribute
  ('data-theme', 'dark')`) and reloading the page.
- Styling changes are CSS-only; do not alter markup or logic as part of a
  restyle.
