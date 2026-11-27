How much a source can carry, shown as a pill: Observed, Reported, Proposal or Illustration.

Hand-written from `.weight` / `.w-bars` in `Vellum-Lumen.html` (branch `claude/lumen-v2`). Labels and tooltips are the app's own.

| `weight` | Label | Mark | Hue | Tooltip |
| --- | --- | --- | --- | --- |
| `observed` | Observed | 3 bars | `C` | Watched in real use or a test session. |
| `reported` | Reported | 2 bars | `A` | Someone told us. Nobody has watched it happen. |
| `proposed` | Proposal | 1 bar | `B` | Our own idea. It is not evidence of behaviour. |
| `illustrative` | Illustration | picture icon | neutral | Shows the product. Says nothing about people. |

Put it in the footer of every evidence card (source, recording, image, frame, audio, link, notepad). Generated and mock-up images are `illustrative`. In the product, clicking the pill opens the label menu (below). Text is the hue mixed toward ink, so it passes contrast in both themes, and the word plus the mark mean colour is never the only signal.

## Suggested (not yet decided)

When Scout reads a paste it may suggest a label. The pill keeps its place and shape but is not inked: a **dashed ring**, Scout's mark, the kind's sign in its hue, and the word with a question mark (`Reported?`, `转述？`).

- Hover (or focus) opens a hover card: the label, one line on why (*“P04's own words. Nobody has watched it happen yet.”*), and **Change** · **Keep**. Keep is the one primary.
- Whether Scout suggests, applies or stays quiet follows the crew's *Edit your kept cards* row: Ask first (default) shows the dashed pill; Do it applies the label with one soft glow (`w-glow`, an outline under reduced motion) and a toast with Undo; Never shows nothing.
- No suggestion when the rules are unsure. A quiet Unrated beats a confident wrong label.

## Label menu

Clicking any pill opens a menu: the four kinds with a short line each, Scout's pick marked "Scout" and focused (never pre-applied), *Unrated* once a label is set, and *Show as plain text* on a card drawn as blocks. Arrow keys move, Enter picks, Escape closes without changes.

There is no "Quote" or "Code" label: those are formats (see Card › Pasted blocks). The label only answers how much the card can carry.
