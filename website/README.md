# Vellum website

The public home page for Vellum: what it is, how it works, the waitlist, and downloads.
It's static HTML, CSS and JS with no build step and no dependencies. It works in English and Chinese, in light and dark, from 360 px wide up.

```
website/
  index.html     page structure (English copy is the no-JS fallback)
  styles.css     colours mirror design-system/tokens.css
  site.js        copy for EN/中文, the live board demo, waitlist, downloads
  fonts/         Bricolage Grotesque (display) and Inter (body), both OFL, self-hosted
  assets/        logo, board screenshots (light/dark × en/zh), snap demo video
```

Preview locally: `cd website && python3 -m http.server 8080`, then open http://localhost:8080 (add `?lang=zh` for Chinese).

## Going live

Everything that isn't real yet lives in `CONFIG` at the top of `site.js`.

1. **Downloads.** Publish a GitHub release with a macOS build and a Windows build, then set `CONFIG.downloads.mac` and `.win` to the asset URLs. A `releases/latest/download/<file>` URL always points at the newest release. Until those are set, both buttons open the releases page and the page says no build is out yet.
2. **Waitlist.** Point `CONFIG.waitlistEndpoint` at anything that accepts a JSON POST of `{email, use, lang}`, such as Formspree, Buttondown, Loops, or a small Cloudflare Worker that writes to a sheet. Once it's set, the "Preview: sign-ups aren't sent anywhere yet" note disappears and real confirmations are shown.
3. **Hosting.** Any static host works: GitHub Pages (serve `/website`), Cloudflare Pages or Vercel. All fonts and assets are self-hosted, so the page doesn't depend on Google Fonts and loads in mainland China.
4. **Domain and sharing.** Add the domain, then add an `og:image` (a 1200×630 crop of the board) and a canonical URL to `<head>`.

## Design rules

- Colours mean what they mean in the app. Lineage A–D appear only where they stand for a direction, green and red only on supports and counters relations. Reasoning cards are drawn in ink, evidence is plain paper, and set-aside directions stay readable with their reason instead of fading.
- The hero board is the pitch. It plays once when it scrolls into view. The visitor can drag cards, and the last step's Reopen and Still holds buttons both work. With reduced motion it shows the final state straight away.
- The board copy is a camping lantern, because product design is Vellum's first use case. The "How it works" screenshots come from `reasoning-workflow` captures of the real app. Retake them when the UI changes.
