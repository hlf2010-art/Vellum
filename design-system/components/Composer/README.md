The command bar at the bottom centre of every board: one calm row where you write an idea or a `/` command.

Hand-written from `Vellum-Lumen.html` on branch `claude/lumen-v2` (commit `92098dc`). (`.line`). It's a near-opaque field (`card` at 90%, light blur) with `radius-field` corners, max 640px wide. It holds 36px round controls: **Add (+)**, the textarea, **Dictate**, and **Send**.

- **Placeholder:** *“Write an idea, or / for commands”*. Free text with nothing selected becomes an Idea card.
- **Send** is an outlined circle while empty (`hair-2` ring, `label-4` arrow). With text it becomes a solid `label` disc with a `canvas` arrow.
- **Route chip:** once you type, a pill shows who will handle it (*Canvas AI*, or a crew member). Click it to pick a specialist: Copilot (auto router), Scout (research), Strategist (directions), Wright (create & build), Critic.
- Search lives on the tool rail (⌘F), not in the composer.

**Consumer provides:** `placeholder`, `value`, `route {member, label}`, `onSend`.
