<!-- Generated from components/index.d.ts by scripts/build_api.py. -->
# Sheet

The Margin: a card opened to read and write in full.

`Vellum.Sheet` · Board

## Use

```jsx
<Vellum.Root><Vellum.Sheet /></Vellum.Root>
```

## Props (SheetProps)

| prop | type | note |
| --- | --- | --- |
| `title` | `string` |  |
| `kind` | `CardProps['kind']` | Card kind; shown with the author as one phrase ("Synthesis by Scout"). |
| `kindLabel` | `string` |  |
| `by` | `CrewMember \| 'you'` | Crew member who made it. Omit or 'you' for your own cards: no byline. |
| `engine` | `string` | Engine for the tooltip: "local service", "built-in rules", a model name. |
| `rev` | `number` | Shown only from v2. |
| `time` | `string` | Relative time ("3 h ago") and the full date for its tooltip. |
| `timeFull` | `string` |  |
| `lineage` | `Lineage` |  |
| `tools` | `React.ReactNode` | Round filled buttons before Close (votes, More). |
| `children` | `React.ReactNode` |  |
| `composer` | `{ placeholder?: string; onSend?: (text: string) => void } \| false` | The note composer; false hides it. |
| `onClose` | `() => void` |  |
| `width` | `number \| string` |  |
| `bodyHeight` | `number \| string` |  |

## More

Long-form usage: `components/Sheet/README.md`.
