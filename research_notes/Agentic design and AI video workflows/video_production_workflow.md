# AI-assisted video production workflow for solo creators and small studios (as of 2026-11-26)

Scope: the real idea-to-published pipeline for narrative formats (vertical micro-drama / short series, short narrative films) and short-form social video; the tools at each stage with prices; cost and time; pain points; how iteration and versions are handled.

Source labels used below:
- **[Official]** = the vendor's own docs or pricing page (accurate for that vendor's product; prices change often).
- **[Press]** = independent reporting (TechCrunch, NPR, TheWrap, Axios, Variety and similar).
- **[Vendor claim]** = a blog or playbook from a company selling a tool. Treat its cost, time and quality numbers as marketing.
- **[Practitioner]** = a named creator or studio describing its own work.
- **[Opinion]** = commentary.
- **[Snippet]** = seen only in a search-result summary; the full page was not read. Lower confidence.

Headline facts that change older assumptions:
1. **OpenAI Sora 2 no longer exists as a product.** OpenAI announced on 2026-03-24 that it was discontinuing Sora in the consumer app and the API. The app and sora.com closed on 2026-04-26, and the API shut down on 2026-09-24.
2. **The 2026 workhorse video models are Kling 3.0, Veo 3.1 (Lite/Fast/Quality) and Seedance 2.0/2.5.** Runway Gen-4.5, MiniMax Hailuo H3 (July 2026) and LTX-2.5 (open weights) fill out the field.
3. **Freepik was renamed Magnific in April 2026, and Weavy became Figma Weave** after Figma acquired it in October 2025.
4. **New platform rules:**
   - YouTube clarified its "inauthentic content" monetization rules on 2026-07-16.
   - The EU AI Act Article 50 labelling duties took effect on 2026-08-02.
   - TikTok requires labels on realistic AI content and auto-applies labels when C2PA credentials are present.

---

## Q1. What are the stages of a typical AI video production pipeline, and which creators/studios have published theirs?

### Takeaway
By late 2026 the pipeline has settled into roughly the same stages across sources:
1. Premise/logline, then a season beat sheet or script.
2. Character and world bible, with locked reference sheets.
3. Storyboard and shot list, done as cheap stills first.
4. Keyframes.
5. Per-shot image- or reference-to-video, with each shot routed to the model that suits it.
6. Voice and lip-sync.
7. Music and SFX.
8. Edit, upscale and grade.
9. Captions and localization.
10. Publish, read retention, then iterate.

Most "published pipelines" come from vendors (invideo, MinionArts, Saga, Paintbrush, LTX). A handful of named practitioners and studios have described theirs: PJ Accetturo/Genre.ai, Dashverse, StoReel, Vigloo and Holywater. Workflows of the 2026 festival winners are essentially undocumented.

### Cited Findings

**Canonical stage lists**
- **Saga's proposed pipeline:** idea → characters → scenes → screenplay → storyboards → shots → voices, music, sound, editing and distribution. The same piece reports that hybrid workflows (live action plus editing plus generative tools) are the norm, and that "the model matters less than a connected workflow." Published 2026-08-31, updated 2026-09-12. [Vendor claim/Opinion; synthesis of 40+ podcast interviews, no statistics] — [Saga, "State of AI Filmmaking 2026"](https://www.createsagas.com/post/state-of-ai-filmmaking-2026-what-40-ai-film-leaders-told-us-may-surprise-you)
- **MinionArts micro-drama playbook** (2026-07-17), seven stages [Vendor claim] — [MinionArts playbook](https://www.minionarts.com/blogs/how-to-make-ai-microdrama-2026-production-playbook):
  1. A one-sentence premise with a built-in power imbalance, checked against what platforms are acquiring.
  2. A season beat sheet for every episode, then full scene prompts for the next batch.
  3. Character lock, with 6–10 reference images per lead.
  4. Shot generation, routed by model: Seedance 2.0 for dialogue with lip sync, Kling 3.0 for motion and action, Veo 3.1 for cinematic establishing shots.
  5. Voice and lip-sync, with one locked voice ID per character. Native lip-sync where possible, retrofitted lip-sync elsewhere.
  6. Episode assembly in a node graph.
  7. Distribution and localization.
- **MinionArts micro-drama format specs** (same source):
  - Native 9:16 ("Generate vertical, never crop horizontal").
  - Episodes of 60–120 s, with roughly 8–15 shots each.
  - Hook inside the first 15 s; paywall typically starts at episode 8–10.
  - Seasons of 60–100 episodes.
  - The playbook says "the single most expensive mistake… is generating footage before the season structure is locked."
- **invideo micro-drama workflow** (2026-07-15), five stages [Vendor claim] — [invideo, Script to Episode](https://invideo.io/blog/ai-micro-drama-script-to-episode/):
  1. **Context:** a "creative producer" agent loads the script, show bible, tone notes and character/world details. Character sheets and location references are generated in parallel.
  2. **Storyboard:** one storyboard agent per episode. High-stakes scenes are storyboarded as a vertical composite image in GPT-Image-2 and attached to Seedance 2.0.
  3. **Generation:** a "DOP" agent routes each shot to Veo (dialogue and performance), Kling (native multi-shot) or Seedance 2.0 reference-to-video (matching an existing frame).
  4. **Assembly:** takes are selected and cut in Premiere Pro, DaVinci Resolve or invideo. Short clips are lengthened with Extend, film grain is added, and Topaz Starlight 2.5 does the upscale.
  5. **Next episode:** the pipeline reruns with the same locked context.
- **invideo short-film guide:** lock character, antagonist, prop and format details before generating anything. Finish storyboarding, generation and edit for one act before starting the next, to limit context loss. [Vendor claim] — [invideo, How to make an AI short film](https://invideo.io/blog/how-to-make-ai-short-film/)
- **A common three-layer split** [Snippet; invideo/FutureFlow guides] — [invideo AI filmmaking tools](https://invideo.io/blog/ai-filmmaking-tools/); [FutureFlow 2026 workflow](https://www.futureflowai.in/post/how-to-make-a-cinematic-ai-short-film-in-2026-the-complete-workflow):
  - Image models build characters and frames: Recraft V4, Nano Banana, GPT-Image-2.
  - Video models generate motion: Kling 3.0, Veo 3.1, Seedance 2.0.
  - Finishing tools handle realism, e.g. Topaz Astra.
  - The guides describe Nano Banana making "4-angle turnaround character sheets… at 4K".
- **Paintbrush's cost model lists the stages implicitly** (2026-10-07, updated 2026-11-22): character sheets, setting images, speech, video, music removal, voice cleanup, new-angle keyframes, "AI direction" and per-shot checks. [Vendor claim] — [Paintbrush, cost per minute](https://www.paintbrush.gg/blog/ai-video-cost-per-minute)
- **LTX on pacing and where cost now sits** (2026-11-15) [Vendor claim] — [LTX, How much does AI video generation cost](https://ltx.io/blog/ai-video-generation-cost):
  - A finished minute has "about 10 to 15 shots at typical ad or narrative pacing, most of them 3 to 5 seconds long."
  - "Script, design and editing time are now the largest cost lines for well-run AI video teams."

**Practitioner and studio pipelines that have been described publicly**
- **PJ Accetturo, Kalshi NBA Finals ad (June 2025, Veo 3 era; older data)** [Press/Practitioner] — [NPR, 2025-06-23](https://www.npr.org/2025/06/23/nx-s1-5432712/ai-video-ad-kalshi-advertising-nba-finals); [getcoai](https://getcoai.com/news/kalshis-nba-finals-ad-costs-just-2k-using-googles-ai-video-tool/):
  - Workflow: script in ChatGPT → Gemini turns it into a shot list and prompts → Veo 3 → edit in Premiere.
  - "about 300–400 generations to get 15 usable clips."
  - One person, two to three days.
  - Kalshi says prompting/generation cost was under $2,000. Accetturo's fee was not disclosed.
- **Genre.ai, Accetturo's studio (podcast dated 2026-09-08)** [Practitioner] — [Wrapbook On Production podcast](https://www.wrapbook.com/on-production-podcast/the-real-economics-of-ai-native-production-featuring-pj-accetturo):
  - Works in pods of five: writer, director, cinematographer, animator, editor. Sometimes a colorist or voice artist joins.
  - Agents pitch "50 different locations" or characters, and humans pick.
  - Clients are offered a hybrid spectrum from about "70% real, 30% AI" up to "90% synthetic."
  - Tools named: Luma, "C-dance 2" (Seedance 2), an agentic editor, a composer tool, and Unreal on an LED volume.
- **Dashverse (India) and StoReel (China), per TheWrap (2026-06-11)** [Press] — [TheWrap via Yahoo](https://www.yahoo.com/entertainment/tv/articles/ai-generated-microdramas-real-thriving-130000975.html):
  - Showrunners feed roughly one minute of dialogue into an engine, which generates about a minute of video. They then refine prompts and "elements."
  - Tools cited: Seedance 2.0, Veo 3 and StoReel's Canvas tool. Studios use libraries of AI actors, and artists build AI locations and effects.
  - Scripting takes 10 days to a month; production takes about a month.
  - StoReel has 60 staff (20 in scripting, 20 in production). Dashverse has about 700.
- **Vigloo, *Bloodbound Luna*** (press release 2026-03-10) [Vendor claim] — [BusinessWire](https://www.businesswire.com/news/home/20260310243745/en); [Korea Times](https://www.koreatimes.co.kr/business/20260505/korean-short-drama-creator-navigates-chinas-shadow-in-global-market):
  - A 22-episode English-language AI micro-drama, made "in just eight weeks" by fewer than 10 people.
  - Used "reference-based AI generation" and fully synthetic voices.
  - Company claims 1/3 of the usual time and about 1/6 of the usual cost.
  - Vigloo has since put its internal workflow into a beta product, "Vigloo Studio."
- **Holywater** [Snippet] — [Holywater Tech (Wikipedia)](https://en.wikipedia.org/wiki/Holywater_Tech); [Scribbles on Holywater's AI playbook](https://scribbles.cloud/how-holywater-s-ai-first-playbook-should-change-your-short-f):
  - Runs MyMuse, an AI-content hub, alongside MyDrama, which is human-produced.
  - AI series on MyMuse are used to test storylines that are then produced with actors for MyDrama.
  - Target: 100 AI series a month by end-2026. This is a goal, not confirmed output.
  - Bought the AI-VFX studio Jeynix in February 2026.
- **Runway AIF 2026** [Snippet/Official] — [AIF 2026 gallery](https://aif.runwayml.com/); [aifilmcontests summary](https://aifilmcontests.com/topics/ai-film-festival-winners-2026); [AIF FAQ](https://aif.runwayml.com/faq):
  - Grand Prix: Robert Gaudette (Canada), *A Face Only A Mother Could Love* (7:50). Gold: *THE WELL* (Dorian & Daniel). Silver: *Where Knights Fall* (Mathery).
  - Judges score each film 1–10 on composition, narrative cohesion, originality and AI techniques.
  - Runway encourages its own tools but accepts others.
  - Screenings: New York 6/11, Los Angeles 6/18.
  - No winner's workflow breakdown was found.
  - For scale, the 2025 edition drew about 6,000 submissions for 10 finalists of 2–10 minutes each (2025 data) — [Deadline, July 2025](https://deadline.com/2025/07/imax-runway-screenings-ai-film-festival-selections-1236468521).
- **Curious Refuge** [Official/Press] — [Curious Refuge hybrid course](https://curiousrefuge.com/hybrid-ai-filmmaking); [Curious Refuge courses](https://curiousrefuge.com/ai-filmmaking); [Reuters via Cyprus Mail, 2026-02-21](https://cyprus-mail.com/2026/02/21/ai-film-school-trains-next-generation-of-hollywood-moviemakers):
  - The 2026 "hybrid" course is built on shooting real performances on a gray stage and finishing them in generated worlds. It is pitched as tool-agnostic.
  - The core AI filmmaking course costs $749.
  - The school also runs studio workshops under NDA.
- **Practitioner habits from Saga's interviews** [Practitioner via Opinion piece] — [Saga](https://www.createsagas.com/post/state-of-ai-filmmaking-2026-what-40-ai-film-leaders-told-us-may-surprise-you):
  - Jimmy Woolley (404 Films) mixes human concepts with machine-generated alternatives, then uses a second model to rank them blind.
  - Percy Leon uses structured tools for series names, loglines and 2–3 minute episodes.

**Market context for micro-drama, the format that most demands a pipeline**
- **ReelShort, the opposite stance:** its content chief says AI has "no place" in her writers' room. A sister platform uses AI for dubbing and subtitles but "not for storytelling." [Snippet; Variety/TheWrap coverage] — [Yahoo/Variety "Vertical Micro-Dramas Are an $8 Billion Business"](https://www.yahoo.com/entertainment/tv/articles/vertical-micro-dramas-8-billion-130000807.html)
- **Fox and Holywater:** Fox took an equity stake in Holywater and committed to 200+ vertical titles for MyDrama over two years. [Snippet] — [My Drama (Wikipedia)](https://en.wikipedia.org/wiki/My_Drama)
- **Distribution and monetization** (MinionArts) [Vendor claim, citing Omdia/Deloitte] — [MinionArts playbook](https://www.minionarts.com/blogs/how-to-make-ai-microdrama-2026-production-playbook):
  - Platforms named: ReelShort, DramaBox and PineDrama (TikTok's micro-drama app).
  - The first 5–10 episodes are free. After that, coins at $0.50–$1.00 per episode, rewarded ads, or weekly subscriptions at $10–20.

### Inferences
- **The pipeline has two loops.**
  - An inner per-shot loop: generate N takes → select → extend or fix.
  - An outer audience loop: publish → retention/paywall data → rewrite the next batch or the next storyline.
  - Holywater's practice of testing storylines with AI and then producing the winners with actors is the clearest published outer loop. It maps directly onto Vellum's "judged by an audience" closing step.
- **Three lock gates recur before video credits are spent:** season/story structure, character and world references, and storyboard stills. These are natural Vellum decision nodes, and the rejected alternatives at each gate are worth keeping.
- **Vendors already sell the "AI crew" framing:** invideo's producer/storyboard/DOP agents, MinionArts' "AI Director" agent, Flora's FAUNA assistant (see Q2) and Genre.ai's agents pitching 50 options. A Scout/Strategist/Wright/Critic crew is on-trend. Differentiation therefore has to come from the decision trail, alternative branches, local-first provenance and the closed audience loop, not from having agents at all.

### Gaps
- No documented production workflow (tools, generation counts, hours) was found for the AIF 2026 winners; the Fast Company article returned 403.
- Curious Refuge does not publish a tool-level syllabus.
- No independent time-and-motion study of AI video production exists; the stage timings are vendor or practitioner self-reports.
- The search tool surfaced no Reddit (r/aivideo, r/StableDiffusion, r/runwayml) threads, so grassroots solo-creator pipelines are under-represented here.

---

## Q2. Which tools are used at each stage in 2026, for what, and at what price?

### Takeaway
Creators route each shot to whichever model suits it, rather than committing to one model:
- **Kling 3.0:** motion, multi-shot and character "elements".
- **Veo 3.1:** dialogue/performance with native audio, plus cinematic establishing shots.
- **Seedance 2.0/2.5:** dialogue-heavy, reference-anchored shots. This is the micro-drama workhorse.
- **Runway Gen-4.5/Aleph:** references and video-to-video editing.
- **MiniMax H3 and LTX-2.5:** cheaper or open options.

Around these sit Nano Banana Pro or GPT-Image-2 for reference sheets and keyframes, ElevenLabs for voice, Suno or Eleven Music for music, and Premiere/Resolve/CapCut for the edit, plus a crowded layer of all-in-one aggregators and node canvases (Higgsfield, LTX Studio, Magnific/Freepik Spaces, Figma Weave, Flora, Krea).

Hosted per-second prices in November 2026 range from about $0.03 to $0.70. Subscription credits mostly do not roll over.

### Cited Findings

**Video generation models (status, clip limits, price)**

| Model | Status (Nov 2026) | Max clip | Price | Typical use |
|---|---|---|---|---|
| **Google Veo 3.1** (Lite/Fast/Quality) | Active | 4/6/8 s in Flow | API: Lite $0.05/s (720p, audio); Fast $0.10/s (720p), cut from $0.15 in April 2026; standard $0.40/s with audio, $0.60/s at 4K | Dialogue/performance with native audio; establishing shots |
| **OpenAI Sora 2** | **Discontinued** (app 2026-04-26, API 2026-09-24) | — | Former API: $0.10/s at 720p (historical) | — |
| **Kling 3.0** | Active (LTX also lists a "Kling 4.0"; not verified elsewhere) | 3–15 s | Plans $10–$180/mo; 4K = 30 credits/s | Motion, multi-shot, character "elements" |
| **Runway Gen-4.5 / Aleph 2.0** | Active | 5 or 10 s (Gen-4.5) | Gen-4.5: 12 credits/s; API ~$0.12/s at 720p. Aleph 2.0: 140 credits per 5 s | Reference-driven consistency; video-to-video edits |
| **ByteDance Seedance 2.0 / 2.5** | Active via CapCut/Dreamina and resellers | — | ~$0.30/s at 720p via Higgsfield; 2.5 at 1080p is "premium tier" | Dialogue-heavy, reference-anchored micro-drama shots |
| **MiniMax Hailuo H3** | Released ~2026-07-29/31 | 15 s, 2K, native audio | $0.08/s (768p), $0.13/s (2K) | Cheaper hosted option |
| **LTX-2 / LTX-2.5** (Lightricks) | Open weights + API | — | API Fast $0.09–0.30/s; Pro $0.12–0.39/s; free self-hosted | Local / open-weights generation |

Details and sources for each row:

- **Google Veo 3.1:**
  - Flow credit costs per generation [Official] — [Google Flow credits help](https://support.google.com/flow/answer/16526234?hl=en):
    - Lite: 10 credits (5 on Ultra) for 4, 6 or 8 s.
    - Fast: 20 (10 on Ultra).
    - Quality: 100 for 8 s.
    - Ultra "20x" and family-plan managers get Lite at 0 credits in Lower Priority mode.
  - Flow allowances (same page):
    - Everyone gets 50 credits a day.
    - Monthly extras: AI Plus +200, AI Pro +1,000, Ultra $100 +10,000, Ultra $200 +25,000.
    - Daily and monthly credits do not roll over.
  - The same Flow page lists "Omni Flash 1.1/1.2" models: 4–15 s clips, editing, extend by 3–10 s, and upscaling to 720p/1080p (4K on Ultra only, 50 credits flat for 1–10 s). [Official]
  - API pricing sources: [LTX cost guide, 2026-11-15](https://ltx.io/blog/ai-video-generation-cost) [Vendor, citing list prices]; [The Decoder on Veo 3.1 Lite](https://the-decoder.com/?p=33867) [Press]; [WaveSpeed](https://wavespeed.ai/blog/cost-and-billing/google-veo-3-pricing/).
  - "Ingredients to Video" accepts 3–4 reference images to hold identity steady [Snippet] — [invideo FAQ, Flow vs Runway vs Kling](https://invideo.io/faq/google-flow-vs-runway-vs-kling-which-is-best-for-ai/).
  - A third-party guide says Veo 3.1 Fast and Quality will be retired from Flow on 2026-12-05 [Snippet, unverified] — [WaveSpeed Flow pricing](https://wavespeed.ai/blog/cost-and-billing/google-flow-pricing-2026/).
- **OpenAI Sora 2 (discontinued):**
  - Announced 2026-03-24, citing compute costs and a shift in focus — [NPR, 2026-03-25](https://npr.org/2026/03/25/g-s1-115055/openai-pulls-the-plug-on-sora-the-viral-ai-video-app-that-sparked-deepfake-concerns); [TechCrunch, 2026-03-24](https://techcrunch.com/2026/03/24/openais-sora-was-the-creepiest-app-on-your-phone-now-its-shutting-down/) [Press].
  - App closed 2026-04-26 and API shut down 2026-09-24 — [LTX cost guide](https://ltx.io/blog/ai-video-generation-cost); [invideo, Sora 2 what it was](https://invideo.io/blog/sora-ai-video-generator/) [Vendor].
  - Former API price (historical) — [OpenAI sora-2 model page](https://developers.openai.com/api/docs/models/sora-2).
- **Kling 3.0:**
  - Official plans (list price/month): Standard $10 for 660 credits ("33 720p videos"), Pro $37 for 3,000, Premier $92 for 8,000, Ultra $180 for 26,000. First-subscription discounts bring these to $6.99/$25.99/$64.99/$127.99.
  - Clips run 3–15 s; 4K costs 30 credits/s.
  - Features: Multi-Shot and Custom Multi-Shot (duration, framing, camera per shot); Omni "element reference" and "element voice control" for recurring characters and voices.
  - Element creation quota by plan: 30 (Basic), 50 (Standard), 150 (Pro and Premier), 500 (Ultra).
  - Source dated 2026-07-28 [Official] — [Kling 3.0 credit cost guide](https://kling.ai/blog/kling-video-3-0-credit-cost-guide).
  - The API is billed separately (a list price of $0.14 per unit) [Snippet].
  - LTX lists "Kling 3.0 and 4.0" in its mid tier ($0.08–0.25/s) [Vendor] — [LTX](https://ltx.io/blog/ai-video-generation-cost). Kling 4.0 was not verified elsewhere.
- **Runway:**
  - Plans: Standard $12/user/mo (annual) for 625 credits, Pro $28 for 2,250, Max $76 for 9,500.
  - Gen-4.5 costs 12 credits per second (60 for 5 s, 120 for 10 s). Aleph 2.0 costs 140 credits per 5 s.
  - Max replaced the earlier Unlimited tier on 2026-06-01. Only Max and Team roll credits over (one month).
  - [Snippet; secondary summaries of runway.com, Aug–Sep 2026] — [eesel Runway pricing](https://eesel.ai/blog/runway-ai-pricing); [Runway pricing page](https://www.runwayml.com/pricing).
  - API: Gen-4.5 about $0.12/s at 720p — [LTX](https://ltx.io/blog/ai-video-generation-cost).
- **ByteDance Seedance 2.0 / 2.5:**
  - Rolled out on CapCut/Dreamina in phases and reached the US in April 2026 [Official/Press] — [CapCut newsroom](https://www.capcut.com/newsroom/dreamina-seedance-2); [TechCrunch, 2026-03-26](https://techcrunch.com/2026/03/26/bytedances-new-ai-video-generation-model-dreamina-seedance-2-0-comes-to-capcut/); [No Film School, 2026-04-09](https://nofilmschool.com/capcut-dreamina-seedance-2-0).
  - At rollout CapCut restricted making videos from images or videos with real faces, added IP-blocking, and applied an "invisible watermarking" technology — [No Film School](https://nofilmschool.com/capcut-dreamina-seedance-2-0).
  - Not available on Dreamina in parts of Europe [Snippet, Higgsfield blog] — [Higgsfield Seedance pricing](https://higgsfield.ai/blog/seedance-2-0-pricing-2026).
  - Third-party access at about $0.30/s for 720p via Higgsfield [Press] — [DeepLearning.AI The Batch](https://www.deeplearning.ai/the-batch/bytedance-adds-state-of-the-art-seedance-2-0-video-to-capcut-while-openai-retreats).
  - Seedance 2.5 was live by November 2026; LTX puts it at 1080p in the premium tier ($0.30–0.70/s) — [LTX](https://ltx.io/blog/ai-video-generation-cost). Paintbrush charges 10.92 credits/s for Seedance 2.5 — [Paintbrush](https://www.paintbrush.gg/blog/ai-video-cost-per-minute).
  - In micro-drama pipelines, "Seedance carries the dialogue-heavy scenes" [Vendor] — [MinionArts best tools](https://www.minionarts.com/blogs/best-ai-tools-make-microdramas-2026).
- **MiniMax Hailuo H3:**
  - Clips up to 15 s at 2K with native audio. Per-second pricing ($0.08 at 768p, $0.13 at 2K) replaced Hailuo 2.3's per-clip rate of $0.19–0.56 [Snippet, from MiniMax pay-as-you-go docs as reported] — [UsagePricing](https://www.usagepricing.com/blueprint/activity/minimax-2026-07-30-h3-video-per-second).
  - The open-weights promise is unverified — [NYU Shanghai RITS](https://rits.shanghai.nyu.edu/ai/minimax-releases-h3-2k-video-with-native-audio-open-weights-promised/); [kie.ai](https://kie.ai/blog/what-is-hailuo-h3).
  - A headline notes a "copyright lawsuit clouds every clip" — [TechTimes, 2026-07-31](https://www.techtimes.com/articles/322521/20260731/minimax-h3-opens-ai-video-developers-copyright-lawsuit-clouds-every-clip.htm).
- **LTX-2 / LTX-2.5 (Lightricks):**
  - LTX-2 open weights were released at CES 2026, with an NVIDIA ComfyUI quick-start guide — [NVIDIA](https://www.nvidia.com/en-gb/geforce/news/rtx-ai-video-generation-guide). LTX-2.5 got day-0 ComfyUI support (requires ComfyUI 0.32.0+) — [Comfy blog](https://blog.comfy.org/p/ltx-25-day-0-support-in-comfyui); [docs.comfy.org](https://docs.comfy.org/tutorials/video/ltx/ltx-2-5.md).
  - API pricing with audio included: Fast $0.09/s (720p), $0.13 (1080p), $0.19 (1440p), $0.30 (4K); Pro $0.12–$0.39/s.
  - Open weights are free for commercial use by organizations under $10M annual revenue.
  - LTX says local inference needs an NVIDIA GPU with 32GB+ VRAM (A100/H100 recommended for production). Community guides claim quantized FP8/NVFP4/GGUF builds run in 8–16GB. The VRAM figures conflict.
  - Features cited: multi-shot "connected shots in one generation," and "Retake" to regenerate one section of a clip.
  - Sources [Vendor/Community] — [LTX cost guide](https://ltx.io/blog/ai-video-generation-cost); [DEV Community guide](https://dev.to/gary_yan_86eb77d35e0070f5/how-to-configure-ltx-2-in-comfyui-complete-2026-guide-for-ai-video-generation-32lk); [RunPod](https://www.runpod.io/blog/ltx-2-5-the-open-weights-world-model-built-for-speed-and-how-to-run-it-on-runpod).
- **Wan:**
  - Wan 3.0 is listed in LTX's mid tier — [LTX](https://ltx.io/blog/ai-video-generation-cost).
  - Paintbrush charges 6.5 credits/s for Wan 3.0, in "uncensored" projects only — [Paintbrush](https://www.paintbrush.gg/blog/ai-video-cost-per-minute).
  - A minute at 480p costs about $9 — [Kenerate](https://kenerateai.com/blogs/how-much-does-an-ai-video-generator-cost) [Snippet].
  - The open-weight status of Wan 3.0 was not confirmed.
- **Pika 2.5:** in LTX's entry tier ($0.03–0.08/s) [Vendor] — [LTX](https://ltx.io/blog/ai-video-generation-cost).
- **Luma:** used by Genre.ai [Practitioner] — [Wrapbook](https://www.wrapbook.com/on-production-podcast/the-real-economics-of-ai-native-production-featuring-pj-accetturo).
- **Midjourney:**
  - Video V1 launched June 2025 with 5-second image-to-video clips, costing about 8× an image generation (2025 data) — [TechCrunch, 2025-06-18](https://techcrunch.com/2025/06/18/midjourney-launches-its-first-ai-video-generation-model-v1/).
  - Plans: Basic $10, Standard $30, Pro $60, Mega $120 per month (20% off annual) — [Midjourney plans](https://docs.midjourney.com/docs/plans) [Official].

**Model routing (who uses what for which shot)**
- Veo (in Google Flow) "leads prompt adherence and native audio"; Runway "leads iteration speed and reference-driven consistency via Gen-4 Reference"; Kling "leads motion realism and multi-shot identity at volume." [Vendor opinion] — [invideo FAQ](https://invideo.io/faq/google-flow-vs-runway-vs-kling-which-is-best-for-ai/)
- invideo's micro-drama routing: Veo for dialogue and performance, Kling for multi-shot, Seedance 2.0 for reference-to-video. MinionArts' routing: Seedance 2.0 for dialogue, Kling 3.0 for action, Veo 3.1 for establishing shots. [Vendor] — [invideo](https://invideo.io/blog/ai-micro-drama-script-to-episode/); [MinionArts](https://www.minionarts.com/blogs/how-to-make-ai-microdrama-2026-production-playbook)

**Image, reference-sheet and keyframe models**
- **Nano Banana Pro (Gemini 3 Pro Image):** about $0.134 per 1K/2K image and $0.24 per 4K image, half price in batch, billed by tokens. Nano Banana 2 costs roughly half as much per image. [Snippet; third-party summaries] — [magichour](https://magichour.ai/blog/nano-banana-pro-pricing); [myarchitectai](https://www.myarchitectai.com/blog/nano-banana-api-pricing)
- **GPT-Image-2:** used for vertical storyboard composites that feed Seedance 2.0 [Vendor] — [invideo](https://invideo.io/blog/ai-micro-drama-script-to-episode/).
- **Seedream 5.5:** used for character sheets (19 credits each) and keyframes (3 credits + 1 per reference image) in Paintbrush [Vendor] — [Paintbrush](https://www.paintbrush.gg/blog/ai-video-cost-per-minute).
- **Midjourney:** a creator post says "Midjourney for Character design is still King" [Practitioner opinion, single post] — [bMovies feed](https://www.bmovies.app/research).
- **Reference-sheet counts:** 6–10 reference images per lead (MinionArts). Front, side, three-quarter and facial close-up sheets plus location sheets, locked as shared context before generating frames (invideo). [Vendor] — [MinionArts](https://www.minionarts.com/blogs/how-to-make-ai-microdrama-2026-production-playbook); [invideo](https://invideo.io/blog/ai-micro-drama-script-to-episode/)

**Voice, dialogue and lip-sync**
- **ElevenLabs:** a $5/month Starter plan [Official blog] — [ElevenLabs vs Suno](https://elevenlabs.io/blog/elevenlabs-vs-suno). It struck a global AI-music deal with UMG and is valued at $11B [Press] — [Music Business Worldwide](https://www.musicbusinessworldwide.com/elevenlabss-11b-valuation-is-more-than-twice-the-size-of-sunos-its-just-struck-a-global-ai-music-deal-with-umg/).
- **Micro-drama voice practice:** one locked voice-clone ID per character. Native lip-sync models where possible (Seedance 2.0, Veo), retrofitted lip-sync elsewhere [Vendor] — [MinionArts](https://www.minionarts.com/blogs/how-to-make-ai-microdrama-2026-production-playbook). Kling 3.0 Omni adds "element voice control" [Official] — [Kling](https://kling.ai/blog/kling-video-3-0-credit-cost-guide).
- **Retrofit lip-sync shortlists:** Sync Labs, HeyGen, Hedra and Magic Hour, plus LatentSync as a local open option. Sync Labs claims to be the only one with native Premiere Pro and DaVinci Resolve plugins. Most lip-sync tools need a source video; fewer go straight from image to talking video. [Vendor roundups] — [Dreamina roundup](https://dreamina.capcut.com/ai-video/best-ai-lip-sync-tools); [sync.so](https://sync.so/blog/best-ai-lip-sync-tools-for-video-editors); [VEED](https://www.veed.io/learn/best-ai-lip-sync-tools)

**Music and SFX**
- **Suno:**
  - Pro is $10/month for 2,500 credits (about 500 songs); credits do not roll over [Snippet, July 2026 review].
  - Warner settled with and licensed Suno in November 2025; Universal and Sony had not as of mid-2026.
  - Paid users get commercial use only for songs generated while subscribed. Suno now "technically retains authorship," granting a perpetual commercial license.
  - [Press/Snippet] — [Music in Africa](https://www.musicinafrica.net/magazine/suno-adjusts-ai-music-ownership-terms-after-warner-music-partnership); [Techpresso review](https://academy.techpresso.co/reviews/is-suno-worth-it); [Opus AI music news April 2026](https://www.opus.pro/blog/ai-music-news-april-2026)
- **Udio:** after its UMG settlement on 2025-10-30, Udio disabled downloads for all users, including paying subscribers. It reopened downloads for a 48-hour window, then held content "within a walled garden" (2025 data; 2026 relaunch status not found) [Press] — [Digital Music News](https://www.digitalmusicnews.com/2025/10/31/udio-downloads-disabled-umg-deal/); [AP via ClickOrlando](https://www.clickorlando.com/business/2025/11/02/ai-song-generator-udio-offers-brief-window-for-downloads-after-universal-settlement-upsets-users/).
- **Eleven Music:** ElevenLabs says it was trained on cleared content [Vendor claim]. The free tier excludes film, TV and client use [Snippet] — [licenseorg](https://licenseorg.com/blog/ai-music-licensing-suno-elevenlabs).
- **Composer tool for spotting and jingles:** Genre.ai uses one (unnamed) — [Wrapbook](https://www.wrapbook.com/on-production-podcast/the-real-economics-of-ai-native-production-featuring-pj-accetturo).

**Edit, finishing, captions**
- Premiere Pro or DaVinci Resolve for take selection and assembly. invideo ships a Premiere plugin. Topaz Starlight 2.5 does the upscale, which invideo says "tested best on faces and fabrics." Film grain goes on in finishing. [Vendor] — [invideo](https://invideo.io/blog/ai-micro-drama-script-to-episode/)
- CapCut has Seedance 2.0 built in, so it doubles as a generate-and-edit environment for short-form creators [Official] — [CapCut newsroom](https://www.capcut.com/newsroom/dreamina-seedance-2).

**All-in-one platforms and node canvases**
- **Higgsfield:**
  - Individual plans: Starter $15/mo for 200 credits, Plus $49 for 1,000, Ultra $129 for 3,000. Source dated October 2026 [Official blog] — [Higgsfield pricing explained](https://higgsfield.ai/blog/higgsfield-pricing-explained).
  - "Unlimited" is scoped "by a model list, a queue, a resolution ceiling, or a time window." All Unlimited sells as 1 day for $99 or 3 days for $250 [Official] — [Higgsfield All Unlimited](https://higgsfield.ai/blog/higgsfield-all-unlimited-explained).
  - Competitor Krea reports different prices: $19, $59 and $129 — [Krea](https://www.krea.ai/blog/higgsfield-pricing-explained-2026-unlimited-credits-and-real-monthly-costs).
- **LTX Studio:** sources conflict. G2 (April 2026) lists Lite $15, Standard $35, Pro $125. Toolradar (checked November 2026) lists $12, $28, $100. — [G2](https://www.g2.com/products/ltx/pricing); [Toolradar](https://toolradar.com/tools/ltx-studio/pricing)
- **Freepik → Magnific (April 2026):** Spaces became "Magnific Spaces," a node canvas tying image, video, audio, retouch, upscale and edit together. Tiers are billed in euros: €4.50, €10.50, €25.50, €161.25. — [OpenArt guide](https://openart.ai/blog/best-ai-generators/); [Freepik Spaces](https://freepik.com/spaces)
- **Figma Weave (formerly Weavy, acquired October 2025):** a node canvas positioned for previs: keyframe sequences, camera moves, rough composites and shot-by-shot breakdowns — [Figma previs](https://www.figma.com/solutions/previs-tool); [Krea node-apps list](https://www.krea.ai/blog/top-node-based-ai-workflow-apps).
- **Flora:** a collaborative node canvas over 50+ models. Its FAUNA assistant "can build workflows from a natural-language description," and its "Flows" templates include filmmaking. No pricing found. — [Chase Jarvis on Flora](https://chasejarvis.com/blog/flora-ai/)
- **Krea:** the pricing page is organized by image allowances (e.g. "Krea 2 Large | 5 images/day"); dollar amounts could not be extracted — [Krea pricing](https://www.krea.ai/pricing).
- **Other end-to-end products:**
  - invideo agents ("Agent One").
  - MinionArts' Vertex canvas with an AI Director agent.
  - Saga's idea-to-distribution app.
  - Paintbrush ($199/month plan mentioned).
  - StoReel Canvas.
  - Vigloo Studio (beta).
  - Sources: [invideo](https://invideo.io/blog/ai-micro-drama-script-to-episode/); [MinionArts](https://www.minionarts.com/blogs/how-to-make-ai-microdrama-2026-production-playbook); [TheWrap](https://www.yahoo.com/entertainment/tv/articles/ai-generated-microdramas-real-thriving-130000975.html); [Korea Times](https://www.koreatimes.co.kr/business/20260505/korean-short-drama-creator-navigates-chinas-shadow-in-global-market)

### Inferences
- **Typical solo stack, list prices per month:** Kling Pro $37 + Runway Pro $28 + Midjourney Standard $30 + Suno Pro $10 + ElevenLabs Starter $5 = **about $110/month**, before a Google AI plan for Veo/Flow and any lip-sync or upscaling tool. Each subscription is a separate credit pool that mostly does not roll over. This is the economic case aggregators such as Higgsfield, invideo and LTX Studio sell against.
- **Vellum's local ComfyUI path (LTX, MiniMax) is strategically sound.**
  - LTX-2.5 open weights are free under $10M revenue and run in ComfyUI.
  - Self-hosting makes the "8th attempt cost the same as the first," per LTX.
  - It is still one route among several: creators route per shot, and dialogue-heavy shots currently go to Seedance or Veo.
  - Note: H3's open-weights status is unverified, so Vellum's MiniMax path may be an API node rather than local weights.
- **Expect churn.** Sora 2 vanished within six months, Veo 3.1 Fast and Quality may leave Flow on 2026-12-05 (unverified), Freepik rebranded, and Runway changed tiers on 2026-06-01. Model names and prices should be data that the template reads, not hard-coded steps.

### Gaps
- Official Seedance/Dreamina price list not found; only third-party rates.
- No 2026 data was gathered on Flux, Descript, OpenArt pricing, Luma Ray pricing or Pika plans.
- Flora and Krea dollar pricing not found.
- ElevenLabs' full tier ladder was not confirmed from its pricing page.
- Midjourney's 2026 video and reference features (V8.x) were not verified.
- "Kling 4.0" appears only in LTX's guide.
- The claim that Veo Fast and Quality retire from Flow on 2026-12-05 comes from one third-party page.

---

## Q3. Typical cost and time to produce one minute of finished AI video, one micro-drama episode, and one short-form clip

### Takeaway
- **Generation compute** for one finished minute is now roughly **$20–60** on mid-tier hosted models once retries are counted. It can be under $10 on cheap or open models and over $100 on premium 4K-with-audio models.
- **All-in costs** are an order of magnitude higher: about **$315–750 per finished minute** for a short film (2–5 days, invideo) and **about $200–1,000 per 1–2-minute micro-drama episode** (vendor claims). Human time for writing, design, selection and editing now dominates.
- **Studio-scale AI micro-drama** reportedly costs about **$20–30K per hour of content**, against about $150K for live-action vertical. That works out to roughly $330–500 per finished minute.
- **Short-form clips:** vendors claim AI UGC-style ads cost **about $3–125 each**, against $150–600 for a human creator.

### Cited Findings

**One finished minute**
- **LTX (2026-11-15)** [Vendor, with transparent arithmetic] — [LTX](https://ltx.io/blog/ai-video-generation-cost):
  - Hosted APIs cost about $0.03–0.70 per generated second.
  - "A finished one-minute video costs roughly $20 to $60 at the generation layer, because each usable shot takes 3 to 10 attempts."
  - Worked examples for 12 shots × 4 s:
    - Entry tier, 8 attempts at $0.05/s: $19.20.
    - Mid tier, 5 attempts at $0.15/s: $36.00.
    - Premium tier, 3 attempts at $0.40/s: $57.60.
    - LTX-2.5 Fast 1080p, 3 attempts: $18.72.
  - Low iteration works out to about 144 s of generation per finished minute.
  - "Budget bottom-up from shots, seconds and attempts, then add 30%."
  - Its comparison: freelance production costs $1,000–5,000 per minute and takes 1–3 weeks; AI generation takes "hours to days."
- **Paintbrush (updated 2026-11-22)** [Vendor] — [Paintbrush](https://www.paintbrush.gg/blog/ai-video-cost-per-minute):
  - Scenario: 1 minute, 12 shots × 5 s, 3 characters, 2 settings, 6 dialogue shots.
  - Total about 915 credits, of which video is 655 (Seedance 2.5 at 10.92 credits/s). That is about $18–22, or about $12 on the $199/month plan.
  - It advises planning 1.5–2× for retakes, giving about $30–40.
- **8frame:** about $2.48 in credits for 60 s on Veo 3.1 Lite (silent), up to $33.60; "roughly $7 to $100 delivered after retries" [Snippet/Vendor] — [8frame](https://www.8frame.co/blog/how-much-does-a-one-minute-ai-video-cost).
- **Kenerate:** a minute on Wan 3.0 at 480p is about 900 credits ($9); on Veo 3.1 with sound, about 7,200 credits ($72) [Snippet/Vendor] — [Kenerate](https://kenerateai.com/blogs/how-much-does-an-ai-video-generator-cost).
- **Cliptude (survey of 36 tools):** list rates run from under $3 to $24 per generated minute; real cost per finished minute is 2–3× higher after retries [Snippet] — [Cliptude](https://cliptude.com/research/ai-video-price-per-minute-2026/).
- **invideo short film:** "2 to 5 days of production at $315–$750 per finished minute, based on documented productions" [Vendor] — [invideo](https://invideo.io/blog/how-to-make-ai-short-film/).
- **A "48-hour solo director" guide:** a 3–5-minute narrative short in one weekend for under €90 of cloud GPU compute [Vendor-style claim] — [dxbuilder](https://dxbuilder.io/blog/how-to-create-ai-short-film-48-hours-guide-2026-150926).
- **Older reference point (June 2025, Veo 3):** the Kalshi ad cost under $2,000 in generation and took one person 2–3 days. It needed about 300–400 generations for 15 usable clips (about 20–27 attempts per usable clip) — [NPR](https://www.npr.org/2025/06/23/nx-s1-5432712/ai-video-ad-kalshi-advertising-nba-finals).

**One micro-drama episode, and seasons**
- **invideo:** about $1,000 per episode for 1.5–2-minute episodes. A documented 3-person crew made a 10-episode series in 3 days, i.e. under a day per episode [Vendor] — [invideo](https://invideo.io/blog/ai-micro-drama-script-to-episode/).
- **MinionArts** [Vendor] — [MinionArts](https://www.minionarts.com/blogs/how-to-make-ai-microdrama-2026-production-playbook):
  - Live action costs "$2,000 to $3,000 per finished minute," and AI is "roughly one tenth." That implies about $200–300 per finished minute, or about $200–600 per 60–120-second episode.
  - A full 60-episode season takes "four to six weeks" for a 2–3-person team.
  - A pilot takes "one to two days" once characters are locked.
- **Dashverse, per TheWrap (2026-06-11)** [Press, company figures] — [TheWrap via Yahoo](https://www.yahoo.com/entertainment/tv/articles/ai-generated-microdramas-real-thriving-130000975.html):
  - About $20,000–30,000 per hour of content, against $150,000 for a live-action vertical series. It aims for $10,000 per hour by year-end.
  - Scripting takes 10 days to a month; production takes about a month.
  - Output: 100 series in June 2026, with a target of 1,000 a month.
  - The DashReels app reports 10M MAU, 1M DAU and 68% retention on AI content.
  - Holywater said a Formula One micro-series would have cost over $500,000 to shoot traditionally. CandyJar expects a 99% cut in production cost.
- **Vigloo, *Bloodbound Luna*:** 22 episodes, fewer than 10 people, 8 weeks; company claims 1/3 of the time and 1/6 of the cost [Vendor/Press] — [BusinessWire, 2026-03-10](https://www.businesswire.com/news/home/20260310243745/en); [Korea Times](https://www.koreatimes.co.kr/business/20260505/korean-short-drama-creator-navigates-chinas-shadow-in-global-market).
- **Judian Short Dramas (China):** 100,000–150,000 yuan per drama, about a third of traditional cost [Snippet] — [Vitrina](https://vitrina.ai/blog/ai-generated-short-drama-production-companies/).

**One short-form social clip (UGC-style ads, faceless shorts)**
- **Per-ad cost claims** [Vendor; Snippet] — [invideo AI UGC ad cost](https://invideo.io/blog/ai-ugc-ad-cost/); [invideo UGC vs creators](https://invideo.io/blog/ai-ugc-ads-vs-hiring-creators/):
  - About $75 per ad, faceless or full-character, and about $125 per ad on average once rejected generations are counted.
  - Other vendors claim $3–25 per video at scale, or $0.50–1.70 per video. These mostly exclude discarded output.
  - Human UGC creators cost about $150–300 per short video, plus usage rights, with 5–14-day turnaround. Other vendors put the range at $300–600.
- **Spec and workflow tips:** Reels are 1080×1920 (9:16), typically 6–30 s. Generate a still of each shot first, fix framing cheaply, then spend video credits on the locked frame [Vendor] — [Higgsfield UGC guide](https://higgsfield.ai/blog/how-to-make-ai-ugc-videos); [invideo UGC ads](https://invideo.io/blog/ai-ugc-ads/).

### Inferences
- **A solo creator's generation compute, using LTX's mid-tier assumptions:**
  - A 30 s short-form clip: 30 s × 5 attempts × $0.15 ≈ **$22**.
  - A 90 s micro-drama episode (about 12–15 shots): roughly **$50–85**.
  - A 5-minute short film: about **$100–300**.
  - Voice and music add only a few dollars at subscription rates.
  - Time, not compute, is the binding constraint: vendor "days per episode" figures assume a locked bible and practiced crew.
- **Cost per finished minute depends on attempts per usable shot more than on the per-second price,** so anything that cuts retries cuts cost. That includes better references, approving storyboards before video, regenerating only part of a clip, and multi-shot generation. A decision map that records which choices produced keepers attacks the biggest cost line directly.
- **Studio figures and solo-creator figures are not comparable.** Dashverse ($333–500/min) and invideo ($1,000/episode) include salaries; LTX and Paintbrush ($20–60/min) are compute only.

### Gaps
- No independent, audited per-episode cost breakdown exists. Every micro-drama figure is company-reported or from a vendor.
- No reliable data was found on hours of human labor per finished minute for solo creators.
- No data was found on how AI micro-dramas actually earn per episode or season for independent creators, as opposed to platforms.

---

## Q4. What are the biggest pain points, ranked by how often creators raise them?

### Takeaway
No 2026 survey ranks these. The ranking below counts how often each pain point appeared across the ~40 sources reviewed here. They are mostly vendor guides, practitioner interviews and trade press, so the ranking is indicative only.

1. **Character and style consistency (drift)** is raised most often, and is called the top reason AI narrative "looks amateur".
2. **Credit and cost burn from iteration and failed generations** is next.
3. **Story and writing quality** is increasingly named as the real bottleneck.
4. **Dialogue/lip-sync seams.**
5. **Tool sprawl, handoffs and manual assembly.**
6. **Clip length and continuity between clips.**
7. **Rights and licensing:** IP, likeness and music.
8. **Platform labelling, monetization and audience saturation.**
9. **Provenance** (which prompt, seed or model version made which shot), which is raised rarely but explicitly, and made worse by silent model updates and deprecations.

### Cited Findings

**1. Consistency (most frequent)**
- "Character drift is the number one reason AI microdramas look amateur. This is where AI microdrama production becomes an infrastructure problem." [Vendor] — [MinionArts](https://www.minionarts.com/blogs/how-to-make-ai-microdrama-2026-production-playbook)
- "Maintaining a consistent character across 50+ shots (the minimum for a short film) requires manual intervention on nearly every generation." [Opinion/Vendor] — [Craze AI](https://www.craze.ai/blog/ai-filmmaking-in-2026)
- A 2025 study, *Generative AI for Film Creation*, rated "consistent character body movement" the top priority for AI filmmakers (6.62/7 importance), while tools delivered only 4.45/7. [Snippet; 2025 data; secondary citation via bMovies, not verified on the page] — [bMovies research](https://www.bmovies.app/research)
- Saga's 40 interviews list consistency alongside lip-sync, physics, camera movement, prompt adherence and resolution as known problems [Opinion] — [Saga](https://www.createsagas.com/post/state-of-ai-filmmaking-2026-what-40-ai-film-leaders-told-us-may-surprise-you).
- AI "struggles with consistent shots in feature films but suits short mobile clips" [Press] — [TheWrap](https://www.yahoo.com/entertainment/tv/articles/ai-generated-microdramas-real-thriving-130000975.html).
- Genre.ai: consistent locations and performances were hard early on and caused a restaurant spot to fail. Changing a character after lock means "regenerating every scene that uses it" [Practitioner] — [Wrapbook](https://www.wrapbook.com/on-production-podcast/the-real-economics-of-ai-native-production-featuring-pj-accetturo).
- "If a model redraws a character on every prompt, matching a face across shots burns budget fast" [Vendor] — [LTX](https://ltx.io/blog/ai-video-generation-cost).
- **Vendor answers to drift:**
  - Kling Elements, with a quota of 30–500 by plan, and Omni references — [Kling](https://kling.ai/blog/kling-video-3-0-credit-cost-guide).
  - Veo "Ingredients" — [invideo FAQ](https://invideo.io/faq/google-flow-vs-runway-vs-kling-which-is-best-for-ai/).
  - Runway Gen-4 References (same FAQ).
  - LTX multi-shot generation — [LTX](https://ltx.io/blog/ai-video-generation-cost).
  - Seedance reference-to-video — [invideo](https://invideo.io/blog/ai-micro-drama-script-to-episode/).

**2. Credits and cost burn**
- "Each usable shot takes 3 to 10 attempts. Iteration rate drives cost more than the per-second price." [Vendor] — [LTX](https://ltx.io/blog/ai-video-generation-cost)
- Higgsfield estimates 3–10 attempts per usable clip [Vendor] — [Higgsfield, why credits run out](https://higgsfield.ai/blog/why-ai-video-credits-run-out). A DEV post assumes 3–5 [Opinion] — [DEV Community](https://dev.to/smophyai/the-real-cost-of-ai-video-in-2026-why-credit-systems-cost-more-than-the-sticker-price-j6h).
- In 2025, Accetturo needed 300–400 generations for 15 usable clips — [NPR](https://www.npr.org/2025/06/23/nx-s1-5432712/ai-video-ad-kalshi-advertising-nba-finals).
- **Complaints from review analyses** [Snippet; vendor-compiled, page attribution not confirmed] — [AIVeed, failed videos](https://aiveed.io/blog/failed-ai-videos-cost-money-refund-platform); [8frame credits explained](https://www.8frame.co/blog/ai-video-credits-explained):
  - "close to half of the low-star Runway reviews… describe credits spent on failed, blocked or wrong generations."
  - A Google One forum user said over 20% of their credits went to failed generations.
  - Pika reviewers say credits were deducted when no video arrived.
  - Runway and Higgsfield refund errored generations automatically, but disliked outputs are not refunded.
- **Expiring credits:**
  - Flow: monthly and daily credits do not roll over [Official] — [Google Flow help](https://support.google.com/flow/answer/16526234?hl=en).
  - Runway: Standard and Pro forfeit unused credits at the billing date [Snippet] — [eesel](https://eesel.ai/blog/runway-ai-pricing).
  - Kling: a Google Play reviewer wrote "You have to now purchase Credits to use AI, and Subscription to use Credits" [Snippet] — [DEV Community](https://dev.to/smophyai/the-real-cost-of-ai-video-in-2026-why-credit-systems-cost-more-than-the-sticker-price-j6h).

**3. Story and writing as the bottleneck**
- "Story is becoming the main bottleneck." Aashay Singh says weak AI films are recognizable from the writing alone. Jiajian Min says AI work that once drew about 100,000 views might struggle to reach 1,000 today. [Opinion/Practitioner] — [Saga](https://www.createsagas.com/post/state-of-ai-filmmaking-2026-what-40-ai-film-leaders-told-us-may-surprise-you)
- Generating before the season structure is locked is "the single most expensive mistake" [Vendor] — [MinionArts](https://www.minionarts.com/blogs/how-to-make-ai-microdrama-2026-production-playbook).
- YouTube treats "mass-produced videos with little variation and no narrative arc" as non-monetizable [Press] — [TechCrunch, 2026-07-20](https://techcrunch.com/2026/07/20/youtube-clarifies-policies-around-ai-slop-and-upsetting-videos/).
- Genre.ai says comedy writing and photorealistic faces remain weak spots, and synthetic performance can lose spontaneity [Practitioner] — [Wrapbook](https://www.wrapbook.com/on-production-podcast/the-real-economics-of-ai-native-production-featuring-pj-accetturo).

**4. Lip-sync and dialogue seams**
- "Dialogue seams" is a named pain point; the fix is native lip-sync models plus one locked voice ID per character [Vendor] — [MinionArts](https://www.minionarts.com/blogs/how-to-make-ai-microdrama-2026-production-playbook).
- Lip-sync is on the list of known problems in Saga's interviews [Opinion] — [Saga](https://www.createsagas.com/post/state-of-ai-filmmaking-2026-what-40-ai-film-leaders-told-us-may-surprise-you).
- Most lip-sync tools need a source video [Vendor] — [VEED](https://www.veed.io/learn/best-ai-lip-sync-tools).

**5. Tool sprawl, handoffs, manual assembly**
- "Tool switching. Generating in one tool, adding audio in another and editing in a third adds time and version-management work." [Vendor] — [LTX](https://ltx.io/blog/ai-video-generation-cost)
- Manual timeline assembly "collapses by episode twenty" [Vendor] — [MinionArts](https://www.minionarts.com/blogs/how-to-make-ai-microdrama-2026-production-playbook).
- Separate subscriptions "create separate pools of capacity that cannot cover for each other" [Opinion] — [DEV Community](https://dev.to/smophyai/the-real-cost-of-ai-video-in-2026-why-credit-systems-cost-more-than-the-sticker-price-j6h).
- "The model matters less than a connected workflow" [Opinion] — [Saga](https://www.createsagas.com/post/state-of-ai-filmmaking-2026-what-40-ai-film-leaders-told-us-may-surprise-you).

**6. Clip length and continuity**
- Per-generation limits: Veo 3.1 in Flow 4/6/8 s; Omni Flash up to 15 s — [Google Flow help](https://support.google.com/flow/answer/16526234?hl=en). Kling 3.0 3–15 s — [Kling](https://kling.ai/blog/kling-video-3-0-credit-cost-guide). MiniMax H3 up to 15 s — [UsagePricing](https://www.usagepricing.com/blueprint/activity/minimax-2026-07-30-h3-video-per-second). Runway Gen-4.5 5 or 10 s — [eesel](https://eesel.ai/blog/runway-ai-pricing).
- Workarounds:
  - "Use extend rather than regenerating a clip that runs short, to preserve continuity" — [invideo](https://invideo.io/blog/ai-micro-drama-script-to-episode/).
  - Multi-shot generation keeps "character, setting and lighting consistent across the cut" — [LTX](https://ltx.io/blog/ai-video-generation-cost); [Kling](https://kling.ai/blog/kling-video-3-0-credit-cost-guide).

**7. Rights and licensing**
- Disney sent ByteDance a cease-and-desist on 2026-02-13 over Seedance 2.0, citing Spider-Man, Darth Vader and Grogu examples. Paramount Skydance also sent one. ByteDance pledged stronger safeguards. [Press] — [Axios](https://www.axios.com/2026/02/13/disney-bytedance-seedance); [TechCrunch, 2026-02-15](https://techcrunch.com/2026/02/15/hollywood-isnt-happy-about-the-new-seedance-2-0-video-generator/)
- CapCut's US Seedance rollout restricted real-face inputs [Press] — [No Film School](https://nofilmschool.com/capcut-dreamina-seedance-2-0).
- The US Copyright Office's January 2025 Part 2 report (the main guidance; no newer 2026 guidance found) says purely AI-generated material is not protected. Human authorship, including "meaningful selection and arrangement" of AI outputs, can be. There is no bright-line test. [Official, 2025] — [Copyright Office blog](https://blogs.loc.gov/copyright/2025/02/inside-the-copyright-offices-report-copyright-and-artificial-intelligence-part-2-copyrightability/)
- Music: Suno retains authorship, and its commercial license covers only songs made while subscribed. Udio downloads were locked after the UMG deal. — [Music in Africa](https://www.musicinafrica.net/magazine/suno-adjusts-ai-music-ownership-terms-after-warner-music-partnership); [Digital Music News](https://www.digitalmusicnews.com/2025/10/31/udio-downloads-disabled-umg-deal/)
- Likeness: Shortical "will not license an actor's likeness without permission and creative collaboration" [Press] — [TheWrap](https://www.yahoo.com/entertainment/tv/articles/ai-generated-microdramas-real-thriving-130000975.html). Actor rights and consent are flagged as a control point [Opinion] — [Verticalhaus, 2026-06-18](https://verticalhaus.ai/blog/micro-dramas-ai-production-june-18-2026).
- MiniMax H3 launched under a "copyright lawsuit" cloud [Press headline] — [TechTimes](https://www.techtimes.com/articles/322521/20260731/minimax-h3-opens-ai-video-developers-copyright-lawsuit-clouds-every-clip.htm).

**8. Platform labelling, monetization, saturation**
- **YouTube (clarification rolled out 2026-07-16, applies to all YPP channels)** [Press] — [TechCrunch](https://techcrunch.com/2026/07/20/youtube-clarifies-policies-around-ai-slop-and-upsetting-videos/); [Tubefilter, 2026-07-13](https://www.tubefilter.com/2026/07/13/youtube-inauthentic-content-monetization-policy-update/):
  - Three types of content are non-monetizable:
    1. Generic, repetitive or template-based content.
    2. Off-putting or distressing content.
    3. AI personas discussing sensitive topics.
  - AI use alone does not disqualify a channel. Reviewers judge the channel as a whole.
  - Some creators report original content being flagged.
- **TikTok** [Official] — [TikTok AIGC help](https://support.tiktok.com/en/using-tiktok/creating-videos/ai-generated-content); [TikTok transparency](https://www.tiktok.com/transparency/en/supporting-responsible-transparent-ai-generated-content/):
  - Creators must label AI-generated content that shows realistic images, audio or video.
  - Auto-labels are applied for TikTok AI effects and for uploads carrying C2PA Content Credentials, and creators cannot remove them.
  - TikTok says 3B+ videos have been labelled.
- **EU AI Act Article 50 (in force 2026-08-02)** [Legal analysis] — [Orrick](https://www.orrick.com/en/Insights/2026/08/EU-AI-Act-Transparency-Obligations-for-AI-Generated-Content-Article-50); [DLA Piper, 2026-08-10](https://www.dlapiper.com/en-ae/insights/publications/2026/08/the-eus-new-guidelines-on-ai-transparency); [Anadolu](https://aa.com.tr/en/europe/eu-rules-requiring-labels-on-ai-generated-content-take-effect/4017004):
  - Deployers must label deepfakes; providers must mark outputs in machine-readable form.
  - No retroactive labelling is required for content published before that date.
  - The Commission has endorsed no single technique, and a multi-layer approach (metadata plus watermark) is expected.
  - A standardized EU label was still being developed as of the May 2026 guidance.
  - Possible transitional relief for providers under the "AI Omnibus" is unresolved.
- **Saturation:** "AI slop" fatigue; the view-count collapse from 100K to 1K (Jiajian Min) [Opinion] — [Saga](https://www.createsagas.com/post/state-of-ai-filmmaking-2026-what-40-ai-film-leaders-told-us-may-surprise-you). ReelShort's anti-AI stance limits one major distribution outlet [Snippet] — [Yahoo/Variety](https://www.yahoo.com/entertainment/tv/articles/vertical-micro-dramas-8-billion-130000807.html).

**9. Provenance and reproducibility (rarely raised, but concrete)**
- The recommendation is to log "prompt, model + version, settings, seed for each output you want to keep… in a spreadsheet row or a note in your asset manager." The same source warns that "a silent model update quietly breaks old seeds," and says to save the rendered video file because "motion drifts even when the seed matches." [Vendor] — [Versely](https://www.versely.studio/blog/ai-video-seeds-and-reproducibility)
- Model deprecations break replayability. Sora app and API are gone. Veo Fast and Quality may leave Flow on 2026-12-05 (unverified). Exported data from the Sora app was deleted after the deadline. — [invideo](https://invideo.io/blog/sora-ai-video-generator/); [WaveSpeed](https://wavespeed.ai/blog/cost-and-billing/google-flow-pricing-2026/)
- "Version-management work" is named as a hidden cost of tool switching — [LTX](https://ltx.io/blog/ai-video-generation-cost).

### Inferences
- **The ranking is weighted toward vendor and practitioner sources.** Consistency and cost dominate because every vendor positions against them. Story quality is rising fastest in practitioner discourse, and it is the pain point closest to Vellum's Strategist and Critic roles.
- **Provenance is under-discussed rather than unimportant.** Creators live with it through spreadsheets and folder names. Model churn (Sora, Veo tiers) makes stored outputs plus full parameter records the only reliable "version history."
- **Labelling is becoming a pipeline step rather than an afterthought.** The final publish stage needs a disclosure and provenance (C2PA) checklist per platform and region.

### Gaps
- No quantitative 2026 survey of AI filmmakers' or creators' pain points was found.
- Reddit and X frequency counts could not be gathered with the available search tool.
- The 2025 survey figures (6.62 vs 4.45) could not be verified on the cited page.
- TikTok Creator Rewards and Meta rules on AI content monetization were not found.
- YouTube's specific 2026 rules for disclosing realistic altered or synthetic content were not covered in the sources read.

---

## Q5. How do creators manage iteration and versions (multiple takes, picking the best, regenerating), and what do they wish existed?

### Takeaway
Creators work in a generate-many, select-few loop: typically 3–10 attempts per usable shot (3–4 options per shot in micro-drama pipelines; 20+ in 2025-era ad work). They spend cheap image credits before expensive video credits, by approving storyboards and stills first. They lock references centrally so that changes propagate, and they choose extend or partial regeneration over full rerolls.

Version tracking is mostly manual: spreadsheets, notes, folders, and saving rendered files because seeds are not reliable. The explicit "wishes" in sources are for:
- a connected, reusable pipeline instead of tool-hopping;
- locked context that persists across episodes;
- partial regeneration;
- fewer attempts per shot;
- structured story development before generation.

### Cited Findings

**Take counts and selection**
- Generate 3–4 options per shot, "generate in batches and select in the edit," and avoid fine creative iteration mid-run [Vendor] — [invideo](https://invideo.io/blog/ai-micro-drama-script-to-episode/).
- 3–10 attempts per usable shot [Vendor] — [LTX](https://ltx.io/blog/ai-video-generation-cost); [Higgsfield](https://higgsfield.ai/blog/why-ai-video-credits-run-out). Budget 1.5–2× for retakes [Vendor] — [Paintbrush](https://www.paintbrush.gg/blog/ai-video-cost-per-minute).
- 300–400 generations for 15 usable clips (2025) — [NPR](https://www.npr.org/2025/06/23/nx-s1-5432712/ai-video-ad-kalshi-advertising-nba-finals).
- Blind ranking by a second model: Jimmy Woolley mixes human and machine alternatives, then has another model rank them blind [Practitioner] — [Saga](https://www.createsagas.com/post/state-of-ai-filmmaking-2026-what-40-ai-film-leaders-told-us-may-surprise-you).
- Agents pitch "50 different locations" or characters and the human team picks. Brands get "six different endings, six different intros" and localized versions [Practitioner] — [Wrapbook](https://www.wrapbook.com/on-production-podcast/the-real-economics-of-ai-native-production-featuring-pj-accetturo).
- Usable-footage rates above 90% when prompts follow a strict structure [Vendor, citing Chinese industry reporting; unverified] — [MinionArts](https://www.minionarts.com/blogs/how-to-make-ai-microdrama-2026-production-playbook).

**Gating spend: stills before video**
- "Approve storyboards before spending video credits" [Vendor] — [invideo](https://invideo.io/blog/ai-micro-drama-script-to-episode/).
- Generate still images of each shot first, adjust framing cheaply, then spend video credits on the locked frame [Vendor] — [invideo UGC](https://invideo.io/blog/ai-ugc-ads/).
- Lock the season beat sheet before any footage [Vendor] — [MinionArts](https://www.minionarts.com/blogs/how-to-make-ai-microdrama-2026-production-playbook).

**Locked context and propagation**
- Lock final character and location sheets as shared context assets; later changes start from these locked images. Mid-series changes (a scar, a haircut) are "updated once in central context and inherited by later episodes." "Agent notebooks persist context across sessions." [Vendor] — [invideo](https://invideo.io/blog/ai-micro-drama-script-to-episode/)
- The flip side: after a character is locked, a client change means regenerating every scene that uses it. Clients get "two general revisions," and scope creep ("you guys approved it") is a pain point [Practitioner] — [Wrapbook](https://www.wrapbook.com/on-production-podcast/the-real-economics-of-ai-native-production-featuring-pj-accetturo).

**Partial regeneration instead of full rerolls**
- "Use extend rather than regenerating a clip that runs short" — [invideo](https://invideo.io/blog/ai-micro-drama-script-to-episode/).
- LTX-2.5 "Retake" regenerates "one section of a clip without touching the rest" — [LTX](https://ltx.io/blog/ai-video-generation-cost).
- Runway Aleph and Google Omni Flash offer video editing of existing clips (Omni Flash edit: 40 credits) — [Google Flow help](https://support.google.com/flow/answer/16526234?hl=en).

**Version and provenance tracking practice**
- Log prompt, model and version, settings and seed per kept output in a spreadsheet or asset-manager note. Save the rendered file because seeds drift and model updates break them [Vendor] — [Versely](https://www.versely.studio/blog/ai-video-seeds-and-reproducibility).
- Node canvases (Flora, Figma Weave, Magnific Spaces) keep generations as connected nodes. Figma pitches Weave for "shot-by-shot breakdowns" in previs. No dedicated shot-tracking or shot-list features were found for Flora or Magnific Spaces. [Official/Snippet] — [Figma previs](https://www.figma.com/solutions/previs-tool); [Chase Jarvis on Flora](https://chasejarvis.com/blog/flora-ai/); [Freepik Spaces](https://www.freepik.com/blog/introducing-spaces)

**What creators and studios say they want (explicit or strongly implied)**
- "The model matters less than a connected workflow"; structured writing workflows that "force creators to address character, structure, and conflict early" (Aashay Singh) [Opinion/Practitioner] — [Saga](https://www.createsagas.com/post/state-of-ai-filmmaking-2026-what-40-ai-film-leaders-told-us-may-surprise-you).
- The whole chain living as one reusable pipeline, since manual timelines "collapse by episode twenty" [Vendor] — [MinionArts](https://www.minionarts.com/blogs/how-to-make-ai-microdrama-2026-production-playbook).
- Fewer handoffs (audio generated in the same pass) and fewer attempts per shot; "the larger saving is fewer attempts per shot" [Vendor] — [LTX](https://ltx.io/blog/ai-video-generation-cost).
- Rerunning on the next script "with no context rebuilding" [Vendor] — [invideo](https://invideo.io/blog/ai-micro-drama-script-to-episode/).
- Better consistent body movement, the largest importance-versus-capability gap in the 2025 survey [Snippet, 2025] — [bMovies](https://www.bmovies.app/research).

### Inferences (relevant to the Vellum template)
- **Take-level provenance should be automatic.** For every generated take, capture prompt, negative prompt, seed, model and exact version, reference images used, settings, cost in credits or dollars, timestamp, and the rendered file. Keep rejected takes, with an optional one-line reason from the Critic. This replaces the spreadsheet practice above and survives model deprecation.
- **Three decision gates matter, and branching back must be cheap at each:** story structure lock, reference/bible lock, and storyboard-still approval before video spend. Each gate is a natural Vellum checkpoint.
- **Locked-asset propagation with impact preview.** Changing a locked character should list every shot or take that depends on it, with estimated regeneration cost. This is the exact pain Genre.ai describes.
- **Partial regeneration and extend should be first-class actions,** distinct from "new take," so the trail shows what was fixed and what was rerolled.
- **Per-branch cost meter and attempts-per-keeper metric.** These address the #2 pain point, and over time feed the Strategist's model-routing suggestions (which model landed this shot type in the fewest attempts).
- **Close the outer loop with ingested audience signals:** retention curve and drop-off second, episode-to-episode continuation, paywall conversion for micro-drama, hook performance for short-form. Link them back to the decision nodes that produced the episode, mirroring Holywater's use of AI series to test storylines.
- **Publish-stage compliance checklist per platform and region:**
  - YouTube inauthentic-content risk (avoid templated repetition; keep a narrative arc).
  - The TikTok realistic-AI label.
  - EU Article 50 deepfake disclosure.
  - Keeping C2PA metadata (it triggers TikTok's auto-label).
  - Music license status (Suno subscription active at generation time).

### Gaps
- No survey or dataset quantifies how creators track versions, or how many takes they keep or discard per shot by format. The figures above are vendor rules of thumb plus one 2025 practitioner datapoint.
- Few sources state creators' wishes in their own words. Most "wishes" are inferred from vendor positioning and practitioner complaints.
- No evidence was found on whether creators use node canvases (Flora, Weave, Spaces) for full narrative productions rather than previs or single assets.
