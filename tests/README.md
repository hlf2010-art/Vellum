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
