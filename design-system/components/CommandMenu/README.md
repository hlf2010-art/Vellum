The rows inside the ⌘K palette: suggestions, every command after `/`, and card search results.

Taken from `#line.palette .menu`, `.pal-row`, `.pal-ic`, `.omni-row` and `.cp-slash` in `Vellum-Lumen.html` (PR 54).

- **One row, four parts:** a 24px icon tile (`hover` fill, `radius-xs`, the line icon in `label-2`), the command in 550/14, a one-line description in 450/14 `label-3`, and at the right either a keycap (`Kbd`) or the name of the crew member who does it, in 500/12 `label-3`. Rows are 40px tall with `radius-sm` corners.
- **Crew have no colour of their own.** A row names the member in plain text; no coloured orb, no tint.
- **Card search results** use a small dot instead of an icon. A direction's dot is its lineage `-fill` (a pure shape, so never the ink); every other card gets a `label-4` dot.
- A hint such as `2–4` follows the command in `label-4`.
- **Sections** (*Suggestions*, *Commands*, *Cards*) are separated by a small 600/11 heading in `label-3`, never by rules. Inside the palette the list has a single hairline at its top edge (`embedded`).
- **Keys:** ↑ ↓ move, Enter picks, and hover sets the active row. The active row has a `hover` fill; a hovered, inactive row a lighter one (55%).
- **`compact`:** the `/` list above the Copilot input: 36px rows at 13px, no names, solid `card` with `shadow-card-up`.
- The palette holds at most `min(372px, 52vh)` of rows, then scrolls.
