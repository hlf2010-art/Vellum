Copilot's button: a 36px round button at the end of the top bar, right above the panel it opens.

Taken from `.copilot-btn` in `Vellum-Lumen.html` (PR 54). It replaced the tab on the right edge of the window.

- **Mark:** Copilot's monochrome prism (a triangle with an incoming ray and two outgoing ones, the rays at half opacity), 16px in `label-2`, no label and no colour.
- **States:** hover turns the mark `label`; pressed scales to .97; open (`aria-expanded`) adds a 7% `label` tint.
- **Shortcut:** ⌘. toggles the panel. The tooltip says *“Copilot · ⌘.”*.
- Copilot and the Strategist have distinct marks: never reuse this prism for a crew member.
