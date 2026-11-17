The crew popover: how much the crew may say and do without asking, and which lanes only you can change.

Hand-written from `Vellum-Lumen.html` on branch `claude/lumen-v2` (commit `92098dc`). (`.crew-pop`). Copy is the app's own.

- **Speaks up:** Never · When it matters · Often. Default *When it matters*: *“One thought at a time; the next comes after you read it.”*
- **Acts on the board:** Only drafts · Can create cards. Default *Only drafts*: *“Anything it makes arrives as a draft for you to keep or discard. Edits and deletions of your cards are always suggestions.”*
- **Locked lanes:** one toggle chip per stage (Gather, Explore, Prototype, Snapshot). *“Only you change kept cards in a locked lane. Lock single cards from their menu.”* Snapshot is locked on a new board.
- Footer: **Customize…** and **Memory**.

This is the product's autonomy contract: **agents suggest, you decide.** Whatever the settings, the crew never edits or deletes a card you kept. It proposes the change on the card instead (`Card` `proposal`). Write specs and copy that keep that promise.

Both segmented controls and the lane chips are live: arrow keys move between options, and `onChange({speaks, acts, locked})` reports every change. The props set the initial values.

Segmented controls use `card` for the selected option on a `hover` track. The popover is 372px of `chrome` glass.
