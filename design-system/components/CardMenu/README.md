The right-click (or ⋯) menu for a card.

Hand-written from `Vellum-Lumen.html` on branch `claude/lumen-v2` (commit `92098dc`). (`.card-menu`). It's 196px of `chrome` glass with a 15px radius. The head shows the card title (ellipsised at 140px) and a kind chip such as `MD`. Items are 32px rows in `label` type (550 / 12.5px) with a 14px icon and an optional mono shortcut. Groups are split by a hairline.

Order: **Ask Scout** (or the kind's crew action) · **Ask Copilot** · **Open Details ↵** — then **Lock / Unlock** (kept cards only) · **Duplicate ⌘D** · **Hide from canvas** · **Archive ⇧H** · **Delete ⌫**. Delete is the one `danger` item. Notes and notepads add **Edit Tag** (and **Edit Text**) at the top.

**Consumer provides:** `title`, `kind`, `locked`, or a custom `items` list (`'-'` adds a separator).
