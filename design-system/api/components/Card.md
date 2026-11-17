<!-- Generated from components/index.d.ts by scripts/build_api.py. -->
# Card

Every object on a Vellum board is a Card: a `card` face, `radius-card` corners, `shadow-card`, then a kind line, title, body and footer.

`Vellum.Card` · Board

## Use

```jsx
<Vellum.Root><Vellum.Card /></Vellum.Root>
```

## Props (CardProps)

| prop | type | note |
| --- | --- | --- |
| `kind` | `'source' \| 'recording' \| 'image' \| 'frame' \| 'audio' \| 'link' \| 'notepad' \| 'idea' \| 'synthesis' \| 'direction' \| 'question' \| 'note' \| 'proof' \| 'list' \| 'kanban' \| 'snapshot' \| 'print' \| 'group'` | Which card. Sets width, title style and body. `print` is an alias of `snapshot`. |
| `title` | `string` |  |
| `children` | `React.ReactNode` | Body copy (`body`, `label-2`); for `group`, the child cards. |
| `eyebrow` | `string` | Kind-line text, e.g. "MD · Playtest Telemetry", "Question on Proof B v2". |
| `by` | `CrewMember` | Crew byline (18px orb) for crew-made cards. |
| `lineage` | `Lineage` | Direction, proof, question, snapshot, group tint. |
| `weight` | `Weight` | Evidence pill in the footer (evidence kinds). |
| `meta` | `string` | Right side of the footer, e.g. "2 notes · 5:44 AM". |
| `footLeft` | `React.ReactNode` | Left side of the footer when there is no weight, e.g. "Explore Desk". |
| `image` | `string` | Media kinds: poster / thumbnail URL. |
| `imageAlt` | `string` |  |
| `badge` | `string` | Media badge, e.g. "WEBM", "JPEG". |
| `timecode` | `string` | recording / frame: "0:08", "@ 0:04.2". |
| `aspect` | `string` |  |
| `test` | `string` | direction: the line that could prove it wrong. |
| `duration` | `string` | audio |
| `progress` | `number` |  |
| `url` | `string` | link: shown in mono without the scheme. |
| `text` | `string` | notepad: long text, line breaks kept. |
| `rating` | `{ observed?: number; reported?: number; unrated?: number }` | idea / synthesis: evidence-mix bar and "N/M rated". |
| `points` | `{ label?: string; text: string }[]` | synthesis |
| `version` | `string` | proof |
| `sources` | `string[]` |  |
| `items` | `{ text: string; done?: boolean }[]` | list |
| `columns` | `{ title: string; items: string[]; lineage?: Lineage }[]` | kanban (three columns, tinted A, B, C unless `lineage` given) |
| `edition` | `number` | snapshot |
| `of` | `string` |  |
| `adopted` | `boolean` |  |
| `disliked` | `boolean` |  |
| `lit` | `boolean` |  |
| `locked` | `boolean` | Only you can change it: shows a lock badge. |
| `proposal` | `{ member?: CrewMember; op?: 'edit' \| 'delete' \| 'link'; from?: string; open?: boolean; field?: string; diff?: [string, string]; stale?: boolean }` | A crew-suggested change to a kept card. |
| `width` | `number \| string` |  |
| `headExtra` | `React.ReactNode` |  |
| `selected` | `boolean` | Selected on the board: a focus-colour ring. |
| `state` | `'idle' \| 'loading' \| 'error'` | `loading`: the crew is reading or writing this card (a light sweep; static under reduced motion). `error`: the last crew action on it failed. |
| `error` | `string` | Error line shown when `state` is `error`. Default "Couldn’t finish. Your card is unchanged." |
| `onRetry` | `() => void` | Shows a Retry button in the error line. |
| `onSelect` | `() => void` | Click / Enter on the card. |
| `tabIndex` | `number` | Cards are focusable by default (0). Pass -1 inside a roving-focus board. |

## More

Long-form usage: `components/Card/README.md`.
