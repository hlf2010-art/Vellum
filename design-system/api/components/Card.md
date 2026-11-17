<!-- Generated from components/index.d.ts. -->
# Card

Every object on a Vellum board is a Card: a card face, radius-card corners, shadow-card, then a kind line, title, body and footer.

`Vellum.Card` · Board

## Use

```jsx
<Vellum.Card>…</Vellum.Card>
```

```html
<x-import component-from-global-scope="Vellum.Card">…</x-import>
```

## Props (CardProps)

| prop | type | note |
| --- | --- | --- |
| `kind` | `'source' \| 'recording' \| 'image' \| 'frame' \| 'audio' \| 'link' \| 'notepad'` | Which card. Sets width, title style and body. `print` is an alias of `snapshot`. |
| `title` | `string` |  |
| `children` | `React.ReactNode` | Body copy (`body`, `label-2`); for `group`, the child cards. |
| `eyebrow` | `string` | Kind-line text, e.g. "MD · Playtest Telemetry", "Question on Proof B v2". |
| `by` | `'scout' \| 'strategist' \| 'wright' \| 'critic'` | Crew byline (18px orb) for crew-made cards. |
| `lineage` | `'A' \| 'B' \| 'C' \| 'D'` | Direction, proof, question, snapshot, group tint. |
| `weight` | `'observed' \| 'reported' \| 'proposed' \| 'illustrative'` | Evidence pill in the footer (evidence kinds). |
| `meta` | `string` | Right side of the footer, e.g. "2 notes · 5:44 AM". |
| `footLeft` | `React.ReactNode` | Left side of the footer when there is no weight, e.g. "Explore Desk". |
| `image` | `string; imageAlt?: string` | Media kinds: poster / thumbnail URL. |
| `badge` | `string` | Media badge, e.g. "WEBM", "JPEG". |
| `timecode` | `string` | recording / frame: "0:08", "@ 0:04.2". |
| `aspect` | `string` |  |
| `test` | `string` | direction: the line that could prove it wrong. |
| `duration` | `string; progress?: number` | audio |
| `url` | `string` | link: shown in mono without the scheme. |
| `text` | `string` | notepad: long text, line breaks kept. |
| `rating` | `{ observed?: number; reported?: number; unrated?: number }` | idea / synthesis: evidence-mix bar and "N/M rated". |
| `points` | `{ label?: string; text: string }[]` | synthesis |
| `version` | `string; sources?: string[]` | proof |
| `items` | `{ text: string; done?: boolean }[]` | list |
| `columns` | `{ title: string; items: string[]; lineage?: Lineage }[]` | kanban (three columns, tinted A, B, C unless `lineage` given) |
| `edition` | `number; of?: string` | snapshot |
| `adopted` | `boolean; disliked?: boolean; lit?: boolean` |  |
| `locked` | `boolean` | Only you can change it: shows a lock badge. |
| `proposal` | `{ member?; op?: 'edit' \| 'delete' \| 'link'; from?: string; open?: boolean; field?: string; diff?: [string…` | A crew-suggested change to a kept card. |
| `width` | `number \| string` |  |
| `headExtra` | `React.ReactNode` |  |

## More

Long-form usage: `components/Card/README.md`.
