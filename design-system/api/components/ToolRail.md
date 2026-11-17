<!-- Generated from components/index.d.ts by scripts/build_api.py. -->
# ToolRail

The vertical canvas tool palette that floats on the left edge of the board.

`Vellum.ToolRail` · Canvas chrome

## Use

```jsx
<Vellum.Root><Vellum.ToolRail /></Vellum.Root>
```

## Props (ToolRailProps)

| prop | type | note |
| --- | --- | --- |
| `active` | `'select' \| 'lasso' \| 'hand'` |  |
| `orientation` | `'vertical' \| 'horizontal'` |  |
| `disabled` | `string[]` | Tool ids to disable, e.g. ['undo','redo'] on a fresh board. |

## More

Long-form usage: `components/ToolRail/README.md`.
