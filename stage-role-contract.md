# Stage × role contract

Vellum is for one person (an OPC) who has no human teammates and wants to think something through until it is clear enough to act on. The AI crew is that person's team. The person decides; the crew inspires, helps decide and does the legwork; the trail of how an idea became a decision stays and can be traced and changed.

This page says who does what at each point. It is the acceptance test for every AI feature: a feature that breaks a rule below is a bug, however clever it is.

## Stages (`boardStage()`)

The stage comes from what is on the board, not from where cards sit. Only what the designer kept counts; drafts do not.

| Stage | When | What is open |
|---|---|---|
| Gather | no kept claim yet | a claim to work on |
| Explore | a kept claim, nothing adopted | which direction to adopt |
| Prototype | a direction is adopted | what the proofs show |
| Snapshot | a proof is frozen | what the snapshot does not cover |

`stageBrief()` turns this into one short block (stage, what is decided, what is open, the evidence by weight, what to do here) and puts it in front of every agent that speaks: Copilot, the advisor that looks at a card, and replies in a pin thread.

## Three roles

| Role | Does | Never |
|---|---|---|
| **Inspire** | offers options, references, angles, a useful fact | commits anything; offers what it is not sure is relevant |
| **Facilitate** | helps the designer decide: names the choice, asks only what it cannot guess, ends with options, records what was decided | interrogates; blocks; offers a closed list (the designer can always write their own) |
| **Execute** | does the dirty work on what was decided or asked for: builds, organises, files, summarises | makes the decision; starts again when something exists (it adds to it) |

## Who leads where

| Stage | Leads | In order | Not yet |
|---|---|---|---|
| Gather | Inspire | collect evidence, put the idea in one sentence | forking directions, building |
| Explore | Inspire + Facilitate | options as direction cards, each with a test it could fail | task boards, lists, proofs (unless asked) |
| Prototype | Execute | proofs, task lists and boards for the adopted direction | reopening the other directions (unless asked) |
| Snapshot | Facilitate | review the frozen proof, say what to test or decide next | silently starting new work |

## Rules for every stage

1. Whatever the crew creates is a draft until the designer keeps it. Changes to something the designer kept are suggestions.
2. Add to what exists: one kanban per project (a separate or phased board only when asked); a proposal for something already on the board shows as placed.
3. Nothing the designer would have to wonder about: options and results are about this idea. If the crew is not sure, it offers less, not something random.
4. Options are suggestions, never the only answers: every question has a row for the designer's own words.
5. The crew's opinions are Proposal or Illustration, never Observed. Real-world evidence comes from the designer, so the crew prepares the test (outreach, a landing page, the questions) and the designer runs it.
6. Decisions are logged and survive the change log's cap; every board is backed up (see tests/README.md).

## Where the designer talks to the crew

- **The side panel is the only place for conversation.** Ask a question, discuss a card, get proposals. Select cards, right-click one and choose Ask Copilot, or press ⌘., and the selection is the context.
- **The bottom bar is a command bar and search box.** `/` runs a command, plain words search the cards on the board (and name matching commands), and words with nothing selected become an idea. A question typed there is handed to the panel.
- **`@name` hands over to the panel** with that member preselected ("Asking Critic"), until the designer drops it. The one exception: with a draft that member made selected, `@name` in the bar still revises that draft.
- The crew does not speak unasked unless the designer lets it (Settings: Speaks up). That default is still to be decided; see the notes in the project record.

## What implements this today

- `boardStage()` / `stageBrief()` in the Copilot summary, the advisor prompt and pin replies; a "three roles" rule in Copilot's prompt.
- Drafts by default; kanban merge and `add_cards`; proposals reconciled with actions; options that are really directions become direction cards while nothing is adopted.
- Decisions kept past the log cap; adopting is logged; automatic backups.
- Copilot's starter suggestions follow the stage and the selection, and are visual only for a selected image or frame.
- Checked in `tests/vellum-smoke.cjs` (groups 5d, 5e, 5g, 5h, 5k).

## Not built yet

- Gates in code by stage. Today this is the brief in the prompts plus the draft default and a few safety nets.
- The Critic recording its strongest objection and the designer's reason for overriding it.
- A briefing when the designer comes back ("since Tuesday: …").
- An eval set built from what an OPC thinks through (what to sell, to whom, how to reach them, price, first version) and scored on stage, not only on errors.
- Medium lenses (a game, a video, a service) as optional ones the designer's own words select, not a regex.
- Slots for one person's limits (hours a week, money, skills, assets) in planning.

## Background work (always-on agents): decision, 2026-11-18

A guide the designer shared describes an agent that is "always on" by sleeping and being woken: an event inbox, timers, durable memory loaded on demand, permission control that stops and waits for approval, and an outbox that decides how to interrupt. (We worked from the designer's summary, not the original.)

Decision: **do not build a 24/7 agent now.** Vellum is local-first with the person present, and the stage rules above are about not acting ahead of the designer; background work raises cost, privacy and surprise. What we take from it is the separation of concerns, and where each already exists or would go:

| Concern | In Vellum |
|---|---|
| Triggers (inbox) | the advisor already coalesces bursts of new cards and has a hard hourly cap; reuse this rather than build a second inbox |
| Timers | the real-world test takes days: a "check back on …" date on a test is the one timer worth building, shown in the return briefing |
| Memory | the board, the change log and the backups; agents load a summary (stage brief, related cards), not everything |
| Permission | drafts and suggested edits, i.e. the agent stops and waits for the designer; same idea as the guide's approve-then-resume |
| Outbox | the return briefing and the "speaks up" pacing: say what changed, rarely |

Revisit if a task must run while the app is closed.
