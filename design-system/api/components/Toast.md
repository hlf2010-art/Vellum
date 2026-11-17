<!-- Generated from components/index.d.ts by scripts/build_api.py. -->
# Toast

A one-line notice after something happens, with at most one follow-up action, usually **Undo**.

`Vellum.Toast` · Crew

## Use

```jsx
<Vellum.Root><Vellum.Toast /></Vellum.Root>
```

## Props (ToastProps)

| prop | type | note |
| --- | --- | --- |
| `member` | `CrewMember` |  |
| `children` | `React.ReactNode` |  |
| `undo` | `boolean` | Shorthand for a single Undo action. |
| `actions` | `ToastAction[]` |  |
| `tone` | `'neutral' \| 'error'` | `error`: role=alert, alert icon, danger ring. |

## More

Long-form usage: `components/Toast/README.md`.
