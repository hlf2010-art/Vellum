<!-- Generated from components/index.d.ts by scripts/build_api.py. -->
# ProofCard

An experiment that tests a direction.

`Vellum.ProofCard` · Board

## Use

```jsx
<Vellum.Root><Vellum.ProofCard /></Vellum.Root>
```

## Props (ProofCardProps)

| prop | type | note |
| --- | --- | --- |
| `title` | `string` |  |
| `lineage` | `Lineage` |  |
| `format` | `'page' \| 'tour' \| 'deck'` |  |
| `test` | `string` | The direction's test. Not shown on the card (it lives on the direction and in the sheet); kept for the sheet. |
| `versions` | `ProofVersion[]` |  |
| `viewing` | `number` |  |
| `state` | `'idle' \| 'building'` |  |
| `buildNote` | `string` |  |
| `sourcesChanged` | `number` | Number of sources changed since the latest version. |
| `sources` | `number` |  |
| `time` | `string` |  |
| `iterating` | `boolean` |  |
| `onOpen` | `() => void` |  |
| `onFix` | `() => void` |  |
| `onRebuild` | `() => void` |  |
| `onTest` | `() => void` |  |
| `onSnapshot` | `() => void` |  |
| `onChange` | `() => void` | "Change": select the card and focus the composer. |
| `onIterate` | `(text: string) => void` |  |

## More

Long-form usage: `components/ProofCard/README.md`.
