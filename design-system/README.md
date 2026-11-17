# Vellum Design System

The design language of **Vellum Lumen** (`Vellum-Lumen.html` in this repo) for the designers and product managers who make Vellum screens, flows and specs. It covers the voice, the colour, type, spacing and shape tokens, the icons, and 14 live components.

> **Open the gallery:** [`index.html`](index.html) shows every component in light and dark. Clone the repo and open the file in a browser. Each component also has its own page at `components/<Name>/preview.html`.

The colours here are the same ones the app uses (`main@285e8f6`). Every text colour meets WCAG AA (4.5:1) on the surfaces its token note names.

## What's in this folder

| Path | What it is |
| --- | --- |
| [`index.html`](index.html) | Gallery of every component, with a light/dark switch |
| [`tokens.json`](tokens.json) | Every token with its light and dark value and a usage note. This is the source of truth. |
| [`tokens.css`](tokens.css) | The same tokens as CSS custom properties, plus `@font-face` for the fonts |
| [`api/tokens.md`](api/tokens.md) | Readable token reference |
| [`components/`](components) | `bundle.js` (React components on `window.Vellum`), `bundle.css`, `index.d.ts`, and a guideline `README.md` and `preview.html` for each component |
| [`api/components/`](api/components) | Props reference for each component |
| [`fonts/`](fonts) | Inter and Geist Mono (SIL Open Font License 1.1, licences included) |
| [`assets/`](assets) | The app mark, 21 line icons and sample card images (demo content only) |

## Using it

- **Designers:** take colours and type from `tokens.json` or `api/tokens.md`, using the token names, never raw hex values. Follow the guidelines below and each component's `components/<Name>/README.md`.
- **In a page or prototype:** link `tokens.css`, then `components/bundle.css`. Load React 18 and ReactDOM 18, then `components/bundle.js`. Render with `Vellum.Card`, `Vellum.Button` and so on. Wrap everything in `Vellum.Root`. Set `data-theme="dark"` on `<html>` for dark mode.

```html
<link rel="stylesheet" href="design-system/tokens.css">
<link rel="stylesheet" href="design-system/components/bundle.css">
<script src="https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
<script src="design-system/components/bundle.js"></script>
```

- **Changing a token:** edit `tokens.json`, then run `python3 scripts/sync_tokens.py` to rewrite `tokens.css` (`--check` fails if they differ, for CI). Update the matching variable in `Vellum-Lumen.html`, and keep the usage note's contrast figures true.
- **Changing a component's props or a token's usage:** edit `components/index.d.ts` or `tokens.json`, then run `python3 scripts/build_api.py` to regenerate `api/` (`--check` for CI).

---

Vellum is a thinking board. Sources, claims and lettered directions sit as cards on one canvas. A small AI crew (Scout, Strategist, Wright, Critic) reads, forks, builds and checks alongside you. This system is for the designers and product managers who make Vellum screens, flows and specs: what Vellum looks like, how it talks, and which piece to use where.

**The one-line rule:** the canvas is quiet and the work is loud. Neutral greys and glass hold the space. Colour is used only to show lineage (A–D), evidence and who on the crew is working.

## Core concepts (use these words)

| Term | Means | Never call it |
| --- | --- | --- |
| **Board** | One infinite canvas for one project. Each board is laid out in four **stages**: Gather → Explore → Prototype → Snapshot. | page, file, workspace |
| **Card** | Anything on the board. Evidence: Source, Recording, Image, Frame, Audio, Link, Notepad. Thinking: Idea (Core Thesis), Synthesis, Direction, Question, Note (sticky). Building: Proof, Action list, Kanban. Decided: Snapshot. Plus Group. | node, block, tile |
| **Proof** | A working page or deck Wright builds from an adopted direction. It lists the sources it was built from. | prototype, mock |
| **Snapshot** | A numbered, frozen edition of a proof (“No. 1 of proof v2”). | print, export, version |
| **Direction** | A lettered proposal (A, B, C, D) forked from a claim. Each one comes with a test it could fail. | option, variant |
| **Lineage** | Which direction a card or wire belongs to. Shown by its letter colour, `A`–`D`. | branch colour |
| **Crew** | The four AI collaborators, shown as avatar orbs at the top right. | bots, agents (in UI copy) |
| **Evidence weight** | How much a source can carry: **Observed**, **Reported**, **Proposal**, **Illustration**. | confidence score |
| **Margin** | The sheet a card opens into, where you read and write in full. | modal, detail view |
| **Draft / waiting** | Crew work waiting for your decision: **Keep** · **Retry** · **Discard**. | suggestion queue |
| **Proposal** | A change the crew suggests to a card you already kept (edit, delete or link). You **Accept** or **Decline** it on the card. | auto-edit, fix |
| **Lock** | Only you can change a locked card, or any kept card in a locked lane. | freeze, protect |
| **Task Island** | The live status pill at the top centre for long-running crew work. | progress bar, spinner |

## Content fundamentals

- **Sentence case everywhere.** Use “Upload file or media”, not “Upload File”. The only uppercase style is `eyebrow` (e.g. OVERVIEW on the minimap).
- **Speak plainly, to “you”.** The composer invites *“Write an idea, or / for commands”*. Crew work names who did it and what, then counts it: *“**Strategist** · 1 direction”*, *“Scout suggests an edit”*.
- **Agents suggest, you decide.** The crew never silently changes or deletes a card you kept. Its work arrives as a draft, and its changes arrive as proposals. Copy must say who is suggesting what (*“Critic suggests deleting this card”*) and leave the decision to the person.
- **Decisions are verbs, never OK/Cancel.** Real examples: **Keep** · **Retry** · **Discard** · **Accept** · **Decline** · **Review** · **Fit**.
- **Counts, not adjectives.** *“1 waiting”*, *“1 draft”*, *“5/7 rated”*, *“2 notes · 5:44 AM”*. Use tabular numerals (`meta`).
- **Middle dot `·` joins facts.** It separates kind and source (*“MD · Playtest Telemetry”*), actions in hints (*“Double-click canvas to add a sticky · Drag card O port to connect · Drop files anywhere”*) and a label from its shortcut in tooltips (*“Lasso select · S”*, *“Undo · ⌘Z”*).
- **Every tool tooltip carries its keyboard shortcut.** Every icon-only button has an `aria-label`.
- **No emoji, no exclamation marks, no marketing adjectives.** Honesty beats hype. The crew shows what it doubts: evidence weight is always visible on sources, and unrated evidence is counted, never hidden.
- **Directions are claims with a test.** Write them as *title + one sentence + “Test:” line*, e.g. *“Isolate one retry. Retry the failed check alone first… Test: run with 3 creators; pass if 2 identify it.”*

## Visual foundations

### Colour
- **Ground:** the board is `canvas`. Cards are `card`. Inset wells inside a card (URLs, paths, segmented controls) are `card-2`, and pressed wells are `card-3`.
- **Text:** `label` for titles and labels, `label-2` for body copy, `label-3` for kind lines, meta and timestamps. `label-4` is for disabled glyphs only.
- **Lineage:** `A` amber, `B` blue, `C` green, `D` rose. They colour wires, chips, adopted-card rings and evidence pills. They are **mark colours**. For text and evidence marks, the hue is mixed 92% with black in light (Lumen used 78% before the light hues were deepened) or 86% with white in dark. Don't mix them darker: the light hues already pass on their own. Never paint a whole card in a lineage colour (the Snapshot is the one exception, below). Use a 1.5px ring plus a soft glow (adopted) instead.
- **Evidence reuses lineage hues:** Observed = `C`, Reported = `A`, Proposal = `B`, Illustration = neutral. Each pill always shows its word *and* a mark (bars or a picture icon), so evidence never relies on colour alone.
- **The Snapshot is the one card painted in lineage colour:** a radial gradient of its hue, with white text. It is reserved for decided, numbered editions.
- **Crew inks:** `crew-scout`, `crew-strategist`, `crew-wright`, `crew-critic` are for crew avatars and their tooltip icons only. An idle crew member is unlit (`orb-off`). A working one glows warm (`light` + `bloom`): **light means alive**.
- **Action:** the single decisive button uses `act`/`on-act`. This is a near-black pill in light and near-white in dark, never a brand blue. `danger` is a 14% tint and turns solid on hover; words on a red tint or on translucent chrome use `danger-ink` (Stop, Delete, struck words in a diff).
- **Sticky notes** are the one warm paper object: `note-butter` with `note-ink`.
- **Status:** `ok` (connected, accepted) and `warn` (built-in rules, stale proposal) are mark colours for dots and tints. `danger` marks destructive proposals and actions.

### Type
- One family: **Inter** (`--font-ui`, served as “Inter Var”, optical sizing on), with **Geist Mono** (“Lumen Mono”, `--font-mono`) for URLs, paths and timecodes only.
- **One scale, 19 styles, 11 sizes:** 10 · 11 · 12 · 13 · 14 · 16 · 17 · 19 · 21 · 28 · 46. Nothing else. Each style is a token (`--text-body`, used as `font: var(--text-body)`) and a class (`.body`).
- Body is `body` (14/20, −0.006em); long reading is `body-lg` (16/24). Card titles go tighter and heavier the more decisive the card: `card-title` 600/17 → `idea-title` 620/19 → `direction-title` 650/21, all at −0.022em.
- **Floors:** 12px for anything that carries meaning (meta, evidence weight, tooltips); 11px (`caption`, `eyebrow`) for badges and counts in Latin only; 10px for the single chip glyph.

| Style | Size / leading | Weight | Use |
| --- | --- | --- | --- |
| `display` | 46/1 | 700 | Snapshot edition number (“No |
| `heading` | 28/34 | 650 | Page and dialog headings, empty-state titles |
| `direction-title` | 21/25 | 650 | Title of a Direction card (a lettered A–D proposal) |
| `idea-title` | 19/27 | 620 | The claim on an Idea / Core Thesis card, and Question cards |
| `card-title` | 17/22 | 600 | Title of Source, Recording, Link, Notepad, Group and most other cards |
| `note-text` | 16/24 | 470 | Handwritten-feel text on a sticky note |
| `body-lg` | 16/24 | 400 | Long reading: Margin sheet body, notepad text, onboarding copy |
| `body` | 14/20 | 400 | Card body copy and default UI text |
| `toast` | 14/20 | 550 | Toast and inline notice messages |
| `label` | 13/1 | 600 | Button labels, menu commands, review pill |
| `tooltip` | 12/18 | 400 | Tooltips and helper copy |
| `card-kind` | 12/16 | 550 | The kind line at the top of every card, in `label-3` |
| `meta` | 12/16 | 500 | Card footers and timestamps, tabular numerals, in `label-3` |
| `weight` | 12/1 | 560 | Evidence-weight pill text |
| `caption` | 11/14 | 500 | The smallest readable text: media badges, counts in pills, kbd hints |
| `eyebrow` | 11/1 | 600 | Uppercase panel captions (minimap) |
| `chip` | 10/1 | 750 | The letter inside a lineage chip |
| `mono` | 12/1.3 | 500 | URLs on link cards, elapsed time |
| `mono-small` | 11/1.35 | 450 | File paths and media timecodes |

- Odd weights (470, 550, 560, 620, 650) are intentional. Keep them exact: the variable font renders them.
- **Chinese (zh):** the font stack falls back to PingFang SC, Hiragino Sans GB, Noto Sans SC and Microsoft YaHei, because Inter has no CJK glyphs. Under `:lang(zh)`, tracking is 0 (the negative tracking above is for Latin only), titles use 1.45 leading and body text 1.6, and no Chinese text is smaller than 12px. Keep `<html lang>` in step with the UI language so these rules apply.

### Space and layout
- Floating chrome keeps a `space-16` gutter from the window edge. Cards pad `space-16` top and `space-18` sides. Media sits inset `space-6` inside a card with `radius-media`.
- Default card widths: 240 (sticky), 280 (frame), 320 (source, image, audio, link, question, action list, snapshot), 360 (idea, synthesis, direction, recording, proof), 380 (notepad), 540 (kanban). Groups size to their contents.
- Fixed screen layout: project switcher top left · **Task Island** top centre · review pill, crew seats, crew settings, model pill and system settings top right · tool rail on the left edge, vertically centred · minimap bottom left · composer bottom centre (max 640px wide), with the draft bar floating just above it.

### Sizing and layering
- **Control heights:** `size-xs` 20 (evidence pill, inline chips) · `size-sm` 28 (dense bars: toasts, draft bar, proposal bars, segmented controls) · `size-md` 32 (default buttons and menu rows) · `size-lg` 36 (round chrome: tool rail, composer controls, crew seats, Task Island). On touch screens, give anything tappable a hit area of at least `size-touch` 44 (an invisible `::before` when the visible control is smaller). On desktop the floor is 24.
- **Icons:** `icon-xs` 12 · `icon-sm` 14 (in buttons) · `icon-md` 16 (default) · `icon-lg` 20 (composer, empty states).
- **Spacing:** 2 · 4 · 6 · 8 · 10 · 12 · 16 · 18 inside components, then 20 · 24 · 32 for sections and sheets.
- **Layers:** `z-card` 1 · `z-wire` 5 · `z-chrome` 30 · `z-popover` 50 · `z-dialog` 60 · `z-toast` 70 · `z-tooltip` 80. Never write a raw z-index.

### Shape
- Radii grow with the size of the object: `radius-xs` 6 (kbd, tiny inset) · `radius-chip` 5.5 → `radius-sm` 10 → `radius-md` 12 → `radius-media` 14 → `radius-control` 16 → `radius-card` 20 → `radius-field` 22 → `radius-sheet` 28. Pills use `radius-pill`. Where supported, sheets, menus and strips use `corner-shape: squircle`.

### Elevation and glass
- **Content is opaque, controls are glass.** Cards use `card` + `shadow-card`, and lift to `shadow-card-up` on hover or drag (scale 1.02 while dragging).
- Floating chrome is `chrome` + `shadow-chrome` + `backdrop-filter: blur(22–30px) saturate(1.3–1.4)`. Surfaces you read or type into (composer, draft bar, Task Island) are near-opaque (90–95%) with a light blur and an inner top highlight, so text stays crisp. When reduced transparency is on, all chrome falls back to solid `card`.
- No borders on cards. Separation comes from hairline rings in the shadow (`.5px`) and from `hair` / `hair-2`.

### Motion
- Durations: `duration-press` 90ms, `duration-quick` 150ms (hover and colour), `duration-base` 240ms, `duration-spring` 410ms, `duration-slow` 600ms. Easing: `easing-standard` `cubic-bezier(.22,.8,.24,1)`.
- Springs, used sparingly: *snappy* (0.41s) for chips appearing, *bouncy* (0.75s) for buttons, toasts and menus rising, *smooth* (0.59s) for layout shifts.
- Press feedback is a scale: buttons go to `.92–.95`, tool buttons to `.93`.
- A slow rotating light arc (3.5s) traces the composer and the active tool while the crew works. The review dot beats three times when new work arrives, then holds still. A loading card gets one soft light sweep per cycle; nothing else loops. Respect reduced motion: drop the arc and the springs.

### States
- Hover: `hover` fill. Pressed: `press` fill + scale.
- Selected tool: a raised `card` disc with the light arc.
- Focus: `ring-width` 2.5px solid `focus` outline, `ring-offset` 3px. Selected cards take the same ring.
- Disabled: `label-3` text on a `hover` fill (`label-4` is for glyphs only).
- Loading: keep the label, add a spinner (`Button loading`) or the card sweep (`Card state="loading"`), and set `aria-busy`.
- Error: say it inline where it happened, in `danger-ink`, with what was kept and a **Retry** (`Card state="error"`, `Toast tone="error"`, a failed `TaskIsland` row). Never a modal for a crew failure.
- State is never colour alone: crew states add a ring or a dot, evidence adds bars, errors add an icon.
- Disliked direction: dimmed. Adopted direction: lineage ring + glow.

## Iconography
- **Icons:** Vellum's own inline SVG line icons (card kinds too: notepad, video, image, frame, audio, link, group) on a 24×24 grid. They use `stroke: currentColor`, stroke width 1.65 (2–2.2 inside the composer), round caps and joins, and no fills. They render at 16px, or 19px in the composer. They are drawn in the Lucide idiom but are Vellum's own paths. The **Icons** asset group holds the canvas tools, composer controls and crew glyphs, exported with `label` ink (#0B0C0E) or each crew ink.
- **Crew glyphs** (in avatar orbs): Scout = compass, Strategist = forking branches, Wright = stacked blocks, Critic = balance scale.
- **Logo:** [`assets/Logos/vellum-mark.svg`](assets/Logos/vellum-mark.svg) is the app mark: a dark rounded tile with a white beam split by a prism into the four lineage colours. In product chrome, the project switcher shows a spectrum tile (conic gradient of the spectrum) at 22px with a 7px radius. Never recolour the mark or redraw the prism.
- No emoji in UI. Letters A–D are text inside `LineageChip`, never icons.

## Components

| Component | Use it for |
| --- | --- |
| `Card` | Every object on the board, in 17 kinds, with selected, loading, error, lock and crew-proposal states. |
| `LineageChip` | The A–D letter that ties a card or wire to a direction. |
| `EvidenceWeight` | How much a source can carry. |
| `CrewMark` | A crew member's avatar orb, idle or working. |
| `Button` | Decisions: primary (`act`), secondary, ghost, danger; sizes sm/md/lg, loading and icon-only. |
| `ReviewPill` | “N waiting”: crew work that needs your decision. |
| `ToolRail` | The vertical canvas tool palette. |
| `Composer` | One calm row to write an idea or a `/` command. |
| `Toast` | A one-line notice, optionally with **Undo**. |
| `DraftBar` | Crew draft waiting on you: Discard · Retry · Keep. |
| `TaskIsland` | Live status for long-running crew work, top centre: running, queued, done and failed tasks. |
| `CrewBar` | Crew seats, crew settings button and model pill. |
| `CrewSettings` | How much the crew may say and do, and locked lanes. |
| `CardMenu` | A card's right-click menu: ask, open, lock, duplicate, hide, archive, delete. |
