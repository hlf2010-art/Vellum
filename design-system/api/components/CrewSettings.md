<!-- Generated from components/index.d.ts by scripts/build_api.py. -->
# CrewSettings

The crew popover: how much the crew may say and do without asking, and which lanes only you can change.

`Vellum.CrewSettings` · Crew

## Use

```jsx
<Vellum.Root><Vellum.CrewSettings /></Vellum.Root>
```

## Props (CrewSettingsProps)

| prop | type | note |
| --- | --- | --- |
| `status` | `string` |  |
| `speaks` | `'Never' \| 'When it matters' \| 'Often'` | Initial value; the control is interactive (arrow keys move between options). |
| `acts` | `'Only drafts' \| 'Can create cards'` |  |
| `lanes` | `string[]` |  |
| `locked` | `string[]` |  |
| `onChange` | `(v: { speaks: string; acts: string; locked: string[] }) => void` |  |

## More

Long-form usage: `components/CrewSettings/README.md`.
