The ⌘K command palette: one field in the middle of the screen for commands, card search and new ideas. Closed, only a small hint pill stays at the bottom centre.

Taken from `#line` / `#line.palette` and the "Design pass, 27 Nov 2026" block in `Vellum-Lumen.html` (PR 54). The palette replaced the old bottom chat bar: nothing on the canvas looks like a chat box, and Copilot has its own panel.

**Closed: a hint, not an input.** A 30px glass pill at the bottom centre: a `⌘K` keycap and the word *Commands*. It has no caret, no placeholder and no Send button. Clicking it, ⌘K, or `/` anywhere on the board opens the palette.

**Open.** A solid `card` surface, 640px wide at most (`calc(100vw - 32px)` on phones), `radius-control` corners and `shadow-card-up`, at about 17% of the window height (10% on phones). A faint `canvas` scrim sits behind it. It arrives with a short rise (6px, 98.5% scale, the snappy spring) and has no blur. When Copilot is open on a wide screen, the palette centres on the board, not the window.

- **Field:** a search glass in `label-3`, then the input at 450/17 (−0.016em). Placeholder: *“Type a command, or search”*, or *“Type a command, or write an idea”* on an empty board. The suggestions already name the next steps for the selection, so the placeholder never repeats them.
- **Empty:** three **Suggestions** for what you have selected. With nothing selected: *New sticky* `N`, *Add files* `U`, *Ask Copilot* `⌘.` (plus *Keep the draft* `⌘↵` when crew work is waiting). With a selection: the card's next move (*Explore directions*, *Adopt this direction*, *Build a prototype*, *Take a snapshot*) and *Critique*. Each row ends in its keycap. Until someone has used `/` three times, a tip under the rows says *“Type `/` to see every command”*.
- **After `/`:** every command (see `CommandMenu`), filtered as you type.
- **Plain words (2+ characters):** **Cards** whose title matches (best title match first, at most six), then up to three matching **Commands**. Nothing is picked until you press ↓, so Enter still does what it always did.
- **What Enter will do:** once there is text, a quiet label at the right names it, followed by a `↵` keycap (*Run command*, *Add as an idea*, *Ask Copilot*).
- **Closing:** Esc or a click outside. A sheet opened from the palette replaces it, and closing that sheet does not reopen the palette.
- **Typing:** Enter runs; Enter while an IME is composing (Chinese, Japanese) never does.
- `/` also works in the Copilot input: the same commands open in a compact list right above the field (`CommandMenu compact`).

**Never:** a Send button, a microphone, a route chip with a crew orb, or a second input on screen at the same time.

**Consumer provides:** `open`, `value`, `suggestions`, `commands`, `cards`, `route`, `learned`, `onOpen`, `onClose`, `onSubmit`, `onPick`.
