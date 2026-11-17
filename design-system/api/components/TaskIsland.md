<!-- Generated from components/index.d.ts. -->
# TaskIsland

Live status for long-running crew work (renders, research, builds), pinned at the top centre of the board.

`Vellum.TaskIsland` · Crew

## Use

```jsx
<Vellum.TaskIsland />
```

```html
<x-import component-from-global-scope="Vellum.TaskIsland"></x-import>
```

## Props (TaskIslandProps)

| prop | type | note |
| --- | --- | --- |
| `tasks` | `IslandTask[]` |  |
| `open` | `boolean` |  |

### IslandTask

| prop | type | note |
| --- | --- | --- |
| `member` * | `'scout' \| 'strategist' \| 'wright' \| 'critic'` |  |
| `title` * | `string` |  |
| `phase` * | `string` | Present-tense verb: "Rendering", "Reading 4 sources" |
| `pct` | `number \| null` |  |
| `elapsed` | `string` |  |

## More

Long-form usage: `components/TaskIsland/README.md`.
