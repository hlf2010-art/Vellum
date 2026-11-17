A one-line notice after something happens, with at most one follow-up action, usually **Undo**.

Hand-written from `Vellum-Lumen.html` on branch `claude/lumen-v2` (commit `92098dc`). (`.toast`). It's `chrome` glass with a 15px radius in `toast` type, and appears under the top bar (below the Task Island when it's open).

Real examples: *“Locked: only you can change this card.”* **Undo** · *“Unlocked.”* · *“Gather is locked: only you can change its cards.”*

**Errors:** `tone="error"` adds an alert icon in `danger-ink`, a danger ring and `role="alert"`. Say what failed and that nothing was lost, then offer **Retry**: *“Couldn’t reach the model. Nothing was changed.”* Toast buttons are `size="sm"`.

Crew decisions don't go in a toast. A draft waiting for Keep/Discard uses `DraftBar`, and a suggested change to a kept card uses the card's proposal bar. Keep notices to one line, with no emoji and no exclamation marks.
