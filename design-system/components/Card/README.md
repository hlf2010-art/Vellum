Every object on a Vellum board is a Card: a `card` face, `radius-card` corners, `shadow-card`, then a kind line, title, body and footer. There are 17 kinds, one for each thing people put on a board.

Hand-written from `Vellum-Lumen.html` (`.card.<kind>` and its parts). Updated on 27 Nov for the design pass (PR 54): one-word eyebrows, the evidence line, contributor avatars and neutral kanban columns.

## The eyebrow: one word
The kind line at the top of a card is **one word for what the card is**, with no icon: *Idea*, *Document*, *Slides*, *Spreadsheet*, *Page*, *Video*, *Image*, *Frame*, *Audio*, *Link*, *Notepad*, *Sticky*, *Synthesis*, *Direction*, *Question*, *Proof*, *Snapshot*, *Action list*, *Kanban*, *Tree map*, *Group*. In Chinese: 想法, 文档, 视频, 方向, 快照 and so on. A person's own kind for an idea or source (*Claim*, *Core thesis*, *Brief*) replaces the word.

- Only directions, snapshots and questions add a letter chip before the word (*[B] Direction*).
- Everything else the old line carried (file format, model, seed, where it came from, which card a question is on) moves into the word's tooltip: *“Made with Qwen Image 2.1 · From the web”*. The format shows once, as the badge on the picture.
- The word is `card-kind` in `label-3`, truncated before it ever wraps.

## The footer: evidence, people, time
Left to right: the `EvidenceLine` on judgment cards (idea, synthesis, direction, question) or `EvidenceWeight` on material, then the `AvatarGroup` of everyone who worked on the card, then the time. Nothing else; counts like “5/7 rated” are gone.

## Kinds by stage

**Gather (evidence).** Always pass `weight` so people can see how much a card can carry.

| `kind` | Width | Use for | Key props |
| --- | --- | --- | --- |
| `source` | 320 | A document or file that arrived from outside | `eyebrow` (“Document”, or “Slides”, “Spreadsheet”, “Page” by format), `weight` |
| `recording` | 360 | A video capture. It has a play button and a timecode | `image` (poster), `badge` (“WEBM”), `timecode` |
| `image` | 320 | An uploaded or generated image (4:3 media) | `image`, `badge` (“JPEG”), `eyebrow` (“Image”; the model goes in its tooltip), usually `weight="illustrative"` |
| `frame` | 280 | A still lifted from a recording | `image`, `timecode` (“@ 0:04.2”), the parent recording named in the eyebrow's tooltip |
| `audio` | 320 | A voice memo or interview with an inline player | `duration`, `progress` (0–100) |
| `link` | 320 | A web page. The thumbnail replaces the kind line | `url` (shown in mono), `image` |
| `notepad` | 380 | A longer written brief | `text` (keeps line breaks), word count in `footLeft` |

**Explore (thinking).**

| `kind` | Width | Use for | Key props |
| --- | --- | --- | --- |
| `idea` | 360 | The claim being tested (eyebrow “Idea”, or the person's own kind such as “Core thesis”) | `rating {observed, reported, unrated}` draws evidence blocks, one per source |
| `synthesis` | 360 | Scout's summary across sources | `by="scout"`, `points [{label, text}]`, `rating` |
| `direction` | 360 | A lettered A–D proposal | `lineage`, `test`, `adopted` / `disliked` |
| `question` | 320 | A challenge raised against a card, usually by Critic | `by="critic"`, `lineage`, letter chip + “Question”; the card it is on goes in the tooltip |
| `note` | 240 | A sticky for a constraint or quick thought, never evidence | `title` |

**Prototype (building).** Wright builds these from an adopted direction.

| `kind` | Width | Use for | Key props |
| --- | --- | --- | --- |
| `proof` | 360 | A working page or deck built from sources | `lineage`, `version` (“v2”), `image` (thumbnail), `sources []` (the first 3 are shown, the rest become “+N more”) |
| `list` | 320 | An action list with a progress bar | `by="wright"`, `items [{text, done}]`. The footer shows “3/5 done” |
| `kanban` | 540 | A three-column board | `columns [{title, items[]}]`, neutral columns (`label-3`); pass a column `lineage` only when the column really is one direction |

**Snapshot (decided).**

| `kind` | Width | Use for | Key props |
| --- | --- | --- | --- |
| `snapshot` (also accepts `print`) | 320 | A frozen, numbered edition of a proof. It is the most decided object, so it is a solid lineage colour, lit from within | `lineage`, `edition`, `of` (“of proof v2”) |
| `group` | free | A translucent frame that holds cards, such as a stage section (“01 · Gather · …”) | `title`, child cards as `children` |

## Shared props
`title`, `children` (body copy), `locked`, `proposal`, `eyebrow`, `meta` (right side of the footer: “2 notes · 5:44 AM”), `footLeft`, `by` (crew byline as an 18px orb), `lineage`, `lit` (crew is working on it), `width`.

## States
- `selected`: a 2px `focus` ring plus the lifted shadow. Cards are focusable (`tabIndex` 0); `onSelect` fires on click and Enter. Pass `tabIndex={-1}` when the board manages roving focus itself.
- `state="loading"`: the crew is reading or writing the card. A soft light sweep crosses it (static tint under reduced motion), and `aria-busy` is set. Use it with `lit` on the author's orb, not instead of it.
- `state="error"`: the last crew action on this card failed. An inline line in `danger-ink` on a danger tint says what happened and that the card is unchanged (default *“Couldn’t finish. Your card is unchanged.”*), with **Retry** when `onRetry` is given. Errors stay on the card they belong to; don't raise a modal.

## Locks and crew proposals
- `locked`: a 20px lock badge at the top right. Only you can change the card. Cards in a locked lane get the same badge.
- `proposal {member, op, open, field, diff, stale}`: a bar under the card body. The crew proposes, you decide.
  - `op: 'edit'` reads *“Scout suggests an edit”* with **Review** (expands a word diff: deletions struck in `danger`, insertions tinted `ok`) · **Decline** · **Accept**.
  - `op: 'delete'` reads *“Critic suggests deleting this card”* on a `danger` tint.
  - `op: 'link'` reads *“… suggests linking “X” into this card”*.
  - `stale` adds *“The card changed after this was suggested.”* (in `warn`), and Accept becomes **Accept anyway**.

## Rules
- **Media** sits inset 6px with `radius-media`. Badges are dark glass pills with an uppercase format (“WEBM”, “JPEG”, “FRAME”). Timecodes are in mono.
- **Every card names who worked on it**, beside the time, with an `AvatarGroup` (one avatar alone, up to three stacked, then “+N”). A crew draft you confirmed carries a small check. Stickies have no pen button. The `by` prop still draws an 18px orb for quick mock-ups; in product screens use the footer group.
- **Proofs list the sources they were built from.** Never hide that provenance.
- **Snapshot text is white on the lineage gradient.** In light theme it passes 4.5:1 on `B`, `C` and `D` (5.1–6.4:1), and amber `A` is just under (about 4.2–4.4:1). In dark theme the lighter hues drop white to 2.5–4.0:1, which is a source issue and flagged here. Keep snapshot copy at 14px or larger and titles at 17px/600, and prefer `B` or `D` snapshots where the copy matters.
- **Don't** fill any card except a snapshot with lineage colour, don't add coloured left borders or tint kanban columns by position, and don't hide evidence weight.

Wrap renders in `Vellum.Root`.
