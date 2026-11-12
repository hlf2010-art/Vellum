# MOD WORK · Fable Decision Workflow

Separate English iteration of `MOD WORK - Fable Decision Canvas.html`. The original HTML and existing source files are preserved. The new standalone output is `MOD WORK - Fable Decision Workflow.html` at the workspace root. It embeds its fonts and project media and opens directly from disk.

## Click through

1. Open the new HTML. Choose **Add material** and upload a short video. For a repeatable example, use `tests/comparison-recording.mp4` (the existing project visualization, not a creator observation).
2. Select **B**, then type a question in Copilot, or choose **Use example question**. Leave it unsent. Double-click **A**, then open the uploaded recording under **Browse recordings**. Play and seek. Close it and reopen B: the draft still belongs to B and **Explicitly added** is still zero.
3. Reopen A’s recording, seek to **3.5 seconds**, and choose **Include this frame in B**. Review the source title, provenance and **0:03.500** timestamp under Copilot’s reading context. Choose **Ask Copilot**.
4. Read the answer, then **Preview revision to B**. The default creates only B v2. To qualify the shared hypothesis too, check **Also qualify the shared hypothesis** and review both named changes. Choose **Apply** or **Discard**.
5. Select B and open **Trace**. Switch between v1 and v2; reopen A. To check historical fidelity, use **Locate source**, open that source, expand **Edit the current source**, and save a new title or excerpt. Reopen the earlier Trace: it retains its captured title, excerpt and frame. Try **Undo**, reload, and toggle Copilot/Trace after panning and zooming.

## Verified

The browser acceptance run passed **40 checks** in Chromium 151, with no page errors. It exercised a real file upload of the packaged 22-second illustrative recording, playback/seeking, B draft ownership, browsing without evidence changes, explicit frame selection, answer-before-proposal, Discard, B-only Apply, shared-hypothesis Apply, both forms of Undo, original A/B history, source edits after commit, and persistence across reloads. It also checked selected text offsets, CSV rows, explicit source location, dark mode, and a 390px layout.

The selected **1280 × 720 PNG at 3.500 seconds** was compared byte-for-byte with the player’s captured canvas image, then compared again in the stored version and historical Trace after source edits and reload. Pan, zoom, world transform, node positions and A/B screen coordinates were checked before and after panel/inspector toggles. The standalone `file://` delivery was separately opened and reloaded to verify draft persistence.

**Recorded example versus live AI:** the successful walkthrough used the clearly labelled, scripted **Recorded example**. It does not analyze uploaded pixels or new source text. The optional **Local AI helper** uses the existing Studio endpoint. Its outgoing request was intercepted to verify that only the listed excerpts and selected PNG were included, with no full recording or hidden source text. Connection failure was simulated and preserved the draft. No successful live model inference was performed. Narrow-screen checks were browser emulation, not a physical-phone test.

Machine-readable outcomes are in `tests/results.json`; screenshots `01`–`05` show the inspection, applied frame, Trace, shared proposal and dark mode. Original-file SHA-256 checks are recorded in `original-sha256.txt` and passed after implementation.

## Implementation

- `index.html`, `workflow.css`, `workflow.js`: separate UI, state and behavior; no changes to the original runtime.
- `build.py`: reads the preserved original’s embedded fonts/media and `../study.json`, then writes the new standalone HTML. Run `python3 studio/mod-fable/workflow/build.py` from the workspace root.
- Versions store immutable evidence selections. Current sources and recording blobs are separate. Apply changes version pointers; Undo restores those pointers and retains the revision in history.
- Draft, target, selected evidence, answer, unapplied proposal, history, camera and theme save to a separate browser database. Different browser profiles/origins keep separate local canvases.
- `tests/acceptance.cjs`: reproducible browser workflow using the bundled Playwright runtime. Serve the workspace on `127.0.0.1:8764`, then run it with the bundled Node executable. Each test run uses its own database, leaving the playable canvas clean.
