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

## Model eval (how well a model does the crew's work)

`tests/model-eval.cjs` drives the real page against a real model and runs four tasks from a first-time session ("I want to make an RPG set in Shanghai"): Strategist branches the idea, Copilot answers the designer's pushback, Copilot merges two directions, Wright writes the scene the designer asked for. It flags obvious errors (wrong count, another city or a famous street of one, an impossible number, a memory test, a copied example, a rules fallback, an anachronism, promised work) and writes a report beside reference answers from Claude Sonnet 5.5.

```bash
node tests/model-eval.cjs --n 3                                   # Local AI: Studio AI must be running with a model loaded
VELLUM_EVAL_KEY=sk-... node tests/model-eval.cjs --api https://openrouter.ai/api/v1 --model anthropic/claude-sonnet-5.5 --n 2
node tests/model-eval.cjs --recheck model-eval-results/local-ai.json   # re-apply the current checks to saved outputs
```

The checks catch obvious errors only. For quality, `tests/model-eval-judge.py` blind-scores every output with a strong model (five criteria per task, 0-2 each) and compares runs with a reference run:

```bash
VELLUM_EVAL_KEY=sk-... python3 tests/model-eval-judge.py model-eval-results/*.json --ref sonnet-ref --judge anthropic/claude-sonnet-5.5
```

Judges differ a lot in strictness: in one comparison a free 550B judge gave 4B outputs 2-5 points more than Sonnet did, while both scored Sonnet's own answers alike. Use a strict judge, and note that a judge sharing a model with a run may favour it. Results go to `model-eval-results/` (git-ignored).
