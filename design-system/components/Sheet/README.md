The Margin: a card opened to read and write in full. It sits centred on desktop and becomes a bottom sheet on narrow screens.

Taken from `.margin` in `Vellum-Lumen.html`.

- **Head:** the title in `idea-title`, then one metadata line that carries only what helps you decide: *“Synthesis by Scout · 3 h ago”*. The rules for that line:
  - Only crew work gets a byline. Your own cards have none.
  - The version appears from v2 on.
  - The engine (model, built-in rules, local service) and the source count go in the tooltip, as does the full date.
  - Items are joined with middle dots, never vertical bars.
- **Tools** at the top right are round, filled buttons: votes, More and Close. There is no divider between them.
- **Body:** a stack of `SheetSection`s. Sections are separated by space and a small heading, never by rules. A hairline appears under the head, or above the composer, only while the body is scrolling beneath it.
- **Composer:** a filled well. Send is folded away until there is text.
- The lineage glow fades out across the top of the sheet, so the head has no visible edge.

Use `SourceRow` for “Based on” and `EvidenceBlocks` for the evidence behind the card.

**Consumer provides:** `title`, `kind`, `by`, `engine`, `rev`, `time`/`timeFull`, `lineage`, `tools`, children, `composer` (`{placeholder, onSend}` or `false`), `onClose`.
