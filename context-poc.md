# Thinking objects and contextual intelligence: proof of concept

2026-11-17 · `Vellum-Lumen.html` (main at `a9453f0`) · tests in `tests/context-poc.cjs`

This tests two product claims:

1. **Persistent thinking objects.** A card keeps its identity, content, revision history, relationships and decision context as ideas change.
2. **Contextual intelligence.** The AI uses links, meaning and interaction history to understand how cards relate. Physical proximity alone never makes a card relevant.

Results are marked **validated** (a test passes against the real app), **partly validated** or **hypothetical** (not shown yet).

## 1. What the app already did well

Lumen was further along than the brief assumed. These parts held up under testing and were kept as they were:

| Capability | Where | Status |
|---|---|---|
| Stable card identity. Moving a card is not an edit (the digest ignores position). | `node()`, `digest()` | Validated |
| Revisions on every edit path (`rev` plus `versions`) | `recordNodeEdit()` | Worked, but lossy (see 2) |
| Links with dependency types and acknowledged revisions (live, frozen, reference) | `edge()`, `ackEdgeDep()` | Validated |
| Provenance on every card (author, engine, the cards it was built from) and a structured change log | `provFor()`, `recordChanges()` | Covered by the smoke test |
| Undo per author: ⌘Z never undoes an agent's work | `checkpoint()`, `applyPatch()` | Covered by the smoke test |
| Authorization: agents can only suggest edits or deletions of your kept cards; locked cards and lanes are yours alone | `propose()`, `perm()`, `isLocked()` | Covered by the smoke test |
| Not interrupting: one look per burst, no new thought while one is unread, thoughts fade, hidden hourly cap | `scheduleAdvisor()`, `unreadPins()` | Covered by the smoke test |
| Saved locally (localStorage plus IndexedDB) | `persist()` | Validated across a reload |

## 2. What was missing, and where the assumptions were wrong

1. **Rejected ideas disappeared.** Discarding a draft deleted it. The change log kept only a 60-character title. Ignoring a thought deleted it, and adopting a direction recorded nothing about the ones not chosen. The only feedback any agent saw was 👍/👎 titles, and only Copilot saw those. Strategist's prompt listed existing directions as "do not repeat", so a direction you had just discarded was no longer listed and could come straight back. With a real model it did: Haiku re-proposed it in **5 of 5** runs (Qwen 1 of 5).
2. **Proximity stood in for relevance.** When a card had no links, `relatedFor()` fell back to *any card in the same 1000 px lane*. That fallback drove the advisor's keywords and its "Synthesize with **nearby** cards" action.
3. **Relevance meant matching words.** `rank()` counted query words in card text. Copilot's whole-board context was "the latest 6 cards" plus documents that matched by keyword, so an older card on the same topic was simply invisible.
4. **No explanation.** The advisor was told to use only cards wired to the one it was looking at. Its thoughts didn't record which cards they rested on, so you couldn't tell what informed one.
5. **Revision history was lossy and hidden.** Earlier text was clipped to 160 characters and only 8 versions were kept. Nothing showed the history to you or an agent.
6. **Silent fallback** (found during live testing). The advisor's 750–900 token budget was used up by a reasoning model's hidden thinking (`reasoning_tokens: 900`). The reply came back empty and the app quietly showed a template thought instead.

Assumptions worth challenging:

- **"Proximity implies context."** Nearness is a weak hint at best, because people put counter-arguments right next to claims. In the PoC it only breaks ties between cards that already relate. One related point, not built: an explicit group or frame is an act by you, and should probably count as a link.
- **"Every card is a heavyweight object."** Identity, content and revisions are cheap and are now complete. Decision context is only needed where a decision actually happened. Asking for a reason each time would interrupt, so reasons are captured where you already give them: your reply in a thought's thread becomes the reason for ignoring it.
- **"The AI explains its reasoning."** An explanation the model writes about itself can't be checked. Here the explanation comes from the retrieval itself: candidates are keyed, the model cites keys, and any key it wasn't given is dropped.
- **"Rejected ideas should influence suggestions."** Treated as a soft prior, not a ban. A repeat is held back unless a card added since speaks to the reason. When that happens the idea may come back, labelled with the card that changed things.
- **"More context makes better suggestions."** Not supported. Both models cited only one to three cards per thought, and an index of every other card did not make them use the paraphrase card (0 of 10). Choosing the right candidates matters more than giving more of them.

## 3. What the PoC changed (one file, no new UI surfaces)

All changes are in `Vellum-Lumen.html`, inside the existing architecture.

- **Context engine** (`contextFor`, `ctxCandidates`, `ctxResolveBasis`, from line 4134). Signals, in order:
  - Links within three hops, both directions.
  - **Topic**: terms weighted by how rare they are on this board. A pick needs two shared distinctive terms, or a strong overlap between short cards.
  - **Near**: a tie-break only.
  - **Attention**: cards you *edited* within 5 minutes of each other, also a tie-break.

  Every pick carries its reasons ("linked directly", "shares onboarding, user"). Nearby cards that don't qualify are recorded as skipped. On boards of up to 30 cards, the rest go to the model as an index. Canvas coordinates are never sent.
- **Decision memory** (`declineRecord`, `declinedFor`, `echoOfDeclined`, `declAnsweredBy`). `board.declined` keeps what was turned down, about which card, by whom, and why. Records come from:
  - discarding a draft
  - ignoring a thought (your last reply in its thread is the reason)
  - declining a suggestion (optional reason)
  - adopting one direction over its siblings ("Adopted A · … instead")

  Records are part of undo history, so undoing a discard also withdraws its record.
- **Advisor** (`askAdvisorForNode`). It now sees the keyed candidates and the declined ideas that bear on the card. It returns a `basis` (key, relation, why), which is checked against the keys it was given. Any C# key in the note text is replaced by the card's name. Thoughts that repeat a declined idea are held back and logged as `hold-repeat`. The token budget went from 900 to 1600.
- **Strategist** (`fork`). Hears the declined directions and their reasons. A direction that repeats one is held back, with a toast saying so.
- **Copilot** (`boardDigestForCopilot`). Cards related by link or topic are listed with their reasons, alongside the latest cards. The digest also carries the declined ideas.
- **`relatedFor` and the gather action** use the context engine instead of whatever shares the lane.
- **Revisions** keep up to 4,000 characters of earlier text, 20 deep. `revisionsOf()` reads them in order.
- **One visible change.** A thought shows **Based on · Conflicts · <card>**, and choosing the name selects that card.

## 4. Test scenarios and results

```bash
node tests/context-poc.cjs                                          # deterministic, ~1 min
node tests/context-poc.cjs --live anthropic/claude-haiku-5.5 --runs 5   # also asks a real model
node tests/vellum-smoke.cjs                                         # existing suite: still 136/136
```

The fixture board centres on T, *"Cut onboarding to three steps so a new user reaches their first project in under two minutes"*:

| Card | Where | Role |
|---|---|---|
| W1 goal (activation +10%) | above T, linked to it | explicit link |
| N1 "Order pizza for Friday's offsite" | right beside T | near, unrelated |
| N2 "users who skipped the tutorial churned twice as often" | right beside T | near, related, subtle tension |
| N3 "Legal decision: all five identity-check steps stay" | far away | explicit contradiction |
| F1 "people abandon onboarding at the invite-your-team step" | ~2,500 px away, other lane | far, shares words |
| F2 "Three steps to descale the espresso machine" | far away | shares only generic words (a trap) |
| F3 "Most sign-ups quit before they ever make anything" | far away | same idea in other words |

### Deterministic: 39 passed, 2 known limitations, 0 failed

| Group | Scenario | Result |
|---|---|---|
| Relevance | The linked card is read, with the reason "linked directly" | Pass |
| | The far card F1 is read, and the reason names the shared terms | Pass |
| | The far contradiction N3 is read | Pass |
| | The pizza card beside T is not read, and is recorded as "near on the canvas, but no link and no shared topic" | Pass |
| | N2 beside T is read for its topic, with nearness only as an extra reason | Pass |
| | The espresso trap F2 is not read | Pass |
| | The paraphrase F3 is missed by the term layer | **Known limitation** |
| | …so F3 reaches the model as an index line | Pass |
| | Moving T to another lane doesn't change which cards are read; the pizza card parked on top of T is still not read | Pass |
| | Copilot's digest lists F1 as related and leaves the pizza card out | Pass |
| Persistence | Moving keeps the id, revision, digest and links, and isn't logged as an edit | Pass |
| | Three edits make revisions 2–4 with earlier text kept in full (before: 160 characters) | Pass |
| | After a reload: same board, revisions, links, adoption, declined suggestions, decision records and context picks | Pass |
| Decisions | A discarded draft keeps what, by whom, about which card and why; Undo withdraws the record | Pass |
| | Adopting A records B as passed over, "Adopted A · … instead" | Pass |
| | Strategist is told what was turned down and why; a repeat is held back, logged and announced | Pass |
| | After a newer card speaks to the reason, the idea may return, labelled with that card | Pass |
| | "Speaks to the reason" means topic overlap, not a judgement | **Known limitation** |
| | Ignoring a thought after replying makes the reply its reason; a later thought repeating it is held back | Pass |
| | Declining a suggested edit keeps the reason; Copilot's digest carries declined ideas and reasons | Pass |
| Explanation | The advisor gets keyed candidates and no coordinates; the pizza card is never a scored candidate | Pass |
| | The thought records N2 · conflicts as its basis; a citation to an invented key is dropped and noted | Pass |
| | "Based on · Conflicts · Interviews…" is shown; choosing it selects the card | Pass |
| | With no model (built-in rules), the thought still says what it rests on and why | Pass |
| Authorization | The advisor changed no kept card and made no card; no page errors | Pass |

### Live models: 5 runs each, same fixture

Haiku 5.5 is a capable cloud model. Qwen3-VL-8B is the closest available stand-in for the app's local Qwen3-VL-4B.

| Check | Claude Haiku 5.5 | Qwen3-VL-8B |
|---|---|---|
| The model itself answered (not the built-in fallback) | 5/5 (after the token-budget fix) | 5/5 |
| Flagged the far explicit contradiction N3 as a conflict | **5/5** | **5/5** |
| Cited the far related card F1 | 2/5 | 3/5 |
| Cited the paraphrase F3 (index only) | 0/5 | 0/5 |
| Flagged the subtle tension N2 | 0/5 | 0/5 |
| Cited or mentioned the pizza card beside T | **0/5** | **0/5** |
| Cited a card it was not given | 0/5 | 0/5 |
| Showed an internal C# key to the designer | 0/5 | 0/5 (1 of 3 before the fix) |
| Changed a kept card | 0/5 | 0/5 |
| A declined idea reached the designer in a thought | 0/5 | 0/5 |
| Strategist repeated a discarded direction, **with decision memory** | **0/5** | **0/5** |
| …the same, **without decision memory** (the old behaviour) | **5/5** | 1/5 |

## 5. Validated, partly validated, hypothetical

| Claim | Status |
|---|---|
| Ideas keep identity, content, links and revisions across edits, moves and sessions | **Validated** (deterministic) |
| Rejected ideas and decisions, with reasons, stay accessible across sessions | **Validated** |
| Rejected ideas influence later suggestions appropriately | **Validated** for Strategist (5/5 → 0/5 on Haiku) and for thoughts. "Appropriately" is only partly validated: the escape hatch is topic overlap |
| The AI doesn't treat proximity as relevance | **Validated** (0/10 live citations of the near, unrelated card; deterministic checks) |
| The AI names the cards behind its reasoning, and why | **Validated** (checked citations; invented keys dropped; shown in the UI) |
| The AI surfaces explicit contradictions, even far away | **Validated** (10/10) |
| The AI finds related cards far away that share words | **Partly validated.** The engine finds them 100% of the time; models cite them in about half of thoughts |
| The AI finds related cards with no shared words (paraphrase) | **Hypothetical.** 0/10. Needs semantic retrieval |
| The AI notices subtle tensions, not just contradictions | **Hypothetical.** 0/10 |
| Interaction history improves relevance | **Hypothetical.** The edit co-attention signal is wired in but unmeasured; the version based on creation time was noise |
| Suggestions help without interrupting | **Partly.** The pacing rules are covered by the smoke test; whether the content is *useful* needs people, not tests |

## 6. Limitations

- One synthetic board, in English, 5 runs per model. The Chinese path (two-character terms) is implemented but untested.
- Topic thresholds were tuned on this fixture. On large boards with shared vocabulary, expect false positives (two common terms are enough).
- The repeat guard can over-suppress: a different idea that uses similar words is held back. Held-back items are logged (`hold-repeat`) but you can't see them yet.
- Rejection signals not captured yet: Try again (replace), asking for a fresh thought, editing away AI text, deleting kept cards an agent made, 👍/👎 (still only reaches Copilot, as titles).
- Most records will have no reason, because reasons are only captured when you already give one.
- Revisions are stored but still not shown, and agents don't read earlier versions.
- Not built for thousands of cards (the index is rebuilt on every call).
- Thoughts made by the built-in rules look the same as model thoughts.

## 7. Roadmap, in priority order

**P0: trust and reliability (done 2026-11-18, see section 8)**
1. ~~Make fallbacks visible and retry truncated replies.~~
2. ~~Make held-back repeats auditable.~~ They're in the Crew popover rather than Review, because the Review button only shows when drafts or suggestions are waiting.
3. ~~Capture the remaining rejection signals.~~

**P1: intelligence**
4. Semantic retrieval with embeddings (Studio AI locally, or the cloud API) to generate candidates, keeping the term layer as the explainable fallback. Target: F3 cited in at least 4 of 5 runs.
5. A deterministic "Related" section in the card sheet, built from `contextFor` with its reasons. Related cards show up without depending on what a model chooses to cite.
6. Treat group and frame membership as an explicit link.
7. Let agents read revision history ("this claim used to say…") and add a version browser.

**P2: scale and validation**
8. Label related pairs on real boards (the seeded studies and user boards), measure precision and recall, and tune the thresholds, Chinese included.
9. Cache the index between saves so boards with 1,000+ cards stay fast.
10. Replace the topic-overlap escape hatch with a cheap model judgement: does this new card answer the stated reason?

## 8. P0 follow-up (2026-11-18)

**What changed**

- **Truncated replies are retried.** When a Cloud API reply ends with `finish_reason: "length"` and nothing usable came back (empty, or JSON cut short), the request is sent once more with 2.5 times the budget, at most 4,600 tokens (`apiChat`, `readChatStream`). This applies to every Cloud API call, not just the advisor.
- **Rule-made thoughts say so.** A thought made by the built-in rules shows a small "built-in rules" tag next to the agent's name. Its tooltip says no model answered. Model thoughts carry no tag, following the rule that a label appears only when it carries information.
- **Held-back repeats can be seen.** What the guard holds back is kept in `board.held`, up to 30 items. When anything is held, the Crew popover shows one quiet line: "Held back N ideas you turned down · Show". The list says:
  - what was held back
  - what it repeats, and when and why that was turned down

  Each item has **Dismiss** and **Show anyway**. Showing a thought puts it back on its card; showing a direction adds it as a draft. Nothing is counted on a badge and nothing interrupts.
- **More rejection signals.** They fall into two kinds:

  | Signal | Strength | Effect |
  |---|---|---|
  | Discard a draft, ignore a thought, decline a suggestion, adopt another direction | strong (as before) | told to agents; repeats held back |
  | Remove text from an agent's card (new) | strong | told to agents; repeats held back |
  | Try again on drafts (new) | soft | told to agents only |
  | Ask for a fresh angle on a thought (new) | soft | told to agents only |
  | Delete a kept card an agent made (new) | soft | told to agents only |

  Soft signals mean "not this one" rather than "never this", so they never hold anything back. Two cases leave no record: accepting an agent's own suggested edit doesn't count as you removing text, and a Try again that fails takes its record back. Undoing a delete also withdraws the record.

**Tests**

The new suite has 63 passing checks and 2 known limitations: the 39 above plus 24 P0 checks, run on a fresh board. The smoke test passes 136/136, and the colour lint and app sync checks pass.

The live models were re-run with 5 runs each:
- Claude Haiku 5.5 reproduced the decision-memory result: it repeated a discarded direction 0 of 5 times with memory and 5 of 5 without.
- For Qwen3-VL-8B, the keyword check flagged 1 of 5 runs with memory, the same as without. The guard didn't treat that run as a repeat. Repeated runs now log the model's raw directions so a disagreement like this can be checked.

**Still open**

- Held items are only listed. The thoughts the crew already showed have no history of their own.
- Soft signals have no effect beyond the prompt, so whether a repeat after Try again still happens is up to the model.
- The "edited out" rule works on sentences. Editing within a sentence is not recorded.

## 9. P1: meaning (embeddings) and a Related section (2026-11-18)

**Finding first: embeddings are not a drop-in relevance test.** On the PoC board, the cards related to T were W1, N2, F1, F3 and N3; the unrelated ones were N1, F2, a hiring plan and two others. No model gave every related card a higher similarity to T than every unrelated card:

| Embedding model | Lowest related | Highest unrelated | Separates? |
|---|---|---|---|
| openai/text-embedding-3-small | 0.319 (F3: 0.349) | 0.365 (hiring plan) | no |
| openai/text-embedding-3-large | 0.317 | 0.322 | no |
| baai/bge-m3 | 0.475 (F3) | 0.539 (espresso) | no |
| cohere/embed-5-fast | 0.480 | 0.477 | barely |
| mongodb/voyage-4 | 0.389 | 0.348 | yes, margin 0.04 |
| google/gemini-embedding-2 | 0.685 | 0.652 | yes, margin 0.03 |

So a single similarity cut-off can't decide relevance, and the right cut-off would differ per model.

**Design.** Meaning is used for recall, not as a verdict:
- The three cards closest in meaning that links and topic didn't pick become candidates, marked "close in meaning". Each must be at least as close as the board's median card.
- The model then judges them. It already ignored the unrelated neighbour 10 of 10 times.
- Vectors come from the Cloud API's `/embeddings`, are cached per card, and are re-fetched only for a card whose content changed.
- If the endpoint fails, it is tried once and then left alone for that configuration; links and topic still work.
- Defaults: `google/gemini-embedding-2` on OpenRouter, `text-embedding-3-small` on OpenAI; `apiCfg.embedModel` overrides either.

**Thoughts don't show everything that's related.** With gemini recall, F3 reached the prompt as a scored candidate in every run, yet neither model cited it in a thought (0/10). Each thought is about the most important point (here the legal conflict) and cites one to three cards. So "cited in a thought" measures what the model chose to write about, not what it recognised. The advisor now also returns `related`: every listed card that bears on this one, whether or not the note uses it. This is checked against the given keys like everything else and kept in `board.related`. Your cards are never changed.

**Related section in the card sheet.** It uses the same rows as "Based On":
- the crew's judgement first, with conflicts at the top and marked "Conflicts"
- then what links, topic and meaning pick
- direct sources aren't repeated
- the reason is in each row's tooltip, and choosing a row goes to that card

This works without a model too, from the deterministic signals.

**Tests.** The new suite has 77 passing checks and 2 known limitations, including 14 new meaning and Related checks on scripted vectors. The smoke test passes 136/136.

**Live results.** These were cut short by the OpenRouter account having no credits (402 on most requests, and the free Qwen tier was rate-limited). In one clean sequential Haiku run, 4 of 5 looks were answered by the model:
- F3 was judged related in 2 of those 4. Before embeddings, it never reached the model except as an index line.
- The explicit conflict N3 was flagged in 4 of 4.
- The pizza card was never judged related.
- The new retry recovered 3 replies that had used their whole budget on reasoning.

Strategist couldn't be re-measured: every call got a 402.

**Still hypothetical:** whether the meaning layer helps on real boards, in Chinese, and with the local model. The evidence so far comes from one synthetic English board and a handful of runs.

## 10. When no model can be reached (2026-11-25)

The live runs in section 9 stopped on an OpenRouter account with no credits. That case now has its own tests, so it never depends on a live account.

- **402 (no credits), refused key, unknown model.** The first failing call marks the connection, whether it was a chat call or an embeddings call. After that, nothing more is sent to the Cloud API until the settings change or a re-check passes: no chat, no embeddings. A 402 is never retried as if the reply had been cut off.
- **Thoughts say why.** A thought made by the built-in rules keeps the reason no model answered, and the "built-in rules" tag's tooltip shows it ("Cloud API is out of credits (HTTP 402), so this thought came from built-in rules"). Later looks that skip the Cloud API carry the same reason.
- **Moves still happen.** Strategist forks from built-in rules and its toast says the Cloud API is out of credits. The card sheet's Related section still fills from links and topic. Decision memory doesn't need a model.
- **No key at all.** Nothing leaves the page; the crew works on built-in rules.

`tests/context-poc.cjs` group F covers all of this (18 checks). Live measurements of Strategist with embeddings still need an account with credit.
