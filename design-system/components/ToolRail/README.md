The vertical canvas tool palette that floats on the left edge of the board.

Hand-written from `Vellum-Lumen.html` on branch `claude/lumen-v2` (commit `92098dc`). (`.top-tools`). It's a glass pill (`chrome`, `shadow-chrome`, blur 28 / saturate 1.4) with 36px round buttons, separated into groups:
- **Mode:** Select V, Lasso S, Hand H.
- **Add and find:** Upload U, Organize T, Search ⌘F.
- **History:** Undo ⌘Z, Redo ⌘⇧Z. Undo is per author and operation-based, so it undoes your own changes, not the crew's.

Only mode tools stay pressed. The pressed tool is a raised `card` disc. Every tooltip shows the label and its shortcut joined by `·`.

Keep it vertically centred, `space-16` from the left edge. Use `orientation="horizontal"` on narrow screens.
