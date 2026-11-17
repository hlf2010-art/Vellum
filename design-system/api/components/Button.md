<!-- Generated from components/index.d.ts by scripts/build_api.py. -->
# Button

Decision buttons.

`Vellum.Button` · Actions

## Use

```jsx
<Vellum.Root><Vellum.Button /></Vellum.Root>
```

## Props (ButtonProps)

| prop | type | note |
| --- | --- | --- |
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` |  |
| `icon` | `string` | Name of a Vellum icon: select, lasso, hand, upload, organize, undo, redo, plus, mic, send, enhance, command, search, doc, x, check, chevron, play, notepad, video, image, audio, link, frame, group, lock, sliders, retry, copy, arrow, eyeOff, archive, trash, ask. |
| `children` | `React.ReactNode` |  |
| `size` | `'sm' \| 'md' \| 'lg'` | sm 28px (toasts, bars), md 32px (default), lg 36px (sheets). |
| `loading` | `boolean` | Shows a spinner, sets aria-busy and blocks clicks. Keep the label. |
| `disabled` | `boolean` |  |
| `type` | `'button' \| 'submit'` |  |
| `onClick` | `(e: any) => void` |  |
| `aria-label` | `string` | Required for icon-only buttons; also becomes the tooltip. |

## More

Long-form usage: `components/Button/README.md`.
