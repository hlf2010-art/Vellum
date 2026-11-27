One plain verdict on how well a judgment is backed, on idea, synthesis, direction and question cards. It replaced “5/7 rated”.

Taken from `evidenceVerdict`, `evidenceLine` and `.ev-line` / `.by-pop.is-ev` in `Vellum-Lumen.html`. `EvidenceCard` is the breakdown it opens.

- **Verdicts:** *Mostly observed* (at least half of the rated sources were watched), *Partly observed*, *Mostly second-hand*, *Second-hand only*, *No evidence yet* (only proposals and pictures) and *Not rated yet*. Use these words exactly; they are the product's honesty about its own footing.
- **Mark:** the weight's own glyph at 13px: an eye for observed (`C`), a speech bubble for reported (`A`), a bulb for proposals (`B`) and a dashed circle for unrated (`label-4`). The text stays `label-3`, so colour is never the only signal.
- **What it counts:** the material upstream of the card plus material you tied to it (snapped beside it or connected). Material you said *counters* it is kept apart, never counted as backing. Every view (this line, the direction flag, the decision view, the board check) reads the same function, so they never disagree.
- **Hover or focus** opens `EvidenceCard`: the verdict, one sentence in numbers (*“2 of 4 sources were watched first-hand.”*), one row per weight with its count (in the app, material that counters the card gets its own row in `danger`), and the actions *Rate the rest* and *Show sources* (primary last).
- It sits in the card footer, left of the contributors and the time. It truncates before anything else in the footer does.
