Every object on a Vellum board is a Card: a `card` face, `radius-card` corners, `shadow-card`, then a kind line, title, body and footer. There are 17 kinds, one for each thing people put on a board.

Hand-written from `Vellum-Lumen.html` on branch `claude/lumen-v2` (`.card.<kind>` and its parts). Values match the app exactly.

## Kinds by stage

**Gather (evidence).** Always pass `weight` so people can see how much a card can carry.

| `kind` | Width | Use for | Key props |
| --- | --- | --- | --- |
| `source` | 320 | A document or file that arrived from outside | `eyebrow` (“MD · Playtest Telemetry”), `weight` |
| `recording` | 360 | A video capture. It has a play button and a timecode | `image` (poster), `badge` (“WEBM”), `timecode` |
| `image` | 320 | An uploaded or generated image (4:3 media) | `image`, `badge` (“JPEG”), `eyebrow` (“Generated image · Qwen Image 2.1”), usually `weight="illustrative"` |
| `frame` | 280 | A still lifted from a recording | `image`, `timecode` (“@ 0:04.2”), `eyebrow` naming the parent recording |
| `audio` | 320 | A voice memo or interview with an inline player | `duration`, `progress` (0–100) |
| `link` | 320 | A web page. The thumbnail replaces the kind line | `url` (shown in mono), `image` |
| `notepad` | 380 | A longer written brief | `text` (keeps line breaks), word count in `footLeft` |

**Explore (thinking).**

| `kind` | Width | Use for | Key props |
| --- | --- | --- | --- |
| `idea` | 360 | The claim being tested (“Core Thesis”) | `rating {observed, reported, unrated}` draws the evidence-mix bar |
| `synthesis` | 360 | Scout's summary across sources | `by="scout"`, `points [{label, text}]`, `rating` |
| `direction` | 360 | A lettered A–D proposal | `lineage`, `test`, `adopted` / `disliked` |
| `question` | 320 | A challenge raised against a card, usually by Critic | `by="critic"`, `lineage`, `eyebrow` (“Question on Proof B v2”) |
| `note` | 240 | A sticky for a constraint or quick thought, never evidence | `title` |

**Prototype (building).** Wright builds these from an adopted direction.

| `kind` | Width | Use for | Key props |
| --- | --- | --- | --- |
| `proof` | 360 | A working page or deck built from sources | `lineage`, `version` (“v2”), `image` (thumbnail), `sources []` (the first 3 are shown, the rest become “+N more”) |
| `list` | 320 | An action list with a progress bar | `by="wright"`, `items [{text, done}]`. The footer shows “3/5 done” |
| `kanban` | 540 | A three-column board | `columns [{title, items[]}]`, coloured A → B → C left to right |

**Snapshot (decided).**

| `kind` | Width | Use for | Key props |
| --- | --- | --- | --- |
| `snapshot` (also accepts `print`) | 320 | A frozen, numbered edition of a proof. It is the most decided object, so it is a solid lineage colour, lit from within | `lineage`, `edition`, `of` (“of proof v2”) |
| `group` | free | A translucent frame that holds cards, such as a stage section (“01 · Gather · …”) | `title`, child cards as `children` |

## Shared props
`title`, `children` (body copy), `locked`, `proposal`, `eyebrow`, `meta` (right side of the footer: “2 notes · 5:44 AM”), `footLeft`, `by` (crew byline as an 18px orb), `lineage`, `lit` (crew is working on it), `width`.

## Locks and crew proposals
- `locked`: a 20px lock badge at the top right. Only you can change the card. Cards in a locked lane get the same badge.
- `proposal {member, op, open, field, diff, stale}`: a bar under the card body. The crew proposes, you decide.
  - `op: 'edit'` reads *“Scout suggests an edit”* with **Review** (expands a word diff: deletions struck in `danger`, insertions tinted `ok`) · **Decline** · **Accept**.
  - `op: 'delete'` reads *“Critic suggests deleting this card”* on a `danger` tint.
  - `op: 'link'` reads *“… suggests linking “X” into this card”*.
  - `stale` adds *“The card changed after this was suggested.”* (in `warn`), and Accept becomes **Accept anyway**.

## Rules
- **Media** sits inset 6px with `radius-media`. Badges are dark glass pills with an uppercase format (“WEBM”, “JPEG”, “FRAME”). Timecodes are in mono.
- **Crew-made cards** (`synthesis`, `question`, `list`, `kanban`) show their author with `by`. Cards a person made show no byline.
- **Proofs list the sources they were built from.** Never hide that provenance.
- **Snapshot text is white on the lineage gradient.** In light theme it passes 4.5:1 on `B`, `C` and `D` (5.1–6.4:1), and amber `A` is just under (about 4.2–4.4:1). In dark theme the lighter hues drop white to 2.5–4.0:1, which is a source issue and flagged here. Keep snapshot copy at 14px or larger and titles at 17px/600, and prefer `B` or `D` snapshots where the copy matters.
- **Don't** fill any card except a snapshot with lineage colour, don't add coloured left borders (kanban items are the one exception the source has), and don't hide evidence weight.

Wrap renders in `Vellum.Root`.
