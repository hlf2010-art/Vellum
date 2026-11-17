# Vellum smoke test

`tests/vellum-smoke.cjs` drives the real `Vellum-Lumen.html` in headless Chromium against a scripted model endpoint it serves itself, so agent flows are deterministic and need no API key or network.

```bash
npm i -D playwright && npx playwright install chromium   # once
node tests/vellum-smoke.cjs                               # from the repo root
node tests/vellum-smoke.cjs --headed                      # watch it run
```

It checks that every inline script parses, the sample board loads and every card type can be selected without errors, every argument-free command runs from the composer (and text commands wait for their text), free text becomes an idea card, Try again keeps or replaces drafts correctly (including work done meanwhile and Undo), provenance and the change log are recorded, and the Task Island shows a running crew move, reports what arrived, selects it on Show and cancels on Stop. Exit code 0 means all checks passed.

Run it before committing a change to `Vellum-Lumen.html`.

## Studio AI launcher (local server)

`serve_vellum.py` can open Studio AI for the Connection panel's Start button. Its endpoint is tested
with a stand-in script, so nothing real is launched:

```bash
python3 studio/macos-app/test_serve_launch.py
```

## Context and decision-memory proof of concept

`tests/context-poc.cjs` checks the claims in `context-poc.md`: cards keep identity, revisions, links and decision records across edits, moves and a reload; the agent reads cards by link and topic, never by position alone; it names what its thoughts rest on; and ideas you turned down stay on the record and are not offered again.

```bash
node tests/context-poc.cjs                                              # deterministic, scripted model
node tests/context-poc.cjs --live anthropic/claude-haiku-5.5 --runs 5   # also a real model, via an OpenAI-compatible relay
```

`--live` sends the synthetic fixture board (no user data) to `LIVE_BASE` (default `https://openrouter.ai/api/v1`, key from `LIVE_KEY` or an injecting proxy). `--json out.json` writes every check; `--shots dir` saves a screenshot of a thought's "Based on" line. Lines marked KNOWN are recorded limitations; PART means a live rate below the bar but above zero.
