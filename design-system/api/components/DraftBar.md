<!-- Generated from components/index.d.ts by scripts/build_api.py. -->
# DraftBar

The decision bar for crew work waiting on you: who made it and what, then **Discard · Retry · Keep**.

`Vellum.DraftBar` · Crew

## Use

```jsx
<Vellum.Root><Vellum.DraftBar /></Vellum.Root>
```

## Props (DraftBarProps)

| prop | type | note |
| --- | --- | --- |
| `member` | `CrewMember` |  |
| `what` | `string` | e.g. "1 direction", "3 proofs" |
| `count` | `number` |  |
| `index` | `number` |  |
| `onDiscard` | `() => void` |  |
| `onRetry` | `() => void` |  |
| `onKeep` | `() => void` |  |

## More

Long-form usage: `components/DraftBar/README.md`.
