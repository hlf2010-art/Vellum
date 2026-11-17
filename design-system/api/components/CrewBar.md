<!-- Generated from components/index.d.ts by scripts/build_api.py. -->
# CrewBar

The crew cluster at the top right: four crew seats, the crew settings button, and the model pill.

`Vellum.CrewBar` · Crew

## Use

```jsx
<Vellum.Root><Vellum.CrewBar /></Vellum.Root>
```

## Props (CrewBarProps)

| prop | type | note |
| --- | --- | --- |
| `seats` | `Partial<Record<CrewMember, CrewState>>` |  |
| `connection` | `'none' \| 'ok' \| 'rules' \| 'error'` |  |
| `mode` | `string \| false` | Model pill text, e.g. "Offline"; false hides it. |
| `quiet` | `boolean` |  |

## More

Long-form usage: `components/CrewBar/README.md`.
