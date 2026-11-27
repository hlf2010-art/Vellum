# Relations contract

Vellum is a shared thinking space for one person and an AI crew. Where things sit on the board, and what is tied to what, is part of the thinking. This page says how a person ties two cards together and what the crew may do with it. `tests/relations.cjs` checks it.

## One object, two gestures

There is one kind of relation. A **connector** (drag from a card's dot to another card) and a **snap** (drag a card until it touches another) are two ways to make it. Use a connector for cards far apart, a snap for cards next to each other. Either way the result is the same object, with the same types, the same undo and the same meaning to the crew, whatever the cards hold: an image, a video, a note, a document, code, a table or a link.

A relation is an edge with `by: "you"` and a `rel`:

| `rel` | Shown as | Means |
|---|---|---|
| `related` (default) | Related · 有关 | These belong together. Nothing more: the crew never reads it as agreement. |
| `supports` | Supports · 支持 | `a` supports `b` |
| `conflicts` | Counters · 反驳 | `a` counters `b` |
| `extends` | Refines · 细化 | `a` refines `b` |

**Evidence and judgments.** When one card is material (a source, image, recording, audio, link, frame, note, notepad or table) and the other a judgment (an idea, synthesis, direction or question), the relation always reads evidence → judgment, whichever card was dragged or where the line started, so "this interview supports that claim" reads right. The type picker then says "This evidence". The judgment's bottom row says what it rests on (the verdict) and, apart from it, how many pieces counter it; counter-evidence never counts as backing. Selecting a judgment lights the evidence tied to it.

`note` is an optional short text (up to 140 characters) for the why or the "but", for example "supports, but only for solo hikers". `via` records the gesture (`snap` or `wire`). Lineage edges the crew makes while it works (`derive`, `live`, `frozen`) are not relations until a person snaps or connects the same pair; then the same edge gains `by` and `rel`.

## Rules

1. **One per pair.** Two cards have at most one relation, of one type (decided by Mars, 2026-11-26). A pair that both supports and counters is a contradiction the crew would have to guess about; a mixed case is one type plus a note. Snapping cards that are already related, or drawing a connector between them, opens that relation to edit; it never adds a second one.
2. **Snapped is a way of showing it.** Two related cards that sit edge to edge (a 12px seam) show the relation as a clasp on the seam instead of a line. Show line draws it anyway.
3. **Pulling apart keeps it.** Drag a snapped card away and the relation stays, drawn as a line with its type on it. A toast offers Unbind.
4. **Unbinding is explicit.** A relation goes away only when the person deletes it (⌫ on the selected relation, Unbind, or the bin in its popover). Undo brings it back.
5. **The type is optional.** After a snap or a new connector a small picker offers the four types (keys 1 to 4). Ignoring it leaves `related`.
6. **Groups are a star and its planets.** Cards snapped together, directly or through each other, are a snapped group, and every group has one star: the focus of the topic. An idea, a claim, a direction or a project brief is a star; evidence, failure cases, eval sets, images, notes and links are planets (decided by Mars, 2026-11-27).
   - **Which card is the star.** When two focus cards meet, the broader one wins: a brief over an idea, claim or direction. With no focus card, or a tie, the card that stayed still (the one snapped onto) is the star. "Set as focus" (设为焦点) in a card's menu overrides either way. The rule lives in one function, `pickStar`.
   - **One level deep.** A card snapped onto a planet joins that planet's star. Each card orbits one star; every other relation it has is a line.
   - **Dragging.** Drag the star and the whole group moves with it. Drag a planet and it comes out of orbit alone; its relations stay, drawn as lines, and a toast offers Unbind. A small tug (under 34px) springs back to the seam, so tidying a planet never detaches it. A clasp opens its relation; it no longer moves the group.
   - **The cue.** The star wears a small orbit mark at its top-left corner.
   - A connector dropped on a clasp relates the card to every card in the group. Each card can still be connected to others on its own.
7. **On and off.** Smart snap is a toolbar toggle (M), on by default and remembered. Holding ⌥ while dragging skips it for that drag.
8. **A note says the nuance.** Click a line or a clasp and write in Note; Enter saves, Esc cancels. The note shows on the line next to the type (a dot on a clasp, the full text on hover), and the crew reads it with the relation.
9. **History.** Every change goes to the Activity log and to Undo: a new type is logged with what it was ("counters (was: supports)"), a note with its text.

## What the crew may do

- **Read** relations as stated, with the person's note when there is one. A direct relation is the strongest context signal a card has (it ranks above shared words, close meaning and position), and reaches the model as, for example, "you snapped them together · related, not agreement" or "you linked them · it counters this card".
- **Never change or remove** a relation the person made. A crew `connect` on a related pair is skipped, unless the person asked for it in their own words. Every agent's prompt says so.
- The Related section of a card's sheet lists the person's relations first, with their type.

## Feel

The snap previews before it happens (a glowing seam and a ghost clasp, the neighbour lit, a dashed guide when edges or centres line up). The card is caught within 18px and held until pulled 34px away, so it never flickers at the edge. Catching and letting go glide for 160ms; the clasp lands with a spring and a ring; a soft click plays (and a short vibration on touch screens). With reduced motion none of this animates. Colours come from the theme tokens, so light and dark both work.
