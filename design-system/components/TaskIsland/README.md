Live status for long-running crew work (renders, research, builds), pinned at the top centre of the board.

Hand-written from `Vellum-Lumen.html` on branch `claude/lumen-v2` (commit `92098dc`). (`.island`). It has three states:
- **Idle:** a faint 46×12 pill (70% opacity) that says nothing is running.
- **Compact:** a 36px glass pill with up to two crew avatars inside progress rings, the phase in bold and the task title, a `+N` count for more tasks, and a percentage when one is known. Example: *“**Rendering** Keyframe · Kowloon Rain Sector +1 46%”*.
- **Open:** a 400px panel headed *“Background tasks · 2 running”*. Each row shows the avatar ring, title, phase · percent, elapsed time in mono, and a 3px progress bar tinted by who is working (Wright amber, Scout blue, and so on).

Rules: phases are present-tense verbs (*Rendering*, *Reading 4 sources*, *Animating*). When nothing is running, collapse to idle and never show “0 tasks”. When there's no percentage, the bar shows an indeterminate fill rather than a fake number. Toasts move down below the island while it's open.

**Task states:** each task has `state`: `running` (default), `queued` (dimmed, a dashed bar), `done` (green ring and a check badge) or `failed` (red ring, an x badge, the row's `note` in `danger-ink`, and **Retry** when `onRetry` is given). Done and failed tasks stay until dismissed, so a result is never missed; the compact pill takes a matching green or red edge. The idle pill is a real button (“No background tasks”) so it can be focused.

**Consumer provides:** `tasks [{member, title, phase, pct, elapsed, state, note, onRetry}]` and `open`.
