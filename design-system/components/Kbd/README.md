A keycap: a key, inline in copy, at the end of a palette row, or in a menu. Use the symbols ⌘ ⇧ ⌥ ↵ ⌫ and the word *esc*.

Taken from `.pal-hint kbd`, `.pal-row kbd` and `.pal-tip kbd` in `Vellum-Lumen.html` (PR 54).

- **Shape:** 20px tall, at least 20px wide, `radius-chip` corners, a `hover` fill, 550/11 Inter in `label-2` with tabular numerals. A 0.5px `hair-2` inset edge and a slightly heavier bottom edge make it read as a key without an outline.
- **`size="sm"`:** 16px, for a key inside a 12px sentence (*“Type `/` to see every command”*).
- **Combinations are one cap:** `⌘K`, `⌘↵`, `⇧H`, not three separate caps.
- **Where keycaps appear:** the closed palette's hint pill (`⌘K`), each suggestion row (`N`, `U`, `⌘.`, `⌘↵`), what Enter will do (`↵`), menu rows (Duplicate `⌘D`). Inside a menu the cap drops its fill and edge and becomes plain 500/12 `label-3` text, so a long list of shortcuts stays quiet.
- In tooltips, the shortcut is plain text after a middle dot (*“Hide · ⇧H”*), not a keycap.
