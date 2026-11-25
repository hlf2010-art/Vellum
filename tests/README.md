# Vellum smoke test

`tests/vellum-smoke.cjs` drives the real `Vellum-Lumen.html` in headless Chromium against a scripted model endpoint it serves itself, so agent flows are deterministic and need no API key or network.

```bash
npm i -D playwright && npx playwright install chromium   # once
node tests/vellum-smoke.cjs                               # from the repo root
node tests/vellum-smoke.cjs --headed                      # watch it run
```

It checks that every inline script parses, the sample board loads and every card type can be selected without errors, every argument-free command runs from the composer (and text commands wait for their text), free text becomes an idea card, Try again keeps or replaces drafts correctly (including work done meanwhile and Undo), provenance and the change log are recorded, and the Task Island shows a running crew move, reports what arrived, selects it on Show and cancels on Stop (without falling back to rules). Local AI is mocked at `127.0.0.1:59631` to check that JSON is asked for in words rather than grammar-constrained JSON mode, and that running out of time is not treated as Stop: a crew move falls back to built-in rules and says why, and Copilot keeps the partial answer marked as cut off. It also checks Auto routing with both engines mocked: heavy work (forks, builds, merges) goes to the Cloud API first and light work stays on Local AI, a local draft still wrong after its repair is redone in the cloud (and kept if the cloud fails), the daily cloud budget keeps its last quarter for heavy work, and the island and Copilot say which model answered. Exit code 0 means all checks passed.

It also checks that what you type reaches the model: words typed on a crew draft revise it (the request carries your words and the draft), Critic answers the question you typed, and a question or an @mention of someone else is not taken as a revision. A source you add can be rated on its card (an Unrated pill) and in its sheet. A reply that hits its length limit or time limit says it was cut off, a timeout is never mistaken for Stop, and a timed-out crew move falls back to built-in rules with a message saying why. The scripted endpoint can send `finish_reason` (`finish`) and stream slowly (`slow`, ms per chunk) for these.

With no model to answer (an out-of-credits Cloud API), nothing pretends to be a model's work. Try again replaces nothing when built-in rules give the same drafts, and says so. Words typed on a draft are kept on that draft with a message saying why they couldn't be applied, and no request goes to the broken Cloud API. Copilot opens by saying no model answered and why, invents no directions, and draws an image prompt from what you described. With no image service, `/image` makes one empty frame labelled Not generated instead of pictures that could pass for results.

First run and the no-credit state (group 13) are checked as a first-time user with an OpenRouter key and $0 credit meets them: a welcome says what Vellum is and offers Start a board or Explore the sample (automated browsers skip it unless the address has `?welcome=1`); the sample opens on its first lane at a readable zoom with no draft tray waiting; its groups use the lane names; Test connection on a 402 says the key works but the account is out of credits and links to the provider's billing page, and every status the classifier returns has a message; the pill and the Connection popover say the same thing ("No AI connected", "Out of credits", the model's own name), also after a reload; Media Studio says what it needs instead of "your Windows PC"; `/adopt` on a draft keeps and adopts it; and the same toast twice shows once.

Pin threads and Copilot are covered too. A pin reply ends with up to 3 buttons: the `ACTIONS:` line is split off (also when it follows a word such as "interactions:" or sits in a code fence), invalid buttons are dropped, a reply with none leaves the pin's own button, and the buttons go away once you write again. A search started from a card keeps the camera valid (a `NaN` camera once made the canvas impossible to move and every render throw), and a camera that is already bad heals. Copilot puts new tasks on the kanban already on the board (as a suggested edit when that board is kept, directly for a draft or your own request), still makes a separate board when asked, and shows a proposal as placed once the same card is already on the board. Streamed text is revealed word by word with a fade-in, never goes backwards, and finishes before the final render.

The questions Strategist asks before branching an open idea offer suggestions, not the only answers: each has a row for the designer's own words (typing clears the chosen chip, choosing a chip clears the text, Enter submits, the typed answer is returned like a chosen one, Skip still skips).

Those questions stay about the idea: for an idea with no place or period of its own, a question whose options bring in a city, country, year or company the idea never mentioned ("Berlin 2025", "Siemens Germany") is dropped whichever engine answered and replaced by a relevant one (a business idea gets who it is for, how it makes money, what the first version is); games and ideas set somewhere keep their real places and periods.

Run it before committing a change to `Vellum-Lumen.html`.

## Stage and roles

`stage-role-contract.md` says who does what at each stage. Group 5h checks that the stage is derived from what the designer kept (drafts do not count; adopting moves Explore to Prototype; a frozen proof makes it Snapshot), that the brief counts evidence by weight and names what is decided and open, and that Copilot, the advisor and a pin reply are each told it.

## The bar and the panel

The bottom bar is a command bar and search box, and the conversation lives in the side panel (group 5i). Plain words in the bar also list matching cards (and name matching commands); nothing is picked until ↓, so Enter still does what it did (the words become an idea, a command, or a question for the panel). `@scout`, `@strategist`, `@wright` or `@critic` in the bar (typed, or chosen from the chip) opens the panel with that member preselected ("Asking Critic", dropped with the ×), and the message goes to them; the exception is a draft that member made, where `@name` in the bar still revises it. With the panel open, the selected cards are shown there once and not in the bar too.

It also looks like one (group 5l): a prompt glyph (`›`) on the left, a quiet `+` for adding things, and on the right a key cap that says what Enter will do (`↵ Ask in panel`, `↵ Strategist · fork into 3`, `↵ Add to canvas`). There is no send button, microphone, enhance star or "Command" chip with the AI mark. The send button comes back only on phone width (no hardware Enter) and as the stop button while the crew is working. Enhance (Tab or ⌘E) works only on picture, video and GIF prompts; for ordinary words Tab does nothing special. The bar's corners are those of a bar, not a pill.
When the words match cards, the key cap says `↓ open card` next to what Enter does; after ↓ it says `↵ Open card`, and closing the list brings the ordinary hint back.

With several cards selected (group 5j), right-click on one of them, or on the gap inside the selection, opens a menu for the whole selection (it used to open one card's menu whose items did nothing). Ask Copilot there, and as the first button of the selection bar, opens the panel with the selection as context and the cursor in the input, and sends nothing; the menu and the bar share one set of actions.

The suggestions under an empty Copilot conversation follow the stage (group 5k): three at most, each short enough to read at a glance. An empty board gets help putting the idea in one sentence, what evidence is needed, who it is for; a kept claim with no directions gets "propose 2 directions to test"; with directions, compare them and choose; once one is adopted, the cheapest real test, a two-week plan and questions for five real people; with a frozen proof, what it does not cover and what to decide next. With a card selected the first one is "Critique" that card (by its letter for a direction). Suggestions about images, keyframes, reference photos or web references appear only when an image or frame is selected, so an idea that is not visual is never nudged toward pictures. They follow the interface language.

## Keeping the trail (local server)

The change log keeps 500 entries, but a decision (adopt, keep, discard, accept or decline a suggestion) is never pushed out by routine edits (up to 5,000), and adopting a direction is written to the log. When Vellum is served by `serve_vellum.py` (the Mac app and `Start Vellum.command`), the board is also posted to `/backup/board` as the same `.vellum.json` that Export Board writes, at most every two minutes and only when its content changed (not the camera). The server keeps the newest 10 plus the last one of each day for 30 days, in `~/Vellum Backups/<board>-<id>/`; to restore, use Import Board on a file from that folder. The smoke test checks the page side against a stand-in endpoint (a real browser against the real server was also run once by hand); the server side, including who may write, path safety and the thinning, is tested with:

```bash
python3 studio/macos-app/test_serve_backup.py
```

## Studio AI launcher (local server)

`serve_vellum.py` can open Studio AI for the Connection panel's Start button. Its endpoint is tested
with a stand-in script, so nothing real is launched:

```bash
python3 studio/macos-app/test_serve_launch.py
```

`Start Studio AI.command` takes the sampling temperature from Vellum's stance (fact answers cold, creative forks warm):

```bash
python3 tests/test_studio_ai.py
```

## Data reader (local server)

Tables from a web address read through `/fetch-data` when the site doesn't allow direct reads. It only
fetches public hosts (redirects re-checked), refuses web pages and stops at 8 MB. Tested against a local
stand-in for the internet:

```bash
python3 studio/macos-app/test_serve_fetch.py
```

## Notion databases (local server)

`/notion/database` turns a Notion database into table rows with the integration token saved in MCP Sources.
The token is posted by the page, so the endpoint needs the page's exact origin and the `X-Studio-Client` header.
Tested against a stand-in for Notion's API (property types, paging past 100 rows, the 500-row cap, errors):

```bash
python3 studio/macos-app/test_serve_notion.py
```

## Legibility in both themes

Light and dark are designed separately; a colour that works in one is not assumed to work in the other.
Group 9 of the smoke test opens the Connection and Crew popovers in **both** themes, in the states that change
colour (normal, error, AI off), and fails if any text is below WCAG 4.5:1 (3:1 for large text), with
translucent backgrounds composited and dimming included.

When adding or restyling UI:

- Measure contrast in light *and* dark; don't invert one palette to get the other.
- Dim by changing colour (drop status colour, step down a grey), not by fading text with `opacity`.
- Selected states carry more than a fill: in light, a darker track makes the white pill stand out; in dark, the
  pill itself is lighter. Text weight and colour change too (`--seg-on`, `--seg-track`, `--seg-sm-on`).
- A control that is off must still read as a control: the switch's off state is an outlined track with a grey
  knob (`--sw-off-*`), checked at 3:1 in both themes. Touch screens get a larger hit area, not a larger switch.

## Charts

The table's chart view picks its form from the data: a date/month/quarter/year column makes a line, a
percentage column that adds up to a whole makes bars ranked largest first, anything else keeps table order with
the best value emphasised. Mark colours are `--viz-1`, `--viz-good`, `--viz-muted`, chosen per theme and checked
with the dataviz palette validator (lightness band, chroma, colour-blind separation, contrast). Dark mode uses its
own, lower-lightness steps; the UI accent colours were too bright for large marks on the dark surface. In light mode
the marks are lighter than the text accents (which are tuned for text and read heavy as fills); highlighted marks
keep 3:1, while muted bars are context and may go lighter because every bar's value is labelled and the table view
holds the data.


## Model eval (how well a model does the crew's work)

`tests/model-eval.cjs` drives the real page against a real model and runs four tasks from a first-time session ("I want to make an RPG set in Shanghai"): Strategist branches the idea, Copilot answers the designer's pushback, Copilot merges two directions, Wright writes the scene the designer asked for. It flags obvious errors (wrong count, another city or a famous street of one, an impossible number, a memory test, a copied example, a rules fallback, an anachronism, promised work) and writes a report beside reference answers from Claude Sonnet 5.5.

```bash
node tests/model-eval.cjs --n 3                                   # Local AI: Studio AI must be running with a model loaded
VELLUM_EVAL_KEY=sk-... node tests/model-eval.cjs --api https://openrouter.ai/api/v1 --model anthropic/claude-sonnet-5.5 --n 2
node tests/model-eval.cjs --recheck model-eval-results/local-ai.json   # re-apply the current checks to saved outputs
VELLUM_EVAL_KEY=... node tests/model-eval.cjs --auto --api https://generativelanguage.googleapis.com/v1beta/openai --model gemini-4-hydrogen --n 2 --label auto
```

`--auto` runs Local AI and the Cloud API together, as Auto routes them for a designer; each line shows which model answered. Each sample starts a fresh page, so the daily budget starts fresh too: the reserve never kicks in during an eval. On Gemini's free tier (20 requests a day per model), `--n 2` across four tasks uses about half a day's quota.

The checks catch obvious errors only. For quality, `tests/model-eval-judge.py` blind-scores every output with a strong model (five criteria per task, 0-2 each) and compares runs with a reference run:

```bash
VELLUM_EVAL_KEY=sk-... python3 tests/model-eval-judge.py model-eval-results/*.json --ref sonnet-ref --judge anthropic/claude-sonnet-5.5
```

Judges differ a lot in strictness: in one comparison a free 550B judge gave 4B outputs 2-5 points more than Sonnet did, while both scored Sonnet's own answers alike. Use a strict judge, and note that a judge sharing a model with a run may favour it. Results go to `model-eval-results/` (git-ignored).

### Thinking on vs off

Studio AI offers Qwen3-VL 8B Thinking beside the 8B Instruct model: same size, but it reasons before every answer (its thoughts never reach Vellum). To see whether thinking is worth the time, run the same eval on both with the same, longer time limit, then compare:

```bash
curl -s -X POST http://127.0.0.1:59631/studio/model -H 'X-Studio-Client: canvas' -H 'Content-Type: application/json' -d '{"id":"qwen3-vl-8b"}'
node tests/model-eval.cjs --n 3 --timeout 300 --label 8b-think-off
curl -s -X POST http://127.0.0.1:59631/studio/model -H 'X-Studio-Client: canvas' -H 'Content-Type: application/json' -d '{"id":"qwen3-vl-8b-thinking"}'
node tests/model-eval.cjs --n 3 --timeout 300 --label 8b-think-on
node tests/model-eval.cjs --compare model-eval-results/8b-think-off.json model-eval-results/8b-think-on.json --out model-eval-results/thinking.md
```

Wait for `"status": "ready"` from `curl -s http://127.0.0.1:59631/studio/health` after each switch (the first switch to Thinking downloads 5.8 GB).

## Context and decision-memory proof of concept

`tests/context-poc.cjs` checks the claims in `context-poc.md`: cards keep identity, revisions, links and decision records across edits, moves and a reload; the agent reads cards by link and topic, never by position alone; it names what its thoughts rest on; and ideas you turned down stay on the record and are not offered again. The P0 group (fresh board) covers retrying replies cut off by the token limit, the "built-in rules" tag, held-back repeats in the Crew popover (Show anyway, Dismiss), and the newer rejection signals. Group F checks that nothing breaks when no model can be reached: a 402 (no credits) on chat or embeddings, and no key at all.

```bash
node tests/context-poc.cjs                                              # deterministic, scripted model
node tests/context-poc.cjs --live anthropic/claude-haiku-5.5 --runs 5   # also a real model, via an OpenAI-compatible relay
```

`--live` sends the synthetic fixture board (no user data) to `LIVE_BASE` (default `https://openrouter.ai/api/v1`, key from `LIVE_KEY` or an injecting proxy). `--json out.json` writes every check; `--shots dir` saves a screenshot of a thought's "Based on" line. Lines marked KNOWN are recorded limitations; PART means a live rate below the bar but above zero.
