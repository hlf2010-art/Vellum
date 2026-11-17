<!-- Generated from components/index.d.ts. -->
# ToolRail

The vertical canvas tool palette that floats on the left edge of the board.

`Vellum.ToolRail` · Canvas chrome

## Use

```jsx
<Vellum.ToolRail />
```

```html
<x-import component-from-global-scope="Vellum.ToolRail"></x-import>
```

## Props (ToolRailProps)

| prop | type | note |
| --- | --- | --- |
| `active` | `'select' \| 'lasso' \| 'hand'` |  |
| `orientation` | `'vertical' \| 'horizontal'` |  |
| `disabled` | `string[]` | Tool ids to disable, e.g. ['undo','redo'] on a fresh board. |

## More

Long-form usage: `components/ToolRail/README.md`.
