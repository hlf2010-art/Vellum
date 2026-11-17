<!-- Generated from components/index.d.ts by scripts/build_api.py. -->
# Overview

The minimap at the bottom left: zoom, a schematic of the four stages, and stage tabs.

`Vellum.Overview` · Canvas chrome

## Use

```jsx
<Vellum.Root><Vellum.Overview /></Vellum.Root>
```

## Props (OverviewProps)

| prop | type | note |
| --- | --- | --- |
| `zoom` | `number` |  |
| `stage` | `number` | Index of the stage in view. |
| `stages` | `string[]` |  |
| `pending` | `number[]` | Stage indexes with crew work waiting (a dot on the tab). |
| `title` | `string` |  |
| `cards` | `[number, number, number, number, number, 0 \| Lineage \| 'note'][]` | Schematic cards: [stage, x, y, w, h, tone] with x..h as 0–1 fractions and tone 0 \| 'A'–'D' \| 'note'. |
| `onStage` | `(i: number) => void` |  |

## More

Long-form usage: `components/Overview/README.md`.
