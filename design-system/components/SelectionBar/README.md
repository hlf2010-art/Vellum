What you can do with two or more selected cards: one small solid bar, 8–12px above them, that follows them as they move.

Taken from `renderSelbar` and `#selbar` in `Vellum-Lumen.html` (PR 54). For a single card, use `SelectionStrip`.

- **Order:** **[Ask Copilot | ▾]** first, then Relate, Group, Hide, Delete and ⋯. There is no *“2 selected”* label: the selection rings already say it.
- **Ask Copilot** (`⌘↵`) opens the Copilot panel, or keeps it open, with the selection riding along as one removable chip (*“2 cards ×”*) and the cursor waiting in the input. It sits in a `card-2` well with a hairline edge: the one primary thing on the bar.
- **▾** makes something on the canvas without opening the chat: *Synthesize*, *Action list*, *Kanban*, *Tree map*, *Critique on canvas*. *GIF* and *Video* join after a small gap, only when the selection has pictures.
- **Relate, Group, Hide, Delete** are 32px icon buttons with tooltips that carry their shortcut (*“Hide · ⇧H”*, *“Delete · ⌫”*). Delete turns `danger-ink` on hover only.
- **⋯ (Arrange):** align, distribute and duplicate.
- **Surface:** solid `card`, `radius-md`, `shadow-chrome`, 40px tall. It never uses glass, so the words under it never show through. If there is no room above the cards it sits below them, and its tooltips flip downward.
- It rises 5px with the snappy spring when it appears.
