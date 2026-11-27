<!-- Generated from components/index.d.ts by scripts/build_api.py. -->
# SelectionBar

What you can do with two or more selected cards: one small solid bar, 8–12px above them, that follows them as they move.

`Vellum.SelectionBar` · Board

## Use

```jsx
<Vellum.Root><Vellum.SelectionBar /></Vellum.Root>
```

## Props (SelectionBarProps)

| prop | type | note |
| --- | --- | --- |
| `onAsk` | `() => void` | Opens Copilot with the selection as one removable chip. ⌘↵ does the same. |
| `make` | `SelectionBarItem[]` | The ▾ menu: make something on the canvas without opening the chat. Default Synthesize, Action list, Kanban, Tree map, Critique. |
| `hasPictures` | `boolean` | GIF and Video join the ▾ menu after a gap, only when the selection has pictures. |
| `more` | `SelectionBarItem[]` | The ⋯ menu: arranging (align, distribute, duplicate). |
| `menu` | `'make' \| 'more' \| null` |  |
| `onRelate` | `() => void` |  |
| `onGroup` | `() => void` |  |
| `onHide` | `() => void` |  |
| `onDelete` | `() => void` |  |

## More

Long-form usage: `components/SelectionBar/README.md`.
