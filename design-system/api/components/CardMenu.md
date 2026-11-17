<!-- Generated from components/index.d.ts. -->
# CardMenu

The right-click (or ⋯) menu for a card.

`Vellum.CardMenu` · Board

## Use

```jsx
<Vellum.CardMenu />
```

```html
<x-import component-from-global-scope="Vellum.CardMenu"></x-import>
```

## Props (CardMenuProps)

| prop | type | note |
| --- | --- | --- |
| `title` | `string` |  |
| `kind` | `string` |  |
| `locked` | `boolean` |  |
| `items` | `(CardMenuItem \| '-')[]` |  |

### CardMenuItem

| prop | type | note |
| --- | --- | --- |
| `label` * | `string` |  |
| `icon` | `string` |  |
| `key` | `string` |  |
| `danger` | `boolean` |  |

## More

Long-form usage: `components/CardMenu/README.md`.
