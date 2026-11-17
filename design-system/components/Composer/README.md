The command bar at the bottom centre of every board: one calm row where you write an idea or a `/` command.

Hand-written from `Vellum-Lumen.html` on branch `claude/lumen-v2` (commit `92098dc`). (`.line`). It's a near-opaque field (`card` at 90%, light blur) with `radius-field` corners, max 640px wide. It holds `size-lg` (36px) round controls: **Add (+)**, the textarea, **Dictate**, and **Send**.

- **Placeholder:** *“Write an idea, or / for commands”*. Free text with nothing selected becomes an Idea card.
- **Send** exists only when there is something to send. While the field is empty it is folded away (no outlined placeholder circle); with the first character it pops in as a solid `label` disc with a `canvas` arrow. Fill only, never a ring.
- **Route chip:** once you type, a pill shows who will handle it (*Canvas AI*, or a crew member). Click it to pick a specialist: Copilot (auto router), Scout (research), Strategist (directions), Wright (create & build), Critic.
- **Typing:** the field is `body-lg` (16/24, which also stops iOS from zooming) and grows to 160px, then scrolls. **Enter** sends, **Shift+Enter** breaks the line, and Enter while an IME is composing (Chinese, Japanese) never sends.
- **No layout jump:** the route chip's slot is always reserved; it stays quiet until there is text.
- **Dictate:** `recording` tints the mic in `danger-ink` and sets `aria-pressed`.
- Search lives on the tool rail (⌘F), not in the composer.

**Consumer provides:** `placeholder`, `value`, `route {member, label}`, `onSend`, `recording`.
