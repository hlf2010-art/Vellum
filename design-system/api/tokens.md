<!-- Generated from tokens.json. Edit tokens.json, not this file. -->
# Tokens

Every token of the system, a section per group: Surfaces — 2 tokens; Fills and status backgrounds — 1 token; Palette ramps and brand — 33 tokens; Type styles, families, font files; Spacing — 8 tokens; Radius — 9 tokens; Shadow — 3 tokens.

## Color · Surfaces

### Use

```css
/* in a page’s CSS, in the light theme: the token’s name, with its value from the same row of the table below as the fallback, so the page draws whether or not it links tokens.css */
color: var(--canvas, #ecedf0);
/* a page in another theme: link or inline tokens.css, put data-theme="dark" on the element that wraps the page, and take each fallback from the dark column; where tokens.css cannot be linked, the value alone, from that theme’s column */
color: var(--canvas, #050608);
/* on a slide, in a chart’s options, or anywhere else var() cannot go, and in an SVG attribute such as fill, which not every browser reads var() in: the value alone, from the column of the theme it is in */
color: #ecedf0;
```

### Tokens (2)

| token | light | dark | usage |
| --- | --- | --- | --- |
| `--canvas` | #ecedf0 | #050608 | The board itself: the infinite canvas behind every card. Never put body text directly on it except hints in `label-3`. |
| `--canvas-lift` | #f8f8fa | #0a0b0e | Raised regions of the board: stage bays and lane backgrounds. |

## Color · Fills and status backgrounds

### Use

```css
/* in a page’s CSS, in the light theme: the token’s name, with its value from the same row of the table below as the fallback, so the page draws whether or not it links tokens.css */
color: var(--on-act, #ffffff);
/* a page in another theme: link or inline tokens.css, put data-theme="dark" on the element that wraps the page, and take each fallback from the dark column; where tokens.css cannot be linked, the value alone, from that theme’s column */
color: var(--on-act, #0a0b0d);
/* on a slide, in a chart’s options, or anywhere else var() cannot go, and in an SVG attribute such as fill, which not every browser reads var() in: the value alone, from the column of the theme it is in */
color: #ffffff;
```

### Tokens (1)

| token | light | dark | usage |
| --- | --- | --- | --- |
| `--on-act` | #ffffff | #0a0b0d | Text and icons on `act`. |

## Color · Palette ramps and brand

### Use

```css
/* in a page’s CSS, in the light theme: the token’s name, with its value from the same row of the table below as the fallback, so the page draws whether or not it links tokens.css */
color: var(--card, #ffffff);
/* a page in another theme: link or inline tokens.css, put data-theme="dark" on the element that wraps the page, and take each fallback from the dark column; where tokens.css cannot be linked, the value alone, from that theme’s column */
color: var(--card, #1b1c20);
/* on a slide, in a chart’s options, or anywhere else var() cannot go, and in an SVG attribute such as fill, which not every browser reads var() in: the value alone, from the column of the theme it is in */
color: #ffffff;
```

### Tokens (33)

| token | light | dark | usage |
| --- | --- | --- | --- |
| `--card` | #ffffff | #1b1c20 | Card faces, the open-card sheet (Margin) and solid menus. Primary text ground. |
| `--label` | #0b0c0e | #f4f5f7 | Primary text and icons on `card`, `card-2`, `canvas` and `chrome`. Card titles, button labels. |
| `--hair` | rgba(11,12,14,.075) | rgba(255,255,255,.07) | Hairline borders: inset rings on wells and segmented controls. |
| `--thread` | rgba(11,12,14,.2) | rgba(255,255,255,.16) | Wires between cards on the board (lineage links). |
| `--hover` | rgba(11,12,14,.045) | rgba(255,255,255,.055) | Hover fill for ghost buttons, menu rows and tool buttons; also the secondary button fill. |
| `--press` | rgba(11,12,14,.08) | rgba(255,255,255,.09) | Pressed fill for ghost buttons and menu rows. |
| `--chrome` | rgba(252,252,253,.8) | rgba(26,27,31,.78) | Floating glass UI over the board: composer, tool rail, toasts, menus, tooltips, review pill. Always with backdrop blur. |
| `--chrome-ink` | #0c0d0f | #f3f4f6 | Text on `chrome` surfaces when `label` is not used. |
| `--act` | #0c0d0f | #f3f4f6 | Primary action fill — the one decisive button (Send, Apply). Inverts per theme. |
| `--focus` | #3f444e | #c8ccd4 | Selection marquee and focus treatments on the board. |
| `--danger` | #e12f34 | #ff6369 | Destructive and Stop actions: Delete, Stop, the “suggests deleting” tint, struck words in a diff. Used as a 12–14% tint with the full colour as text, and solid only on hover. Light `#e12f34` is 4.5:1 on `card`, and white on it (the solid hover fill) is also 4.5:1. Deepened on 2026-11-17 from Lumen's `#e5484d` (3.9:1). Bring Lumen in line. Dark `#ff6369` is unchanged. |
| `--ok` | #247a50 | #30a46c | Success and healthy states: the connected-model dot in crew settings, and the 22% tint behind accepted words in a proposal diff. Used on `card`, `canvas` and `chrome`. Light `#247a50`: 5.3:1 on `card`, 4.9:1 on `card-2`, 4.5:1 on `canvas`. Dark `#30a46c`: 5.4:1 on `card`, 6.4:1 on `canvas`. The branch only uses `#30a46c` as a fallback (`var(--ok,#30a46c)`). Light was deepened on 2026-11-17 for contrast. |
| `--warn` | #a25904 | #d97706 | Caution states: the crew-on-built-in-rules dot in crew settings, and the “card changed since this was suggested” line on a proposal. Used on `card`, `canvas` and `chrome`. Light `#a25904`: 5.3:1 on `card`, 4.9:1 on `card-2`, 4.5:1 on `canvas`, so the 12px stale line now passes. Dark `#d97706`: 5.3:1 on `card`, 6.4:1 on `canvas`. The branch only uses `#d97706` as a fallback (`var(--warn,#d97706)`). Light was deepened on 2026-11-17 for contrast. |
| `--A` | #9f5a00 | #ffb547 | Lineage A — the first direction in a fork. Wires, chips, adopted rings, Reported evidence, Wright's progress, the first kanban column. Light is `#9f5a00`: 5.3:1 on `card`, 4.9:1 on `card-2` and 4.6:1 on `canvas`, so it's usable as text. Deepened on 2026-11-17 from Lumen's `#db7c00` (3.0:1). Bring Lumen in line. |
| `--B` | #2066db | #5aa2ff | Lineage B — the second direction. Also Proposal evidence, search hits and the Search mode. Light is `#2066db`: 5.3:1 on `card`, 4.9:1 on `card-2` and 4.5:1 on `canvas`, so it's usable as small text on all three. Deepened on 2026-11-17 from Lumen's `#2b6fe0`, which failed on `card-2` (4.4:1) and `canvas` (4.0:1). Bring Lumen in line. |
| `--C` | #0b7b50 | #45d49a | Lineage C — the third direction. Also Observed evidence, the Locked kanban column and live status dots. Light is `#0b7b50`: 5.3:1 on `card`, 4.9:1 on `card-2` and 4.5:1 on `canvas`, so it's usable as text. Deepened on 2026-11-17 from Lumen's `#0e9662` (3.8:1). Bring Lumen in line. |
| `--D` | #d93b72 | #ff6b95 | Lineage D — the fourth direction. A mark colour (wires, chip, adopted ring, error dot). Kept exactly as Lumen ships it: raw D as text is 4.4:1 on light `card`, so for text mix it toward ink like the other lineage hues. If an accessible variant is ever needed, `#d8346d` reaches 4.53:1 with the same hue. |
| `--chip-ink` | #ffffff | #0a0b0d | Letter on a lineage chip (A–D) — white in light, near-black in dark. White on light A, B and C chips passes at 5.3:1. White on D is 4.4:1, because D is kept as Lumen ships it (flagged). |
| `--light` | #ffffff | #f4f5f7 | 'Light is alive': the glow colour of working crew, live drafts and the review pulse dot. |
| `--bloom` | rgba(255,190,110,.5) | rgba(255,236,206,.55) | Warm glow around something the crew is working on or waiting on you for. Only as a soft shadow, never a fill. |
| `--crew-scout` | #1d4ed8 | #7ab3ff | Scout's ink (reads sources, weighs evidence). Avatar glyph and its tooltip icon. |
| `--crew-strategist` | #6d28d9 | #c4a5ff | Strategist's ink (forks a claim into testable directions). |
| `--crew-wright` | #b45309 | #ffb547 | Wright's ink (builds proofs: pages, decks, action lists). |
| `--crew-critic` | #047857 | #45d49a | Critic's ink (checks work against its sources). |
| `--orb-off` | #d9dade | #2a2b30 | An idle crew avatar's fill: unlit until that crew member is working. |
| `--note-butter` | #fce15d | #fce15d | Sticky note paper (butter tone, the default). Same in both themes. |
| `--note-ink` | #925600 | #925600 | The 6px dot in a sticky's tag, on `note-butter`. `#925600` reaches 4.52:1 on the paper, so it can also carry small text. Sticky body text is near-black ink at 88%. Same in both themes, like the paper. Deepened on 2026-11-17 from Lumen's `#9a5b00` (4.15:1). Bring Lumen in line. |

| ramp | step and value (light) | step and value (dark) |
| --- | --- | --- |
| `--card-*` | 2 #f5f6f8, 3 #ecedf1 | 2 #22242a, 3 #2a2c33 |
| `--label-*` | 2 rgba(11,12,14,.70), 3 rgba(11,12,14,.58), 4 rgba(11,12,14,.14) | 2 rgba(244,245,247,.68), 3 rgba(244,245,247,.52), 4 rgba(244,245,247,.11) |
| `--hair-*` | 2 rgba(11,12,14,.13) | 2 rgba(255,255,255,.12) |

## Type

Set text in one of the styles below: write its values from the Styles and Families tables, or, on a page that links or inlines tokens.css, prefer its variable, where the Styles table’s CSS column gives one.

### Use

```css
/* any surface: a style’s values from the Styles and Families tables */
font: 650 21px/25px "Inter Var", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif; letter-spacing: -0.022em;
/* a page that links or inlines tokens.css: prefer the variables, so that a change to tokens.css reaches the page */
font: var(--text-direction-title); letter-spacing: -0.022em;
font-family: var(--font-ui);   /* the family alone */
```

### Styles

| style | CSS | size / line, italic, letter spacing | weight | family | usage |
| --- | --- | --- | --- | --- | --- |
| `direction-title` | `.direction-title`, `--text-direction-title` | 21px / 25px, letter-spacing -0.022em | 650 | `ui` | Title of a Direction card (a lettered A–D proposal). |
| `idea-title` | `.idea-title`, `--text-idea-title` | 19px / 27px, letter-spacing -0.022em | 620 | `ui` | The claim on an Idea / Core Thesis card. |
| `card-title` | `.card-title`, `--text-card-title` | 17px / 22px, letter-spacing -0.022em | 600 | `ui` | Title of Source, Recording, Link and most other cards. |
| `note-text` | `.note-text`, `--text-note-text` | 15.5px / 24.5px, letter-spacing -0.01em | 470 | `ui` | Handwritten-feel text on a sticky note. |
| `body` | `.body`, `--text-body` | 14px / 20px, letter-spacing -0.006em | 400 | `ui` | Card body copy and default UI text. |
| `toast` | `.toast`, `--text-toast` | 13.5px / 1.35 | 550 | `ui` | Toast and inline notice messages. |
| `label` | `.label`, `--text-label` | 13px / 1 | 600 | `ui` | Button labels, menu commands, review pill. |
| `tooltip` | `.tooltip`, `--text-tooltip` | 12.5px / 1.45 | 400 | `ui` | Tooltips and helper copy. |
| `card-kind` | `.card-kind`, `--text-card-kind` | 12px / 16px, letter-spacing -0.002em | 550 | `ui` | The kind line at the top of every card, in `label-3`. |
| `meta` | `.meta`, `--text-meta` | 12px / 1.35 | 500 | `ui` | Card footers and timestamps, tabular numerals, in `label-3`. |
| `weight` | `.weight`, `--text-weight` | 11px / 1 | 560 | `ui` | Evidence-weight pill text. |
| `eyebrow` | `.eyebrow`, `--text-eyebrow` | 10.5px / 1, letter-spacing 0.04em | 600 | `ui` | Uppercase panel captions (minimap). The only uppercase style. |
| `chip` | `.chip`, `--text-chip` | 10px / 1 | 750 | `ui` | The letter inside a lineage chip. |
| `mono` | `.mono`, `--text-mono` | 12px / 1.3 | 500 | `mono` | URLs on link cards. |
| `mono-small` | `.mono-small`, `--text-mono-small` | 11px / 1.35 | 450 | `mono` | File paths and media timecodes. |

### Families

| family | CSS variable | stack |
| --- | --- | --- |
| `ui` | `--font-ui` | `"Inter Var", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif` |
| `mono` | `--font-mono` | `"Lumen Mono", ui-monospace, "SF Mono", Menlo, monospace` |

### Font files

`tokens.css` declares both fonts with `@font-face` and loads them from `fonts/` beside it. Link `tokens.css` and the fonts come with it.

| family | file | CSS |
| --- | --- | --- |
| Inter Var | `fonts/InterVariable.woff2` (weight 100–900) | `var(--font-ui)` |
| Lumen Mono | `fonts/GeistMono-Variable.woff2` (weight 100–900) | `var(--font-mono)` |

Both fonts are under the SIL Open Font License 1.1 (`fonts/LICENSE-*.txt`).

## Spacing

### Use

```css
/* any surface: a token’s value from the table below */
padding: 2px;
/* a page that links or inlines tokens.css: prefer the token’s name, so that a change to tokens.css reaches the page */
padding: var(--space-2);
```

### Tokens (8)

| token | value | usage |
| --- | --- | --- |
| `--space-2` | 2px | Gap between segmented-control buttons. |
| `--space-4` | 4px | Gap between tool-rail buttons. |
| `--space-6` | 6px | Default inline gap: icon to label, chips in a row, tool-rail padding, media inset inside a card. |
| `--space-8` | 8px | Gap between stacked composer parts and floating UI. |
| `--space-10` | 10px | Menu row and toast inner gaps. |
| `--space-12` | 12px | Card footer top spacing; header control padding. |
| `--space-16` | 16px | Screen gutter for all floating chrome; card top padding. |
| `--space-18` | 18px | Card inline padding (16px 18px 17px). |

## Radius

### Use

```css
/* any surface: a token’s value from the table below (--radius-chip: 5.5px) */
/* a page that links or inlines tokens.css: prefer var(--radius-chip), so that a change to tokens.css reaches the page */
```

### Tokens (9)

| token | value | usage |
| --- | --- | --- |
| `--radius-chip` | 5.5px | Lineage chip (18px square). |
| `--radius-sm` | 10px | Action-strip buttons, link wells, selection marquee. |
| `--radius-md` | 12px | Project switcher, tooltips. |
| `--radius-media` | 14px | Images and video inside a card (6px inset); menu rows. |
| `--radius-control` | 16px | 44px square controls: Send, Add, Mic; review popover. |
| `--radius-card` | 20px | Every card on the board. |
| `--radius-field` | 22px | Composer field. |
| `--radius-sheet` | 28px | Open-card sheet (Margin) and dialogs. |
| `--radius-pill` | 999px | Pills: tool rail, review pill, evidence weight, mode chip, zoom control. |

## Shadow

### Use

```css
/* any surface: a token’s value from the table below (--shadow-card: 0 0 0 .5px rgba(11,12,14,.07), 0 1px 1px rgba(11,12,14,.03), 0 2px 4px -1px rgba(11,12,14,.04), 0 12px 28px -16px rgba(11,12,14,.16) in the light theme; the table gives its value in the others) */
/* a page that links or inlines tokens.css: prefer var(--shadow-card), so that a change to tokens.css, or a change of theme, reaches the page */
```

### Tokens (3)

| token | value | usage |
| --- | --- | --- |
| `--shadow-card` | 0 0 0 .5px rgba(11,12,14,.07), 0 1px 1px rgba(11,12,14,.03), 0 2px 4px -1px rgba(11,12,14,.04), 0 12px 28px -16px rgba(11,12,14,.16) · dark: 0 0 0 .5px rgba(255,255,255,.06), inset 0 1px 0 rgba(255,255,255,.035), 0 14px 34px -16px rgba(0,0,0,.8) | Resting card on the board. |
| `--shadow-card-up` | 0 0 0 .5px rgba(11,12,14,.08), 0 2px 3px rgba(11,12,14,.04), 0 8px 16px -6px rgba(11,12,14,.08), 0 34px 64px -28px rgba(11,12,14,.28) · dark: 0 0 0 .5px rgba(255,255,255,.09), inset 0 1px 0 rgba(255,255,255,.05), 0 34px 70px -24px rgba(0,0,0,.9) | Hovered or dragged card; the open-card sheet. |
| `--shadow-chrome` | 0 0 0 .5px rgba(11,12,14,.08), 0 1px 2px rgba(11,12,14,.04), 0 12px 32px -14px rgba(11,12,14,.24) · dark: 0 0 0 .5px rgba(255,255,255,.07), 0 14px 40px -14px rgba(0,0,0,.85) | Floating glass chrome: composer, tool rail, toasts, menus. |
