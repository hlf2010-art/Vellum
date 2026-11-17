<!-- Generated from tokens.json by scripts/build_api.py. Edit tokens.json, not this file. -->
# Tokens

Every token, one section per family. In CSS use `var(--name)`; type styles are also shorthands (`font: var(--text-body)`) and classes (`.body`).

## Colour

| token | light | dark | usage |
| --- | --- | --- | --- |
| `--canvas` | #ecedf0 | #050608 | The board itself: the infinite canvas behind every card. Never put body text directly on it except hints in `label-3`. |
| `--canvas-lift` | #f8f8fa | #0a0b0e | Raised regions of the board: stage bays and lane backgrounds. |
| `--card` | #ffffff | #1b1c20 | Card faces, the open-card sheet (Margin) and solid menus. Primary text ground. |
| `--card-2` | #f5f6f8 | #22242a | Inset wells inside a card: link URLs, file paths, audio bars, segmented controls. |
| `--card-3` | #ecedf1 | #2a2c33 | Deepest inset and pressed wells inside a card. |
| `--label` | #0b0c0e | #f4f5f7 | Primary text and icons on `card`, `card-2`, `canvas` and `chrome`. Card titles, button labels. |
| `--label-2` | rgba(11,12,14,.70) | rgba(244,245,247,.68) | Secondary text on `card` and `chrome`: card body copy, idle tool icons, tooltips. |
| `--label-3` | rgba(11,12,14,.58) | rgba(244,245,247,.52) | Tertiary text on `card`, `card-2`, `card-3` and `canvas`: card kind line, timestamps, meta, eyebrows, kanban “+ Add…”, audio timecodes. Passes 4.5:1 on every surface in both themes. Dark is .52, raised on 2026-11-17 from .48, which failed on inset wells (4.4:1 on `card-2`, 4.2:1 on `card-3`). Lumen matches since `main@285e8f6`. |
| `--label-4` | rgba(11,12,14,.14) | rgba(244,245,247,.11) | Disabled glyphs (an empty composer's send arrow). Not for readable text. |
| `--hair` | rgba(11,12,14,.075) | rgba(255,255,255,.07) | Hairline borders: inset rings on wells and segmented controls. |
| `--hair-2` | rgba(11,12,14,.13) | rgba(255,255,255,.12) | Stronger hairline: chip rings, evidence-weight rings, mode chips. |
| `--thread` | rgba(11,12,14,.2) | rgba(255,255,255,.16) | Wires between cards on the board (lineage links). |
| `--hover` | rgba(11,12,14,.045) | rgba(255,255,255,.055) | Hover fill for ghost buttons, menu rows and tool buttons; also the secondary button fill. |
| `--press` | rgba(11,12,14,.08) | rgba(255,255,255,.09) | Pressed fill for ghost buttons and menu rows. |
| `--chrome` | rgba(252,252,253,.8) | rgba(26,27,31,.78) | Floating glass UI over the board: composer, tool rail, toasts, menus, tooltips, review pill. Always with backdrop blur. |
| `--chrome-ink` | #0c0d0f | #f3f4f6 | Text on `chrome` surfaces when `label` is not used. |
| `--act` | #0c0d0f | #f3f4f6 | Primary action fill — the one decisive button (Send, Apply). Inverts per theme. |
| `--on-act` | #ffffff | #0a0b0d | Text and icons on `act`. |
| `--focus` | #3f444e | #c8ccd4 | Selection marquee and focus treatments on the board. |
| `--danger` | #e12f34 | #ff6369 | Destructive and Stop actions: Delete, Stop, the “suggests deleting” tint, struck words in a diff. Used as a 12–14% tint (with `danger-ink` for the words on it) and as a solid fill on hover. Light `#e12f34` is 4.5:1 on `card`, and white on it (the solid hover fill) is also 4.5:1. Deepened on 2026-11-17 from `#e5484d` (3.9:1). Lumen matches since `main@285e8f6`. Dark `#ff6369` is unchanged. |
| `--danger-ink` | #b02529 | #ff797e | Red text that sits on a red tint or on translucent chrome: Stop, Delete in menus, struck words in a proposal diff, the “suggests deleting” line. Light `#b02529`: at least 4.7:1 on a 14% `danger` tint over `card`, `card-2` or `canvas`, and 6.7:1 on `card`. Dark `#ff797e`: 5.5:1 on a 14% tint over `card`. Use `danger` for fills and marks, `danger-ink` for words. |
| `--ok` | #3c7811 | #6cc23a | Success as text: connected, accepted, done. Leaf green (hue 95°), kept clearly apart from lineage `C` (hue 155°) so success never reads as “direction C” (ΔE 30). Light `#3c7811` is 5.4:1 on `card`, 5.0:1 on `card-2` and 4.6:1 on `canvas`; dark `#6cc23a` is 7.6:1 on `card`. Changed on 2026-11-17 from `#247a50` / `#30a46c`, which were ΔE 3.6 from `C`. Use `ok-fill` for shapes. |
| `--warn` | #886600 | #d97706 | Caution states: the crew-on-built-in-rules dot in crew settings, and the “card changed since this was suggested” line on a proposal. Used on `card`, `canvas` and `chrome`. Light `#886600` is ochre (hue 45°), kept clearly apart from lineage `A` amber (hue 34°) so caution never reads as “direction A”. It is 5.3:1 on `card`, 4.9:1 on `card-2` and 4.5:1 on `canvas`. Dark `#d97706`: 5.3:1 on `card`, 6.4:1 on `canvas`. Lumen used to have only a fallback (`#d97706`); the token is defined in both themes since `main@285e8f6`. Light was changed on 2026-11-17 for contrast and to separate it from `A`. |
| `--ok-fill` | #4c9816 | #6cc23a | `ok` as a pure shape: the on-state of a Switch, connected dots, done rings and badges. Light `#4c9816` is 3.6:1 on `card` and 3.1:1 on `canvas`, light enough not to look heavy. Never put text on it. Dark matches `ok`. |
| `--warn-fill` | #ab8209 | #d97706 | `warn` as a filled mark: caution dots, stale wires. Light `#ab8209` is 3.5:1 on `card` and 3.0:1 on `canvas`. `warn` itself is the text-safe ink. Dark matches `warn`. |
| `--A` | #9f5a00 | #ffb547 | Lineage A — the first direction in a fork. Wires, chips, adopted rings, Reported evidence, Wright's progress, the first kanban column. Light is `#9f5a00`: 5.3:1 on `card`, 4.9:1 on `card-2` and 4.6:1 on `canvas`, so it's usable as text. Deepened on 2026-11-17 from `#db7c00` (3.0:1). Lumen matches since `main@285e8f6`. |
| `--B` | #2066db | #5aa2ff | Lineage B — the second direction. Also Proposal evidence, search hits and the Search mode. Light is `#2066db`: 5.3:1 on `card`, 4.9:1 on `card-2` and 4.5:1 on `canvas`, so it's usable as small text on all three. Deepened on 2026-11-17 from `#2b6fe0`, which failed on `card-2` (4.4:1) and `canvas` (4.0:1). Lumen matches since `main@285e8f6`. |
| `--C` | #0b7b50 | #45d49a | Lineage C — the third direction. Also Observed evidence, the Locked kanban column and live status dots. Light is `#0b7b50`: 5.3:1 on `card`, 4.9:1 on `card-2` and 4.5:1 on `canvas`, so it's usable as text. Deepened on 2026-11-17 from `#0e9662` (3.8:1). Lumen matches since `main@285e8f6`. |
| `--D` | #ca2760 | #ff6b95 | Lineage D — the fourth direction. Wires, chip, adopted ring, error dot. Light is `#ca2760`: 5.3:1 on `card`, 4.9:1 on `card-2` and 4.5:1 on `canvas`, so it's usable as text, matching A, B and C. Deepened on 2026-11-17 from `#d93b72` (4.4:1). Lumen matches since `main@285e8f6`. |
| `--A-fill` | #c97200 | #ffb547 | Lineage A as a filled mark: evidence blocks, bars, dots, large fills. Lumen amber, nudged to pass 3:1 on canvas; at least 3:1 on card, card-2 and canvas. `A` itself is the text-safe ink (4.5:1); never use `A` for a fill or `A-fill` for text. Dark matches `A`. |
| `--B-fill` | #2b6fe0 | #5aa2ff | Lineage B as a filled mark: evidence blocks, bars, dots, large fills. Lumen’s original blue; at least 3:1 on card, card-2 and canvas. `B` itself is the text-safe ink (4.5:1); never use `B` for a fill or `B-fill` for text. Dark matches `B`. |
| `--C-fill` | #0e9662 | #45d49a | Lineage C as a filled mark: evidence blocks, bars, dots, large fills. Lumen’s original green; at least 3:1 on card, card-2 and canvas. `C` itself is the text-safe ink (4.5:1); never use `C` for a fill or `C-fill` for text. Dark matches `C`. |
| `--D-fill` | #d93b72 | #ff6b95 | Lineage D as a filled mark: evidence blocks, bars, dots, large fills. Lumen’s original rose; at least 3:1 on card, card-2 and canvas. `D` itself is the text-safe ink (4.5:1); never use `D` for a fill or `D-fill` for text. Dark matches `D`. |
| `--chip-ink` | #ffffff | #0a0b0d | Letter on a lineage chip (A–D) — white in light, near-black in dark. White passes on every light chip at 5.3:1. |
| `--light` | #ffffff | #f4f5f7 | 'Light is alive': the glow colour of working crew, live drafts and the review pulse dot. |
| `--bloom` | rgba(255,190,110,.5) | rgba(255,236,206,.55) | Warm glow around something the crew is working on or waiting on you for. Only as a soft shadow, never a fill. |
| `--crew-scout` | #1d4ed8 | #7ab3ff | Scout's ink (reads sources, weighs evidence). Avatar glyph and its tooltip icon. |
| `--crew-strategist` | #6d28d9 | #c4a5ff | Strategist's ink (forks a claim into testable directions). |
| `--crew-wright` | #b45309 | #ffb547 | Wright's ink (builds proofs: pages, decks, action lists). |
| `--crew-critic` | #047857 | #45d49a | Critic's ink (checks work against its sources). |
| `--orb-off` | #d9dade | #2a2b30 | An idle crew avatar's fill: unlit until that crew member is working. |
| `--note-butter` | #fce15d | #fce15d | Sticky note paper (butter tone, the default). Same in both themes. |
| `--note-ink` | #925600 | #925600 | The 6px dot in a sticky's tag, on `note-butter`. `#925600` reaches 4.52:1 on the paper, so it can also carry small text. Sticky body text is near-black ink at 88%. Same in both themes, like the paper. Deepened on 2026-11-17 from `#9a5b00` (4.15:1). Lumen matches since `main@285e8f6`. |

## Type

| style | size / leading | weight | tracking | family | usage |
| --- | --- | --- | --- | --- | --- |
| `display` | 46px / 1 | 700 | -0.05em | ui | Snapshot edition number (“No. 1”). The one display size; tabular numerals. |
| `heading` | 28px / 34px | 650 | -0.02em | ui | Page and dialog headings, empty-state titles. The step between cards and display. |
| `direction-title` | 21px / 25px | 650 | -0.022em | ui | Title of a Direction card (a lettered A–D proposal). |
| `idea-title` | 19px / 27px | 620 | -0.022em | ui | The claim on an Idea / Core Thesis card, and Question cards. |
| `card-title` | 17px / 22px | 600 | -0.022em | ui | Title of Source, Recording, Link, Notepad, Group and most other cards. |
| `note-text` | 16px / 24px | 470 | -0.01em | ui | Handwritten-feel text on a sticky note. |
| `body-lg` | 16px / 24px | 400 | -0.006em | ui | Long reading: Margin sheet body, notepad text, onboarding copy. |
| `body` | 14px / 20px | 400 | -0.006em | ui | Card body copy and default UI text. |
| `toast` | 14px / 20px | 550 | -0.006em | ui | Toast and inline notice messages. |
| `label` | 13px / 1 | 600 | 0 | ui | Button labels, menu commands, review pill. |
| `tooltip` | 12px / 18px | 400 | 0 | ui | Tooltips and helper copy. |
| `card-kind` | 12px / 16px | 550 | -0.002em | ui | The kind line at the top of every card, in `label-3`. |
| `meta` | 12px / 16px | 500 | 0 | ui | Card footers and timestamps, tabular numerals, in `label-3`. |
| `weight` | 12px / 1 | 560 | 0 | ui | Evidence-weight pill text. 12px because it carries meaning. |
| `caption` | 11px / 14px | 500 | 0 | ui | The smallest readable text: media badges, counts in pills, kbd hints. Latin only; Chinese floors at 12px. |
| `eyebrow` | 11px / 1 | 600 | 0.04em | ui | Uppercase panel captions (minimap). The only uppercase style. |
| `chip` | 10px / 1 | 750 | 0 | ui | The letter inside a lineage chip. The one size below 11px, because it is a single glyph. |
| `mono` | 12px / 1.3 | 500 | 0 | mono | URLs on link cards, elapsed time. |
| `mono-small` | 11px / 1.35 | 450 | 0 | mono | File paths and media timecodes. |

## Spacing

| token | value | usage |
| --- | --- | --- |
| `--space-2` | `2px` | Gap between segmented-control buttons. |
| `--space-4` | `4px` | Gap between tool-rail buttons. |
| `--space-6` | `6px` | Default inline gap: icon to label, chips in a row, tool-rail padding, media inset inside a card. |
| `--space-8` | `8px` | Gap between stacked composer parts and floating UI. |
| `--space-10` | `10px` | Menu row and toast inner gaps. |
| `--space-12` | `12px` | Card footer top spacing; header control padding. |
| `--space-16` | `16px` | Screen gutter for all floating chrome; card top padding. |
| `--space-18` | `18px` | Card inline padding (16px 18px 17px). |
| `--space-20` | `20px` | Gap between cards in a group. |
| `--space-24` | `24px` | Margin sheet and dialog padding. |
| `--space-32` | `32px` | Section gaps in sheets, dialogs and docs. |

## Radius

| token | value | usage |
| --- | --- | --- |
| `--radius-xs` | `6px` | Media timecodes, kbd hints, kanban items, lock badge, small wells. |
| `--radius-chip` | `5.5px` | Lineage chip (18px square). |
| `--radius-sm` | `10px` | Buttons (28–32px), action-strip buttons, link wells, kanban columns, selection marquee. |
| `--radius-md` | `12px` | Project switcher, tooltips, segmented controls, proposal bars. |
| `--radius-media` | `14px` | Images and video inside a card (6px inset); menus, toasts and the draft bar. |
| `--radius-control` | `16px` | 44px square controls: Send, Add, Mic; review popover. |
| `--radius-card` | `20px` | Every card on the board. |
| `--radius-field` | `22px` | Composer field. |
| `--radius-sheet` | `28px` | Open-card sheet (Margin) and dialogs. |
| `--radius-pill` | `999px` | Pills: tool rail, review pill, evidence weight, mode chip, zoom control. |

## Shadow

| token | light | dark | usage |
| --- | --- | --- | --- |
| `--shadow-card` | `0 0 0 .5px rgba(11,12,14,.07), 0 1px 1px rgba(11,12,14,.03), 0 2px 4px -1px rgba(11,12,14,.04), 0 12px 28px -16px rgba(11,12,14,.16)` | `0 0 0 .5px rgba(255,255,255,.06), inset 0 1px 0 rgba(255,255,255,.035), 0 14px 34px -16px rgba(0,0,0,.8)` | Resting card on the board. |
| `--shadow-card-up` | `0 0 0 .5px rgba(11,12,14,.08), 0 2px 3px rgba(11,12,14,.04), 0 8px 16px -6px rgba(11,12,14,.08), 0 34px 64px -28px rgba(11,12,14,.28)` | `0 0 0 .5px rgba(255,255,255,.09), inset 0 1px 0 rgba(255,255,255,.05), 0 34px 70px -24px rgba(0,0,0,.9)` | Hovered or dragged card; the open-card sheet. |
| `--shadow-chrome` | `0 0 0 .5px rgba(11,12,14,.08), 0 1px 2px rgba(11,12,14,.04), 0 12px 32px -14px rgba(11,12,14,.24)` | `0 0 0 .5px rgba(255,255,255,.07), 0 14px 40px -14px rgba(0,0,0,.85)` | Floating glass chrome: composer, tool rail, toasts, menus. |
| `--shadow-field-focus` | `0 0 0 4px rgba(255,190,120,.15), 0 4px 20px -2px rgba(255,165,80,.34)` | `0 0 0 4px rgba(255,190,120,.09), 0 4px 22px -2px rgba(255,165,80,.24)` | Focus on a text field: the field turns `card` and this soft warm glow surrounds it, instead of a grey ring. The same warm light the crew uses for "alive". Buttons and other controls keep the `focus` ring. |

## Size

| token | value | usage |
| --- | --- | --- |
| `--size-xs` | `20px` | Pills that are labels, not buttons: evidence weight, media badges, counts. |
| `--size-sm` | `28px` | Compact buttons: draft bar, toast actions, segmented control, proposal actions, menu rows on dense surfaces. |
| `--size-md` | `32px` | Default button and menu row. |
| `--size-lg` | `36px` | Tool rail, composer controls, crew seats, crew settings. |
| `--size-touch` | `44px` | Touch-first and primary hero controls. |

## Icon

| token | value | usage |
| --- | --- | --- |
| `--icon-xs` | `12px` | Inside pills, kind lines, compact buttons. |
| `--icon-sm` | `14px` | Menus, default buttons, segmented controls. |
| `--icon-md` | `16px` | Default UI icon, tool rail. |
| `--icon-lg` | `20px` | Composer controls, empty states. |

## Duration

| token | value | usage |
| --- | --- | --- |
| `--duration-press` | `90ms` | Press scale feedback. |
| `--duration-quick` | `150ms` | Hover, colour and opacity changes. |
| `--duration-base` | `240ms` | Small layout changes, menus and popovers opening. |
| `--duration-spring` | `410ms` | Snappy spring: chips and pills appearing. |
| `--duration-slow` | `600ms` | Smooth spring: sheets and large layout shifts. |

## Easing

| token | value | usage |
| --- | --- | --- |
| `--easing-standard` | `cubic-bezier(.22,.8,.24,1)` | Default ease-out for transitions. |

## Z index

| token | value | usage |
| --- | --- | --- |
| `--z-card` | `1` | Cards on the board. |
| `--z-wire` | `5` | Ports and wire handles above cards. |
| `--z-chrome` | `30` | Floating chrome: tool rail, composer, minimap, top bar. |
| `--z-popover` | `50` | Menus, popovers, the Margin sheet. |
| `--z-dialog` | `60` | Dialogs and their scrim. |
| `--z-toast` | `70` | Toasts and the open Task Island. |
| `--z-tooltip` | `80` | Tooltips, always on top. |

## Ring

| token | value | usage |
| --- | --- | --- |
| `--ring-width` | `2.5px` | Focus outline width on every interactive element. |
| `--ring-offset` | `3px` | Gap between the element and its focus outline (1px inside pills and dense rows). |
