<!-- Generated from components/index.d.ts. -->
# Composer

The command bar at the bottom centre of every board: one calm row where you write an idea or a / command.

`Vellum.Composer` · Canvas chrome

## Use

```jsx
<Vellum.Composer />
```

```html
<x-import component-from-global-scope="Vellum.Composer"></x-import>
```

## Props (ComposerProps)

| prop | type | note |
| --- | --- | --- |
| `placeholder` | `string; value?: string; hint?: string` | Default "Write an idea, or / for commands". |
| `route` | `{ member?: CrewMember \| null; label: string }; showRoute?: boolean` | Who handles the request; the chip appears once there is text (or with showRoute). |
| `onSend` | `(text: string) => void` |  |

## More

Long-form usage: `components/Composer/README.md`.
