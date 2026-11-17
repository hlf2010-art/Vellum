# Vellum smoke test

`tests/vellum-smoke.cjs` drives the real `Vellum-Lumen.html` in headless Chromium against a scripted model endpoint it serves itself, so agent flows are deterministic and need no API key or network.

```bash
npm i -D playwright && npx playwright install chromium   # once
node tests/vellum-smoke.cjs                               # from the repo root
node tests/vellum-smoke.cjs --headed                      # watch it run
```

It checks that every inline script parses, the sample board loads and every card type can be selected without errors, every argument-free command runs from the composer (and text commands wait for their text), free text becomes an idea card, Try again keeps or replaces drafts correctly (including work done meanwhile and Undo), provenance and the change log are recorded, and the Task Island shows a running crew move, reports what arrived, selects it on Show and cancels on Stop (without falling back to rules). Local AI is mocked at `127.0.0.1:59631` to check that JSON is asked for in words rather than grammar-constrained JSON mode, and that running out of time is not treated as Stop: a crew move falls back to built-in rules and says why, and Copilot keeps the partial answer marked as cut off. Exit code 0 means all checks passed.

Run it before committing a change to `Vellum-Lumen.html`.

## Studio AI launcher (local server)

`serve_vellum.py` can open Studio AI for the Connection panel's Start button. Its endpoint is tested
with a stand-in script, so nothing real is launched:

```bash
python3 studio/macos-app/test_serve_launch.py
```
