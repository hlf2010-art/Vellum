An experiment that tests a direction. Results come first and the thumbnail second; there is one card per proof, with its versions inside it.

This replaces `Card kind="proof"`. The app uses it as of 2026-11-17.

- **Reading order:** format badge on a small thumbnail · lineage chip, "Proof" and a version switcher (‹ v2 ›) · title · the **test** it must pass (carried from the direction) · **results**, one block per test item (green passed, red failed, grey waiting) with the failed items spelled out · actions · provenance on one line ("From Direction B · 4 sources").
- **One next step**, chosen by state:
  - **Fix N failed** when an item fails.
  - **Rebuild with N changes** when a source changed.
  - **Test N waiting** when items are still waiting.
  - **Ask Critic to test** when it hasn't been tested.
  - **Snapshot** when it passes.
  - **Building vN** while Wright works on it.
  - **Back to vN** when you are looking at an older version.
  - **Open** always sits beside the primary button. It is the only name for opening a proof.
- **Change…** selects the card and puts the cursor in the composer, which already takes instructions for the selected proof. There is one place to type, not two.
- **Fix N failed** builds the next version straight away. Wright is told which items failed, and the old version stays in the switcher, so nothing needs confirming.
- The test line is one line, with the full text in its tooltip.
- Versions are proofs from the same direction in the same format. When a new version is kept, older ones are hidden from the canvas (using the normal, reversible "Hide from canvas") and stay reachable from the switcher.
- Older versions are tucked behind the switcher. Viewing one dims its results and says what the newer version changed.
