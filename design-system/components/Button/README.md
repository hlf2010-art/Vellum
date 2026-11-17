Decision buttons. Labels are always verbs (Keep, Retry, Discard, Accept, Decline, Apply), never OK/Cancel.

Hand-written from `.send`, `.toast button` and `.strip button` in `Vellum-Lumen.html` (branch `claude/lumen-v2`).

- `primary`: `act` / `on-act`, the single decisive action in a view (Send, Apply). Use at most one per surface.
- `secondary` (default): a `hover` fill with `label` text.
- `ghost`: no fill, `label-2` text. Use for the less likely options next to a primary.
- `danger`: a 14% `danger` tint with `danger` text, solid on hover. Use for Stop and Delete.

Press scales to .95. An `icon` sits before the label at 14px with a 2px stroke.

## Sizes
| `size` | Height | Text | Use in |
| --- | --- | --- | --- |
| `sm` | `size-sm` 28px | 12px | Toasts, draft bar, proposal bars, other dense bars |
| `md` (default) | `size-md` 32px | 13px | Popovers, sheets, forms |
| `lg` | `size-lg` 36px | 14px | The one primary action of a sheet or empty state |

Pair sizes within one row. Never mix `sm` and `lg` side by side.

## States
- **Loading:** `loading` shows a spinner before the label, sets `aria-busy` and blocks clicks. Keep the label (“Building”), don't swap it for “Loading…”.
- **Disabled:** `label-3` on a `hover` fill. Prefer explaining why nearby over disabling silently.
- **Icon-only:** pass `icon` and `aria-label` with no children. The button goes square and the label becomes the tooltip. Put the shortcut in it (“Retry · R”).
- **Focus:** a 2.5px `focus` outline, 3px offset (`ring-width`, `ring-offset`).
