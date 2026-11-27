<!-- Generated from components/index.d.ts by scripts/build_api.py. -->
# EvidenceLine

One plain verdict on how well a judgment is backed, on idea, synthesis, direction and question cards.

`Vellum.EvidenceLine` · Board

## Use

```jsx
<Vellum.Root><Vellum.EvidenceLine /></Vellum.Root>
```

## Props (EvidenceLineProps)

| prop | type | note |
| --- | --- | --- |
| `verdict` | `EvidenceVerdict` | mostly: Mostly observed · partly: Partly observed · secondhand: Mostly second-hand · hearsay: Second-hand only · thin: No evidence yet · unrated: Not rated yet. |
| `sources` | `number` |  |
| `counts` | `EvidenceCounts` |  |
| `sentence` | `string` |  |
| `open` | `boolean` |  |

## More

Long-form usage: `components/EvidenceLine/README.md`.
