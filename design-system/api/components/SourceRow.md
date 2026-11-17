<!-- Generated from components/index.d.ts by scripts/build_api.py. -->
# SourceRow

One row of “Based on” inside a `Sheet`: the kind on its own line, the **full** title under it, and at most one pill at the right.

`Vellum.SourceRow` · Board

## Use

```jsx
<Vellum.Root><Vellum.SourceRow /></Vellum.Root>
```

## Props (SourceRowProps)

| prop | type | note |
| --- | --- | --- |
| `kind` | `string` | Kind label shown above the title ("Question", "Direction B"). |
| `title` | `string` | The full title. Never clip it. |
| `weight` | `Weight` |  |
| `status` | `'changed' \| 'frozen' \| 'unavailable' \| 'archived' \| 'hidden'` | Exceptions only; the default (live) link shows nothing. |
| `statusLabel` | `string` |  |
| `onOpen` | `() => void` |  |

## More

Long-form usage: `components/SourceRow/README.md`.
