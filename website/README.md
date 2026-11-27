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
```

Preview locally: `cd website && python3 -m http.server 8080`, then open http://localhost:8080 (add `?lang=zh` for Chinese).

## Going live

Everything that isn't real yet lives in `CONFIG` at the top of `site.js`.

1. **Downloads.** Publish a GitHub release with a macOS build and a Windows build, then set `CONFIG.downloads.mac` and `.win` to the asset URLs (`releases/latest/download/<file>` always points at the newest release). Until then everyone joins the waitlist. Once a build is live for the visitor's system (guessed from the browser), the email line becomes "Download for macOS" (or Windows); a visitor whose build isn't out yet still gets the email line.
2. **Waitlist.** Point `CONFIG.waitlistEndpoint` at anything that accepts a JSON POST, such as Formspree, Buttondown, Loops, or a small Cloudflare Worker. Joining sends `{email, os, lang}` right away (`os` is `"mac"`, `"win"` or `""`, guessed from the browser; phones and tablets send `""`). A small dialog then asks for the preferred system and, in their own words, what it's for; if they change the system or write something, a second POST sends `{email, os, use, lang, update: true}`. Skipping or closing the dialog keeps the sign-up. Until the endpoint is set, a sign-up tells the visitor it's a preview and sends nothing.
3. **Hosting.** Any static host works: GitHub Pages (serve `/website`), Cloudflare Pages or Vercel. Fonts and assets are self-hosted, so the page doesn't depend on Google Fonts and loads in mainland China.
4. **Domain and sharing.** Add the domain, then an `og:image` (a 1200×630 crop of the board) and a canonical URL in `<head>`.

## Design rules

- **One idea: the board is the pitch.** The page is built from the app's own cards, lines and colours rather than screenshots. Colours mean what they mean in the app: A–D only for directions, green and red only for supports and counters, ink outlines for reasoning, and set-aside ideas sit under a sheet of vellum, readable, with the reason on top.
- **Five sections, nothing said twice.** Hero board, Why (the contrast), How (the zones board), Crew, Get Vellum. "Get Vellum" in the header is the only call to action above the last section; "Join the waitlist" appears once.
- **One system.** One spacing scale (`--s1`…`--s10`, `--section`), one radius set, one icon stroke (1.6), one segmented control for every "pick one of three", one primary button per card. Sibling buttons share size and label grammar.
- **Few words.** A title and one dry, true sentence per section. Helper text only where it prevents a mistake. Chinese is written, not translated; headings use `word-break: keep-all` with a zero-width space (`​`) marking where a line may break.
- **Light with a reason.** Boards are lit from the top left like paper on a drafting table; the waiting flag glows ("waiting on you"). Everything holds in dark mode.
- **Motion that explains.** The hero plays once when it scrolls into view; the zones board traces one lineage once, and the prototype card plays when you reach it. Cards are paper: they lift, tilt as you drag and settle. Touch scrolls instead of dragging. With reduced motion every animation is off and the final state shows at once.
- **Layouts.** The hero board has three layouts (wide reads left to right; tablet and phone read top to bottom). The zones board stacks below 900 px, with the chosen direction first and lines passing behind lane titles.
- The examples are product design (a camping lantern, a desk fan), short video and an AI feature, in that order, because that's the order of Vellum's use cases. Change copy in `T`, `BOARD` and `CASES` in `site.js`, both languages together.
