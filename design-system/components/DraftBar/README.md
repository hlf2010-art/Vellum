The decision bar for crew work waiting on you: who made it and what, then **Discard · Retry · Keep**.

Hand-written from `Vellum-Lumen.html` on branch `claude/lumen-v2` (commit `92098dc`). (`.pbar`). It floats just above the composer, `min(340px, 100%)` wide, on near-opaque glass with a 14px radius.

- **Title:** the crew member's name in bold, then a count of what they made: *“**Strategist** · 1 direction”*, *“**Wright** · 3 proofs”*. When there are several drafts, a `1/3` pager sits at the right.
- **Actions:** **Discard** (⌘⌫) and **Retry** (R) are quiet text buttons. **Keep** (↵) is the one solid `act` button, and becomes **Keep all** when there are several. Use these three words exactly. The bar replaced the older “keep it?” toast, and “Try again” is now “Retry”.
- The crew member's orb shows its *waiting* state (warm, with that member's glow).

**Consumer provides:** `member`, `what`, optional `count`/`index`, and the three handlers. Use it only for drafts the crew made. Edits to cards you already kept go through the card's proposal bar instead (see `Card`).
