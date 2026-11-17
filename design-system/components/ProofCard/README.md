Draft: an experiment that tests a direction. Results come first and the thumbnail second; there is one card per proof, with its versions inside it.

This is a redesign of `Card kind="proof"` and is still under review. The app has not adopted it yet.

- **Reading order:** format badge on a small thumbnail · lineage chip, "Proof" and a version switcher (‹ v2 of 3 ›) · title · the **test** it must pass (carried from the direction) · **results**, one block per test item (green passed, red failed, grey waiting) with the failed items spelled out · actions · provenance on one line ("From Direction B · 4 sources").
- **One next step**, chosen by state:
  - **Fix N failed** when an item fails.
  - **Rebuild with N changes** when a source changed.
  - **Test N waiting** when items are still waiting.
  - **Ask Critic to test** when it hasn't been tested.
  - **Snapshot** when it passes.
  - **Building vN** while Wright works on it.
  - **Back to vN** when you are looking at an older version.
  - **Open** always sits beside the primary button. It is the only name for opening a proof.
- **Change…** opens a one-line field on the card ("What should v3 change?"). Bigger changes happen in the sheet.
- Older versions are tucked behind the switcher. Viewing one dims its results and says what the newer version changed.
