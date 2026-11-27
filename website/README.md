# Vellum website

The public home page for Vellum: what it is, how it works, the waitlist and downloads.
It's static HTML, CSS and JS with no build step and no dependencies. It works in English and Chinese, in light and dark, from 320 px wide up.

```
website/
  index.html     page structure and icon sprite (English copy is the no-JS fallback)
  styles.css     tokens mirror design-system/tokens.css, plus the site's type, spacing and light
  site.js        copy for EN/中文, the live board, the zones board, crew modes, waitlist, downloads
  fonts/         Bricolage Grotesque (display) and Inter (body), both OFL, self-hosted
  assets/        the logo
  lab/           parked pieces kept for later polish, not linked from the page
  functions/     api/waitlist.js, the waitlist endpoint as a Cloudflare Pages Function
  _headers       security and cache headers for Cloudflare Pages
```

Preview locally: `cd website && python3 -m http.server 8080`, then open http://localhost:8080 (add `?lang=zh` for Chinese).

## Going live

Everything that isn't real yet lives in `CONFIG` at the top of `site.js`.

1. **Downloads.** Publish a GitHub release with a macOS build and a Windows build, then set `CONFIG.downloads.mac` and `.win` to the asset URLs (`releases/latest/download/<file>` always points at the newest release). Until then everyone joins the waitlist. Once a build is live for the visitor's system (guessed from the browser), the button becomes "Download for macOS" (or Windows); a visitor whose build isn't out yet still gets the waitlist button.
2. **Waitlist.** "Join the waitlist" (the section's one button) opens a small dialog that asks for an email, the preferred system (macOS or Windows, preselected from the browser on a computer) and, in their own words, what it's for. All three are required; joining sends one POST of `{email, os, use, lang}` to `CONFIG.waitlistEndpoint` (`/api/waitlist`). On Cloudflare Pages that's `functions/api/waitlist.js`, which saves each sign-up in the `WAITLIST` KV namespace, one key per email (joining twice keeps the first date). Wherever nothing can take the sign-up (a local preview, or Pages before the KV is bound) the server answers 404/405/501/503 and the dialog says sign-ups open soon and that nothing was sent. It never shows "You're on the list" unless the sign-up was saved. To download the list, set an `ADMIN_TOKEN` secret and run `curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<site>/api/waitlist -o waitlist.csv`, or browse the KV namespace in the Cloudflare dashboard.
3. **Demo.** Once the in-browser demo is deployed (built from this repo, so it updates with `main`), set `CONFIG.demo` to its URL. A "Try the demo" button then appears to the left of "Join the waitlist". Never link an unsigned download here: the system security warning is the wrong first impression.
4. **Hosting (Cloudflare Pages).** Workers & Pages → Create → Pages → Connect to Git → this repo. Production branch `main`, framework preset None, build command empty, build output directory `.`, root directory `website`. Then Storage & Databases → KV → create `vellum-waitlist`; in the Pages project, Settings → Bindings → add KV namespace, variable name `WAITLIST`, pointing at it; optionally Settings → Variables and Secrets → add secret `ADMIN_TOKEN`. Redeploy once so the binding applies. Every merge to `main` publishes. Fonts and assets are self-hosted, so the page doesn't depend on Google Fonts. Any other static host serves the page too, but the waitlist then needs its own endpoint.
5. **Domain and sharing.** Add the domain, then an `og:image` (a 1200×630 crop of the board) and a canonical URL in `<head>`.

## Design rules

- **One idea: the board is the pitch.** The page is built from the app's own cards, lines and colours rather than screenshots. Colours mean what they mean in the app: A–D only for directions, green and red only for supports and counters, ink outlines for reasoning, and set-aside ideas sit under a sheet of vellum, readable, with the reason on top.
- **Five sections, nothing said twice.** Hero board, Why (the contrast), How (the zones board), Crew, Get Vellum. "Get Vellum" in the header is the only call to action above the last section; "Join the waitlist" appears once.
- **One system.** One spacing scale (`--s1`…`--s10`, `--section`), one radius set, one icon stroke (1.6), one segmented control for every "pick one of three", one primary button per card. Sibling buttons share size and label grammar.
- **Few words.** A title and one dry, true sentence per section. Helper text only where it prevents a mistake. Chinese is written, not translated; headings use `word-break: keep-all` with a zero-width space (`​`) marking where a line may break.
- **Light with a reason.** Boards are lit from the top left like paper on a drafting table; the waiting flag glows ("waiting on you"). Everything holds in dark mode.
- **Motion that explains.** The hero plays once when it scrolls into view; the zones board traces one lineage once, and the prototype card plays when you reach it. Cards are paper: they lift, tilt as you drag and settle. Touch scrolls instead of dragging. With reduced motion every animation is off and the final state shows at once.
- **Layouts.** The hero board has three layouts (wide reads left to right; tablet and phone read top to bottom). The zones board stacks below 900 px, with the chosen direction first and lines passing behind lane titles.
- The hero board, the outputs and the crew lines tell one story: an AI video-editing agent deciding whether to hand over a finished cut or leave the key moments to the editor (Mars chose it on 2026-11-27; the in-browser demo board tells the same story). The zones board shows three kinds of work: product design (AI glasses), short video and an AI feature. Change copy in `T`, `BOARD` and `CASES` in `site.js`, both languages together.
- Chinese text uses `fonts/VellumSansSC-subset.woff2`, Noto Sans SC (SIL OFL) cut down to the characters on the page (about 110 KB). After changing Chinese copy, re-subset it: collect the CJK characters from `site.js` and `index.html` into a text file, then run `pyftsubset NotoSansSC-VF.woff2 --text-file=chars.txt --flavor=woff2 --layout-features="*" --output-file=fonts/VellumSansSC-subset.woff2`. A missed character falls back to the system font.
