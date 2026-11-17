A crew member's avatar orb: Scout, Strategist, Wright or Critic. It is unlit when idle and glows warm when working.

Hand-written from `.mk` / `.seat` in `Vellum-Lumen.html` (branch `claude/lumen-v2`); glyph paths copied exactly.

- **Scout** (compass, `crew-scout`): reads sources and recordings, pulls quotes, weighs how much the evidence can carry.
- **Strategist** (fork, `crew-strategist`): forks a claim into directions worth testing, each with a test it could fail.
- **Wright** (blocks, `crew-wright`): builds proofs (working pages, decks and action lists) from an adopted direction.
- **Critic** (scale, `crew-critic`): checks work against its sources and asks the question nobody wants to.

`state` is `free` (pale crew tint), `working` (warm light orb with `bloom`, because in Vellum light means alive) or `waiting` (warm orb with that member's own glow: it has a draft for you). `working` alone still works as a shorthand. Use 36px in the top bar (`CrewBar`), `size="sm"` (26px) in toasts, and `size="xs"` (18px) as a byline on cards, the draft bar and the route chip. State is never colour alone: `working` adds a partial ring that reads as motion, and `waiting` adds a dot badge at the top right. Always keep the crew member's name in the tooltip and accessible label.
