<!-- Generated from components/index.d.ts. -->
# Toast

A one-line notice after something happens, with at most one follow-up action, usually Undo.

`Vellum.Toast` · Crew

## Use

```jsx
<Vellum.Toast>…</Vellum.Toast>
```

```html
<x-import component-from-global-scope="Vellum.Toast">…</x-import>
```

## Props (ToastProps)

| prop | type | note |
| --- | --- | --- |
| `member` | `'scout' \| 'strategist' \| 'wright' \| 'critic'` |  |
| `children` | `React.ReactNode` |  |
| `undo` | `boolean` | Shorthand for a single Undo action. |
| `actions` | `ToastAction[]` |  |

### ToastAction

| prop | type | note |
| --- | --- | --- |
| `label` * | `string` |  |
| `icon` | `string` |  |
| `variant` | `'ghost' \| 'secondary' \| 'primary'` |  |
| `onClick` | `() => void` |  |

## More

Long-form usage: `components/Toast/README.md`.
