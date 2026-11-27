<!-- Generated from components/index.d.ts by scripts/build_api.py. -->
# Composer

The ⌘K command palette: one field in the middle of the screen for commands, card search and new ideas.

`Vellum.Composer` · Canvas chrome

## Use

```jsx
<Vellum.Root><Vellum.Composer /></Vellum.Root>
```

## Props (ComposerProps)

| prop | type | note |
| --- | --- | --- |
| `open` | `boolean` | false: only the hint pill ("⌘K Commands") at the bottom centre. Default true: the open palette. |
| `placeholder` | `string` | Default "Type a command, or search". With no cards yet the app says "Type a command, or write an idea". |
| `value` | `string` |  |
| `hintLabel` | `string` | Hint pill text. Default "Commands". |
| `suggestions` | `CommandItem[]` | Up to three rows shown while the field is empty, each with its keycap. |
| `commands` | `CommandItem[]` | Rows listed after "/" and matched against plain words. |
| `cards` | `CommandItem[]` | Cards matched against plain words (two characters or more). |
| `route` | `string` | What Enter will do once there is text, shown at the right with a ↵ keycap. Default "Run command" / "Add as an idea". |
| `learned` | `boolean` | Hides the "Type / to see every command" tip once someone has used "/" a few times. |
| `autoFocus` | `boolean` |  |
| `onOpen` | `() => void` |  |
| `onClose` | `() => void` |  |
| `onSubmit` | `(text: string) => void` |  |
| `onPick` | `(item: CommandItem) => void` |  |

## More

Long-form usage: `components/Composer/README.md`.
