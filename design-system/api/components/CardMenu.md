<!-- Generated from components/index.d.ts by scripts/build_api.py. -->
# CardMenu

The right-click (or ⋯) menu for a card.

`Vellum.CardMenu` · Board

## Use

```jsx
<Vellum.Root><Vellum.CardMenu /></Vellum.Root>
```

## Props (CardMenuProps)

| prop | type | note |
| --- | --- | --- |
| `title` | `string` |  |
| `kind` | `string` |  |
| `locked` | `boolean` |  |
| `items` | `(CardMenuItem \| '-')[]` |  |
| `onClose` | `() => void` | Escape. Arrow keys, Home and End move between items. |
| `autoFocus` | `boolean` | Focus the first item on open. Use when the menu opens from a right-click or keypress. |

## More

Long-form usage: `components/CardMenu/README.md`.
