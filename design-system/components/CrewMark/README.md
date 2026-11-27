A crew member's avatar orb: Scout, Strategist, Wright or Critic. It is unlit when idle and lit when working.

Hand-written from `.mk` / `.seat` in `Vellum-Lumen.html`; glyph paths copied exactly. Updated for the 27 Nov design pass (PR 54).

- **Scout** (compass): reads sources and recordings, pulls quotes, weighs how much the evidence can carry.
- **Strategist** (forking branches): forks a claim into directions worth testing, each with a test it could fail.
- **Wright** (stacked blocks): builds proofs (working pages, decks and action lists) from an adopted direction.
- **Critic** (balance scale): checks work against its sources and asks the question nobody wants to.

**The crew are white light, told apart by their signs.** All four inks (`crew-scout` … `crew-critic`) are the same neutral: `#3B3F47` in light, `#D7DAE0` in dark. Hue belongs to directions (A–D) and to supports/counters (green/red), so a crew member never borrows one. Copilot has its own prism mark (`CopilotButton`), distinct from the Strategist's branches.

`state`:
- `free`: a pale orb with the glyph.
- `working`: a warm light orb with `bloom` that breathes on `duration-breath` (2.4s), plus a partial ring that reads as motion. In Vellum, light means alive.
- `thinking`: the member answering you right now. The orb breathes on the same pace, beside one quiet status line in `label-3` (*“Reading 3 sources”*). No caret and no typing dots.
- `waiting`: a warm orb with a dot badge at the top right: it has a draft for you.

Everything that waits or thinks breathes at this one pace; spinners, carets and flowing wires keep their own because they mean something else. Under reduced motion the orb holds a steady glow.

Use 36px in the top bar (`CrewBar`), `size="sm"` (26px) in toasts, and `size="xs"` (18px) as a byline on the draft bar. On a card's footer use `AvatarGroup`. State is never colour alone, and the member's name is always in the tooltip and accessible label.
