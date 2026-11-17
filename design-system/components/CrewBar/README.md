The crew cluster at the top right: four crew seats, the crew settings button, and the model pill.

Hand-written from `Vellum-Lumen.html` on branch `claude/lumen-v2` (commit `92098dc`). (`.crew-group`, `.crew-set`, `.crew-mode`).

- **Seats** are 36px `CrewMark` orbs. Each has a state: *free* (pale crew tint), *working* (warm light + `bloom`), or *waiting for you* (warm light + that member's glow).
- **Crew settings** is a 36px glass button with a sliders icon and a 9px connection dot: none (`label-4`), connected (`ok`), built-in rules (`warn`) or error (`D`). The tooltip spells out the current settings, e.g. *“Crew settings · Speaks up: When it matters · Acts: Only drafts”*.
- **Model pill** shows which engine the crew uses (*Offline*, or a model name) with a status dot. The dot is green (`C`) when live.
- **Quiet:** when the crew is set to *Never* speak up, or has no model, the seats dim to 72% and desaturate. The crew still answers when asked.

**Consumer provides:** `seats {scout, strategist, wright, critic}` with a state each, `connection`, `mode`, `quiet`. Opening the button shows `CrewSettings`.
