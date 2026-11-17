<!-- Generated from components/index.d.ts by scripts/build_api.py. -->
# Composer

The command bar at the bottom centre of every board: one calm row where you write an idea or a `/` command.

`Vellum.Composer` · Canvas chrome

## Use

```jsx
<Vellum.Root><Vellum.Composer /></Vellum.Root>
```

## Props (ComposerProps)

| prop | type | note |
| --- | --- | --- |
| `placeholder` | `string` | Default "Write an idea, or / for commands". |
| `value` | `string` |  |
| `hint` | `string` |  |
| `route` | `{ member?: CrewMember \| null; label: string }` | Who handles the request; the chip appears once there is text (or with showRoute). |
| `showRoute` | `boolean` |  |
| `onSend` | `(text: string) => void` | Enter sends, Shift+Enter breaks the line; the field grows to 160px. |
| `recording` | `boolean` | Mic is recording: danger tint, aria-pressed. |

## More

Long-form usage: `components/Composer/README.md`.
