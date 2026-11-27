<!-- Generated from components/index.d.ts by scripts/build_api.py. -->
# CommandMenu

The rows inside the ⌘K palette: suggestions, every command after `/`, and card search results.

`Vellum.CommandMenu` · Canvas chrome

## Use

```jsx
<Vellum.Root><Vellum.CommandMenu /></Vellum.Root>
```

## Props (CommandMenuProps)

| prop | type | note |
| --- | --- | --- |
| `sections` | `CommandSection[]` |  |
| `title` | `string` |  |
| `items` | `CommandItem[]` |  |
| `active` | `number` |  |
| `embedded` | `boolean` | Inside the palette: no surface of its own, a hairline at the top. |
| `compact` | `boolean` | The "/" list above the Copilot input: 36px rows, no names. |
| `tip` | `React.ReactNode` |  |
| `onPick` | `(item: CommandItem) => void` |  |

## More

Long-form usage: `components/CommandMenu/README.md`.
