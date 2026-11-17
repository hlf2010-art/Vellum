Decision buttons. Labels are always verbs (Keep, Retry, Discard, Accept, Decline, Apply), never OK/Cancel.

Hand-written from `.send`, `.toast button` and `.strip button` in `Vellum-Lumen.html` (branch `claude/lumen-v2`).

- `primary`: `act` / `on-act`, the single decisive action in a view (Send, Apply). Use at most one per surface.
- `secondary` (default): a `hover` fill with `label` text.
- `ghost`: no fill, `label-2` text. Use for the less likely options next to a primary.
- `danger`: a 14% `danger` tint with `danger` text, solid on hover. Use for Stop and Delete.

34px tall, 11px radius, `label` type (600/13). Press scales to .95. An `icon` sits before the label at 14px with a 2px stroke. Icon-only buttons need `aria-label`.
