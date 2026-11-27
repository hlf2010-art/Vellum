# In-browser demo

The website's "Try the demo" opens a static build of the app in demo mode. It is built from `Vellum-Lumen.html` on every push, so it follows `main`.

What a visitor gets:

- The demo board: an AI video-editing agent that has already made its decision (the same story as the home page).
- One cue: add the new evidence (Beta test), watch the crew re-check the decision, then open the decision and keep or reopen it.
- The crew replays one real run, recorded beforehand. The note says "recorded re-check", the decision view says "Crew re-check · recorded", and the crew menu says which model it was and when.
- Everything that needs no model works for real: cards, relations, snapping, the decision view, board checks, Undo.
- Nothing leaves the browser. Boards, settings and files live in memory, and a refresh starts over. The headers (`site/_headers`) only allow requests to the page's own origin.
- No local AI setup, no Studio AI or Media Studio, and no download.

## Files

| Path | What it is |
|---|---|
| `config.json` | Page title, the website link for "Join the waitlist" (`site`), media file names, what the build strips |
| `recording.json` | The crew run the demo replays. `real: true` only when written by `tools/demo/record-run.cjs` |
| `media/` | Real media, when it exists: `beta-clip.mp4`, `editor-quote-en.m4a`, `editor-quote-zh.m4a`. Without them the board draws stand-ins in code |
| `site/` | Copied into the build as is: `terms.html`, `_headers`, `robots.txt` |
| `../tools/demo/build.mjs` | The build: `npm run build:demo` (release) or `npm run build:demo:dev` |
| `../tools/demo/record-run.cjs` | Records the real run |
| `../tools/demo/serve.cjs` | Serves `dist/demo` locally with the same headers as the host |
| `../tests/demo-mode.cjs` | The demo's test (builds first) |

## Recording the real run

The current `recording.json` is a placeholder written by hand to build the replay. A release build refuses it.

On the Mac mini with Studio AI running (Local AI, Qwen 3.5 9B):

```bash
npm install
node tools/demo/record-run.cjs
```

Or with any OpenAI-compatible API:

```bash
API_BASE=https://openrouter.ai/api/v1 API_MODEL=qwen/qwen3.5-9b API_KEY=… node tools/demo/record-run.cjs
```

It records English and Chinese, keeps the answers exactly as the model gave them, and writes nothing if the app's watchdog rejects an answer. Commit the new `recording.json`. Change the board's cards and the recording no longer matches (the replay is keyed to the cards the crew read): record again after any change to the demo board.

## Deploying on Cloudflare Pages

Not deployed yet. When you want it: Workers & Pages → Create → Pages → Connect to Git → this repository, then:

- Production branch: `main`
- Build command: `npm run build:demo`
- Build output directory: `dist/demo`
- Environment variable: `NODE_VERSION` = `20`

Every push to `main` then rebuilds the demo, and pull requests get preview links. A private repository works the same way. Pages serves from Cloudflare's network, which is generally reachable from mainland China but not guaranteed; if it is slow there, the same `dist/demo` folder can be served from the VPS behind any static server (copy `_headers` rules into its config).

When the URL exists, set `CONFIG.demo` in `website/site.js` to it, and `site` in `config.json` to the website, so "Join the waitlist" in the demo goes back to the site.

## What the build strips, and what it can't

`build.mjs` replaces the bodies of the functions that call models and local services with stubs, empties every string that reads like a crew prompt (`RC_RULES`, `ROLE`, the fork, build and Copilot prompts), removes the local and cloud endpoints, drops the other samples' embedded media, splits the fonts into files, and minifies everything with no comments or source maps. It fails a release if any prompt or endpoint is still in the page.

That keeps the demo to what it needs. It does not make it secret: front-end code in a browser can always be read. The crew's prompts, routing and anything server-side are what's worth protecting, and they are not in the demo.
