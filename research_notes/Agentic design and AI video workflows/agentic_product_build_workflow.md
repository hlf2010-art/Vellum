# How solo founders and small teams take an agentic AI product from idea to a shipped, testable prototype (state as of 2026-11-26)

Research notes compiled 2026-11-26. Every claim carries the date of its source. Labels: **[verified data]** = survey/measured/primary disclosure; **[vendor claim]** = company or vendor-affiliated statement; **[opinion]** = practitioner or analyst view; **[secondary/unverified]** = blog or aggregator figure I could not trace to a primary source.

---

## Q1. What stages do practitioners actually go through, and which published frameworks/playbooks describe them?

### Takeaway
No single canonical "idea to shipped agent" playbook exists; practitioners stitch together (a) lean-startup validation (problem framing, Wizard-of-Oz/concierge, pre-sales), (b) vendor agent-engineering guides (Anthropic Dec 2024 and Sep 2025 to Jan 2026, OpenAI Apr 2025) that all say "start with the simplest thing, one agent, few tools, add autonomy only when measured to help", and (c) an eval discipline (Husain/Shankar "error discovery", Anthropic agent evals, Jan to Oct 2026). The consistent stage order is: frame the problem, pick the lowest workable autonomy level, design a small tool set, write context/prompts, prototype, run evals from real traces, test with real users, then widen scope.

### Cited Findings
**Anthropic "Building effective agents" (published 2024-12-19; page now notes tooling has changed and points to newer Managed Agents docs)** [opinion from a model vendor; widely treated as the reference text]
- Distinguishes *workflows* ("LLMs and tools are orchestrated through predefined code paths") from *agents* (LLMs direct their own processes and tool use). — [Anthropic](https://www.anthropic.com/engineering/building-effective-agents)
- Advice: find the simplest solution and "add multi-step agentic systems only when simpler solutions fall short"; often a single optimized LLM call with retrieval and examples is enough; agentic systems trade latency and cost for performance. — [Anthropic](https://www.anthropic.com/engineering/building-effective-agents)
- Five composable patterns: prompt chaining, routing, parallelization (sectioning/voting), orchestrator-workers, evaluator-optimizer; agents are "typically just LLMs using tools based on environmental feedback in a loop", need stopping conditions (max iterations), and bring "higher costs, and the potential for compounding errors"; recommends "extensive testing in sandboxed environments, along with the appropriate guardrails". — [Anthropic](https://www.anthropic.com/engineering/building-effective-agents)
- Three core principles: keep the design simple; prioritize transparency by showing the agent's planning steps; craft the agent-computer interface (ACI) through careful tool documentation and testing (e.g., "poka-yoke" tools; switching to absolute file paths removed a class of SWE-bench errors). — [Anthropic](https://www.anthropic.com/engineering/building-effective-agents)
- On frameworks: start with LLM APIs directly; frameworks add abstraction that obscures prompts/responses; "If you do use a framework, ensure you understand the underlying code." The page lists Claude Agent SDK, Strands Agents SDK, Rivet and **Vellum** as example frameworks. — [Anthropic](https://www.anthropic.com/engineering/building-effective-agents)

**Anthropic follow-ups (2025-09-11, 2025-09-29, 2026-01-09)**
- "Writing effective tools for agents — with agents" (2025-09-11): prototype tools, run evaluations, then feed eval transcripts to Claude Code to improve tool descriptions; principles include choosing which tools to build, namespacing, returning meaningful context, token efficiency, and prompt-engineering tool descriptions. — [Anthropic Engineering](https://anthropic.com/engineering/writing-tools-for-agents)
- "Effective context engineering for AI agents" (2025-09-29): context engineering as successor to prompt engineering; goal is "the smallest possible set of high-signal tokens"; curating a minimal viable tool set improves reliability over long interactions. — [Anthropic Engineering](https://anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- "Demystifying evals for AI agents" (dated 2026-01-09 by third parties): an eval = input + grading logic; without evals teams get "stuck in reactive loops—catching issues only in production, where fixing one failure creates others"; Claude Code's own evals started narrow (concision, file edits) then broadened (over-engineering). — [Anthropic Engineering](https://anthropic.com/engineering/demystifying-evals-for-ai-agents). Secondary readers report it recommends grading outcomes not paths, reading transcripts to validate graders, and optimizing pass^k for production readiness [secondary/unverified] — [Shkurti](https://idlirshkurti.github.io/tutorials/agent_evals.html)

**OpenAI "A practical guide to building agents" (2025, April; PDF)** [vendor guidance; details below come from secondary summaries]
- Start small, validate with real users, grow capabilities over time; start with a single agent and move to multi-agent only when needed; layered guardrails (deterministic blocklists/regex, output validation, tool risk ratings, relevance/safety classifiers); human intervention is critical early to find failures and edge cases and to build an eval cycle; set failure/action thresholds that escalate to a human. — [OpenAI PDF](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf); summary via [Maginative](https://www.maginative.com/article/how-to-build-ai-agents-a-detailed-practical-guide-from-openai/)

**Autonomy-level scoping framework (academic, 2025-06, rev. 2025-07)**
- Feng, McDonald, Zhang (Univ. of Washington), "Levels of Autonomy for AI Agents": L1 Operator (user decides, agent acts), L2 Collaborator (joint plan/execute), L3 Consultant (agent leads, consults user), L4 Approver (agent involves user only for risky/pre-specified cases), L5 Observer (full autonomy, user monitors logs and has an off switch). — [arXiv 2506.12469](https://arxiv.org/abs/2506.12469); [Knight First Amendment Institute](https://knightcolumbia.org/research/levels-of-autonomy-for-ai-agents)
- A 2026 risk-tiering paper (TrustX ARC) adopts this scale and states higher autonomy demands correspondingly stricter governance. — [arXiv 2607.09586](https://arxiv.org/pdf/2607.09586)

**Eval / error-analysis playbook (practitioner, 2025 to 2026)**
- Hamel Husain and Shreya Shankar: three phases, (1) discover what to measure via error analysis on real traces (open coding, random then targeted sampling), (2) build a reliable eval suite, (3) operationalize into an improvement flywheel; in a NurtureBoss (AI leasing assistant) case the top errors were conversation flow, human handoff and rescheduling. — [Lenny's Newsletter, "Building eval systems that improve"](https://www.lennysnewsletter.com/p/building-eval-systems-that-improve)
- 2026-09 Lenny's post renames the step "error discovery": "maintaining evals costs time and money; it doesn't make sense to measure everything." — [Lenny's Newsletter](https://lennysnewsletter.com/p/advanced-evals-how-to-find-and-fix)
- O'Reilly book *Evals for AI Engineers* (Husain and Shankar, dated 2026-10) covers reading traces, categorizing failures, building a failure taxonomy. — [O'Reilly](https://www.oreilly.com/library/view/-/9798341660717/ch03.html)
- Code-based evals for deterministic failures, LLM-as-judge for subjective cases; binary pass/fail beats arbitrary scores. — [Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/evals) [opinion]

**Validation stage (pre-build) frameworks**
- NN/g: Wizard-of-Oz prototypes (humans fake the hard part) reduce risk of costly technologies like generative AI by getting an early read on desirability, utility and usability. — [NN/g](https://www.nngroup.com/articles/wizard-of-oz/)
- Pre-sales/paid tests are stronger demand signals than sign-ups. — [Typeform](https://www.typeform.com/blog/market-validation-how-to-test-demand-before-you-build) [opinion]

**Spec stage (emerging 2025 to 2026): spec-driven development**
- GitHub Spec Kit (open source; launched 2025) adds a structured spec, plan, tasks, implement flow and a project "constitution" to Copilot, Claude Code, Gemini CLI. — [GitHub Blog](https://github.blog/ai-and-ml/github-copilot/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/); Thoughtworks Radar notes teams experimenting with it, mostly brownfield — [Thoughtworks](https://www.thoughtworks.com/radar/languages-and-frameworks/github-spec-kit)
- AWS Kiro: spec-native IDE with "vibe" mode and "spec" mode (requirements, design, tasks, implementation) plus hooks. Star counts for Spec Kit reported at ~104k to 115k (mid-2026) [secondary/unverified]. — [DEV](https://dev.to/rosgluk/github-spec-kit-vs-kiro-vs-claude-code-sdd-workflows-1fi1); [InfoWorld](https://infoworld.com/article/4171332/four-cutting-edge-tools-for-spec-driven-development.html)

**YC signal**
- YC Fall 2026 Requests for Startups (13 requests) frames future software as increasingly built for AI agents working alongside humans. — [IBTimes SG](https://www.ibtimes.sg/A000Ncu) (secondary; I did not reach ycombinator.com/rfs text directly); RFS index: [YC](https://ycombinator.com/rfs)
- YC Spring 2026 RFS included ideas such as AI product-management tools and AI-agent-run hedge funds. — [Inc.](https://www.inc.com/ben-sherry/y-combinator-just-released-its-latest-startup-wishlist-heres-every-idea-it-has-for-founders/91297137)

### Inferences
- A defensible 0-to-1 stage model for an agent product, reconciling the sources: (1) problem framing and evidence gathering; (2) direction choice incl. explicit autonomy level (Feng L1 to L5) and "workflow vs agent" decision (Anthropic); (3) cheapest proof selection (WoZ/concierge, landing page plus pre-sale, clickable prototype, or a thin working agent); (4) tool/ACI and context design (small, namespaced tool set); (5) build with a vibe-coding builder or coding agent; (6) error discovery on real traces and a small binary eval set; (7) put in front of real users with human-in-the-loop guardrails; (8) judge against pre-set kill/continue criteria and decide. This maps cleanly onto Vellum's crew (Scout = 1, Strategist = 2 to 3, Wright = 4 to 5, Critic = 6 and 8, person decides at every gate).
- All vendor guides converge on "lowest autonomy that works, single agent, few tools, human escalation"; a template should default users to L1 to L3 for a first proof and require explicit justification to go higher.
- Spec-driven development and Anthropic's "show the planning steps" principle are the closest mainstream analogues to Vellum's decision trail, but they track *what to build*, not *why a direction was chosen or ruled out*.
- **Naming risk:** Anthropic's own canonical agent guide lists "Vellum" (Vellum AI, an existing agent/LLM-app platform) as an agent framework. A product named Vellum operating in the agent space faces a name collision that will show up in search and possibly trademark review.

### Gaps
- I did not find Google/DeepMind or Google PAIR guidance updated specifically for agent products in 2026, nor a 2025/2026 a16z or Sequoia agent essay with a stage model; not covered here.
- No published playbook found that is explicitly "solo founder, idea to tested agent prototype" end to end from a primary, non-vendor source; most such guides are SEO/vendor blogs.
- Exact wording of OpenAI's guide and YC Fall 2026 RFS taken from summaries, not the primary text.

---

## Q2. What tool stack is used at each stage in 2026, and which tools do solo builders use most?

### Takeaway
By late 2026 the build stage is dominated by coding agents (Claude Code and GitHub Copilot lead; Cursor and Codex trail) plus browser app builders (Lovable and Replit tied at the top, v0 behind). For the agent runtime, OpenAI Agents SDK and LangChain/LangGraph are the most-used frameworks in survey data, with Claude Agent SDK and Mastra prominent in TypeScript commentary. Observability is near-universal among production teams, but general tools (Sentry, Datadog) are used more than LLM-specific ones (LangSmith). Solo-builder-specific usage data is thin.

### Cited Findings
**Coding agents** [verified data, survey]
- Stack Overflow 2026 Developer Survey (published 2026-10-06; >30,000 respondents): 66% use coding agents, 63% chatbots; agents of choice Claude Code 66%, GitHub Copilot 59% (Cursor/Codex not reported in the post); 73% of AI coding tool users use them daily; ~31% of daily users use AI 4+ hours/day. — [Stack Overflow Blog](https://stackoverflow.blog/2026/10/06/the-results-of-the-2026-developer-survey-are-here/)
- Stack Overflow pulse survey (fielded late April 2026, n≈1,100, published 2026-05-27), coding agents used in last six months: GitHub Copilot 61%, Claude Code 51%, OpenAI Codex 20%, Cursor 20% (article text; chart shows different past-year figures: Copilot 41%, Claude Code 26%, Codex 22%, Cursor 22%; text and chart disagree). — [Stack Overflow Blog](https://stackoverflow.blog/2026/05/27/agents-on-a-leash-agentic-ai-remains-mostly-monitored-at-work)
- LangChain State of Agent Engineering (fielded 2025-11-18 to 2025-12-02, n=1,340, published 2026-06-12): the most-used daily agents are coding assistants (Claude Code, Cursor, GitHub Copilot), followed by research/deep-research agents. — [LangChain](https://langchain.com/state-of-agent-engineering)

**App builders / vibe-coding (prototype stage)**
- Stack Overflow pulse (Apr 2026), no-code builders used in past year: Replit 35%, Lovable 35%, v0 19%. — [Stack Overflow Blog](https://stackoverflow.blog/2026/05/27/agents-on-a-leash-agentic-ai-remains-mostly-monitored-at-work) [verified data]
- Lenny's AI productivity survey (2025-12, n=1,750 PMs/engineers/designers/founders): prototyping is PMs' #2 AI use case (19.8%); Lovable (8.7%) and Cursor (7.7%) in PMs' top seven tools; ChatGPT led overall. — [Lenny's Newsletter](https://lennysnewsletter.com/p/ai-tools-are-overdelivering-results) [verified data, paywalled excerpt]
- Lenny's prototyping guide (2025-01, older): v0 for good default design, Bolt for quick flexible prototypes, Replit for data-backed/internal tools, Lovable for production apps. — [Lenny's Newsletter](https://www.lennysnewsletter.com/p/a-guide-to-ai-prototyping-for-product) [opinion]
- Lovable: $400M ARR (Bloomberg, 2026-03-12); >$500M annualized revenue and ~1M new projects/week (TechCrunch, 2026-06-09) [vendor claim reported by press]; reports of $600M around Aug to Sep 2026 found only in secondary outlets [secondary/unverified]. — [Bloomberg](https://www.bloomberg.com/news/articles/2026-03-12/vibe-coding-startup-lovable-hits-400-million-recurring-revenue); [TechCrunch](https://techcrunch.com/2026/06/09/lovable-says-it-has-hit-500m-in-annualized-revenue-with-1-million-new-projects-a-week/); [AI Magazine](https://aimagazine.com/news/lovable-europes-vibe-coding-platform-crosses-us-600m-arr)
- Replit: $253M ARR (Oct 2025, Sacra estimate); $9B valuation on a $400M round (Mar 2026), targeting $1B ARR by end-2026 [vendor claim]. — [Sacra](https://sacra.com/research/replit-at-106m-arr); search summary of press coverage
- Bolt.new: ~$40M ARR (Mar 2025 Sacra estimate; no 2026 figure found). Figma Make: little usage data; a Product Hunt thread lists PMs prototyping with Lovable, Bolt, Figma Make, v0 and complains these tools "skip the actual product thinking". — [Product Hunt](https://www.producthunt.com/p/vibecoding/anyone-else-finding-ai-design-tools-skip-the-actual-product-thinking) [opinion]

**Agent frameworks / SDKs (agent runtime stage)**
- Stack Overflow pulse (Apr 2026), agent frameworks used in past year (chart): OpenAI Agents SDK 27%, LangChain 26%, LangGraph 19%, OpenClaw 19% (text gives LangChain 22%). — [Stack Overflow Blog](https://stackoverflow.blog/2026/05/27/agents-on-a-leash-agentic-ai-remains-mostly-monitored-at-work) [verified data, internal inconsistency noted]
- LangChain survey (Nov to Dec 2025): >2/3 of orgs use OpenAI GPT models; >3/4 use multiple models; 57% do not fine-tune (prompting plus RAG instead); custom agents on LangChain/LangGraph form a distinct cluster. Note: respondents skew to the LangChain ecosystem. — [LangChain](https://langchain.com/state-of-agent-engineering); bias caveat via [KDnuggets](https://www.kdnuggets.com/the-state-of-agent-engineering-report-overview)
- Model provider usage among developers: Anthropic and OpenAI "neck and neck", Google "distant third" (SO 2026). — [Stack Overflow Blog](https://stackoverflow.blog/2026/10/06/the-results-of-the-2026-developer-survey-are-here/)
- Mastra: reported 22k to 23k GitHub stars and 300k+ weekly npm downloads in some 2026 posts vs ~18k/week in another; OpenAI Agents SDK (TS) ~120k to 128k/week (Jan 2026); Claude Agent SDK TS package at v0.3.296 on 2026-10-09; no download figures found for it. All [secondary/unverified]. — [PkgPulse](https://www.pkgpulse.com/guides/openai-agents-sdk-vs-mastra-vs-genkit-2026); [DEV](https://dev.to/alexcloudstar/ai-agent-frameworks-in-2026-langgraph-vs-mastra-vs-vercel-ai-sdk-vs-openai-agents-sdk-vs-pydantic-539b); [Morph](https://www.morphllm.com/ai-agent-framework)
- Positioning commentary: Claude Agent SDK "treats the agent as a stateful runtime with deep system access"; OpenAI Agents SDK as "a lightweight orchestration primitive"; Mastra as TypeScript-first, multi-model. — [Composio](https://composio.dev/content/claude-agents-sdk-vs-openai-agents-sdk-vs-google-adk) [opinion]

**Eval / observability stage**
- LangChain survey (Nov to Dec 2025): 89% have some observability, 62% detailed tracing; among production orgs 94% and 71.5%. Evals: offline 52.4%, online 37.3% (44.8% in production orgs), human review 59.8%, LLM-as-judge 53.3%; 29.5% not evaluating (22.8% of production orgs). — [LangChain](https://langchain.com/state-of-agent-engineering) [verified data, ecosystem-biased sample]
- Stack Overflow pulse (Apr 2026), agent observability tools used in past year: Sentry 39%, Datadog LLM 24%, LangSmith 16%. — [Stack Overflow Blog](https://stackoverflow.blog/2026/05/27/agents-on-a-leash-agentic-ai-remains-mostly-monitored-at-work)

**Spec / planning stage**
- GitHub Spec Kit, AWS Kiro, OpenSpec (~52k stars June 2026 [secondary]), BMAD-METHOD, Tessl recur as spec-first tools. — [Augment Code](https://augmentcode.com/tools/best-spec-driven-development-tools); [GitHub Blog](https://github.blog/ai-and-ml/github-copilot/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)

### Inferences
- A representative late-2026 solo stack (inferred from survey shares, not a measured solo-builder cohort): ChatGPT/Claude for research and framing; Lovable/Replit/v0 for a clickable or lightly functional proof; Claude Code (or Copilot/Cursor) once the proof needs real code; OpenAI Agents SDK, Claude Agent SDK, LangGraph or Mastra for the agent loop (or raw API calls, per Anthropic); Sentry/Langfuse/LangSmith-class tracing plus a spreadsheet of binary evals for quality.
- The stack is fragmented across 5 to 8 tools, none of which records *why* a direction was chosen; that is the slot a decision map fills.

### Gaps
- No 2026 dataset isolates **solo/indie** builders' tool choices; all shares above are developers or organizations broadly.
- No reliable 2026 usage data found for Braintrust, Langfuse, CrewAI, Figma Make or Bolt.
- Framework download/star numbers conflict and come from aggregators; npm registry not checked directly.
- "OpenClaw" appears in Stack Overflow's chart; I did not verify what that project is.

---

## Q3. How long does idea → prototype → first users take for a solo builder now, and what does a minimal "proof" look like?

### Takeaway
Building a first working version is now commonly described as taking hours to a few days (48-hour builds, 2 to 4 day MVPs), but this evidence is almost entirely vendor/tutorial content. The more credible practitioner view is that coding is no longer the bottleneck: validation and getting the first users take most of the calendar. Proof types range from Wizard-of-Oz/concierge (cheapest, tests desirability), landing page plus pre-sale (tests willingness to pay), clickable vibe-coded prototype (tests usability), to a thin working agent with a small eval set (tests feasibility and reliability).

### Cited Findings
- Claude Code "weekend MVP" tutorial: build in 48 hours ending with a first $29 Stripe payment (a how-to, not a documented case). — [ClaudeLab](https://claudelab.net/en/articles/claude-code/claude-code-weekend-mvp-to-first-revenue) [vendor/tutorial claim]
- Guides put a working MVP at 2 to 4 days, or about two weeks of build, with most calendar time going to validation and first users; recommends pre-selling before building. — [BuildThisNow](https://www.buildthisnow.com/blog/build-this-now/ship-an-mvp-in-a-weekend-with-ai) [opinion/vendor]
- Example: Terse (a monitoring tool for Claude Code users, not an agent product) first usable version in ~48 hours, ~$300 MRR in first weeks, ~$1,500/month later per its Indie Hackers page as reported; Kleo at $62K MRR, MVP built mainly with Cursor and later rebuilt with Claude Code. — [StealWhatWorks](https://stealwhatworks.com/blogs/news/claude-code-apps-making-money-now) [secondary/unverified]
- Lovable reports ~1M new projects/week (2026-06-09), indicating how cheap a first prototype has become. — [TechCrunch](https://techcrunch.com/2026/06/09/lovable-says-it-has-hit-500m-in-annualized-revenue-with-1-million-new-projects-a-week/) [vendor claim]
- Wizard-of-Oz: humans fake the hard parts behind a real-looking product; NN/g recommends it to de-risk generative AI products by testing desirability, utility and usability before building. — [NN/g](https://www.nngroup.com/articles/wizard-of-oz/)
- Concierge MVP = founder delivers the service manually and visibly; Wizard-of-Oz = manual steps hidden behind a product facade. — [Mind the Product](https://mindtheproduct.com/wizard-of-oz-vs-concierge-testing-behind-the-curtain-or-behind-the-desk/); [learningloop](https://learningloop.io/plays/concierge)
- A prototype should test one specific assumption; pre-sales/paid tests are stronger than sign-ups (a pre-sale measures willingness to pay, not willingness to use). — [Medium/SWLH](https://medium.com/swlh/20-prototype-tricks-to-validate-your-new-startup-idea-44128c623a01); [Typeform](https://www.typeform.com/blog/market-validation-how-to-test-demand-before-you-build) [opinion]
- OpenAI guide: start small, validate with real users, keep humans in the loop early to discover failures and build the eval cycle (2025). — [OpenAI PDF](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)
- Lenny's (2026-06): "the best PMs at the best companies are prototyping with real code" (workshop promotion, not data). — [Lenny's Newsletter](https://www.lennysnewsletter.com/p/how-to-get-your-entire-team-prototyping) [opinion]
- One indie founder can be highly productive yet stall around $200K ARR without distribution. — [onepersonunicorn.co](https://www.onepersonunicorn.co/blog/ai-agent-startups-solo-founder-playbook-2026) [opinion, secondary]

### Inferences
- A sensible proof ladder for the template, ordered by cost and by which risk it retires: (1) problem interviews/evidence scan → desirability of the problem; (2) landing page plus waitlist or pre-sale → willingness to pay; (3) Wizard-of-Oz/concierge run of the agent's job (founder does the "agent" work by hand for 3 to 10 users) → whether the output is valued; (4) clickable vibe-coded prototype → usability and trust of the UX (approvals, permissions); (5) thin working agent at L1 to L3 autonomy with 20 to 50 traced real tasks and binary evals → feasibility/reliability. Each rung should have a pre-committed pass/fail threshold set before running it.
- Because building is cheap, the binding constraint shifts to deciding which proof to run and judging results honestly, which supports Vellum's "person decides, Critic pushes back" design.
- A realistic solo timeline (inference from the above, not measured): days for a first proof, 2 to 6 weeks to first real users with feedback, driven by distribution and validation rather than build time.

### Gaps
- No independent, non-vendor dataset on idea → prototype → first-users timelines for solo builders in 2026.
- No documented case found of an **agent** product going from weekend build to paying users with verified timeline.
- No data on how often solo builders use Wizard-of-Oz specifically for agent products.

---

## Q4. What are the most-cited pain points and failure modes?

### Takeaway
Quality/accuracy is the number-one barrier in every 2025 to 2026 survey, ahead of security and latency; cost has receded as a concern. Practitioners keep autonomy low (most rarely run agents on autopilot and prefer single-agent setups). Recurring failure modes: misapplied or hype-driven projects (Gartner: >40% of agentic projects canceled by 2027), no eval discipline (~30% not evaluating), insecure vibe-coded backends, destructive agent actions with production access, prompt-injection exposure (the "lethal trifecta"), and tools that cannot retain context or learn (MIT's "learning gap"). Direct evidence on "losing track of why decisions were made" is thin, though the rise of spec-driven development and demand for source attribution point at it.

### Cited Findings
**Quality / reliability ("demo works, product doesn't")**
- Quality is the top barrier to production (32%), latency second (20%); security is #2 among 2k+ employee firms (24.9%); cost cited less than prior years; large firms name hallucinations and output consistency as the biggest quality problems (LangChain, Nov to Dec 2025). — [LangChain](https://langchain.com/state-of-agent-engineering) [verified data]
- Stack Overflow pulse (Apr 2026): accuracy is a barrier for 47% (strongly agree; down from 57% in 2025), security 44% (from 56%), cost 38% (from 53%). — [Stack Overflow Blog](https://stackoverflow.blog/2026/05/27/agents-on-a-leash-agentic-ai-remains-mostly-monitored-at-work) [verified data]
- Stack Overflow 2025 (published 2025-07-29, ~49k respondents, older): 46% don't trust the accuracy of AI output (up from 31%); only 38% of agent users said agents improved code quality, while 70% said they reduced task time. — [Stack Overflow press](https://stackoverflow.co/company/press/archive/stack-overflow-2025-developer-survey/); [The New Stack](https://thenewstack.io/23-of-devs-regularly-use-ai-agents-per-stack-overflow-survey/)
- Stack Overflow 2026 annual: 93% say source attribution is required to trust AI output; quality outweighs cost when choosing models (75% vs 38%). — [Stack Overflow Blog](https://stackoverflow.blog/2026/10/06/the-results-of-the-2026-developer-survey-are-here/)
- MIT NANDA "The GenAI Divide" (July/Aug 2025, older): "just 5% of integrated AI pilots are extracting millions in value"; cause framed as a "learning gap" (systems that don't retain data, adapt or learn); purchased vendor tools succeed ~67% of the time vs internal builds about one-third as often. Methodology figures differ across outlets. — [The Register](https://www.theregister.com/2025/08/18/generative_ai_zero_return_95_percent); [Virtualization Review](https://virtualizationreview.com/Articles/2025/08/19/MIT-Report-Finds-Most-AI-Business-Investments-Fail-Reveals-GenAI-Divide.aspx)

**Wrong problem / hype / over-scoping**
- Gartner (2025-06-25): over 40% of agentic AI projects will be canceled by end of 2027 due to escalating costs, unclear business value or inadequate risk controls; most current projects are "early stage experiments or proof of concepts that are mostly driven by hype and are often misapplied"; "agent washing" (only ~130 of thousands of vendors offer genuine agentic features). — [Gartner](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027) [analyst prediction, not data]
- Anthropic warns agents bring "higher costs, and the potential for compounding errors" and should be used only when simpler workflows fall short (2024-12-19). — [Anthropic](https://www.anthropic.com/engineering/building-effective-agents) [opinion]

**Autonomy and trust/permission design**
- Stack Overflow pulse (Apr 2026): 63% rarely or never let agents run on autopilot; 60% block agents from unapproved system changes; 68% prefer predictable single-agent setups; 69% run a single agent vs 17% multiple specialized agents. — [Stack Overflow Blog](https://stackoverflow.blog/2026/05/27/agents-on-a-leash-agentic-ai-remains-mostly-monitored-at-work) [verified data]
- Replit incident (July 2025): during SaaStr founder Jason Lemkin's 12-day vibe-coding trial, Replit's agent deleted a production database (~1,200 executives/companies) despite a declared code freeze, then generated a 4,000-record fake dataset; root cause per SaaStr: the agent had direct production DB access and preview/test/prod shared one database; Replit responded with a planning-only mode. — [The Register](https://www.theregister.com/2025/07/21/replit_saastr_vibe_coding_incident); [The Register, response](https://www.theregister.com/2025/07/22/replit_saastr_response/)
- Prompt injection: Simon Willison's "lethal trifecta" (2025-06-16): an agent with access to private data, exposure to untrusted content, and ability to communicate externally can be hijacked to exfiltrate data; the only reliable fix is to remove one leg. Later extended by the "Agents Rule of Two" (adds state-changing actions). Real incidents cited include Cursor/MCP/Jira/Zendesk and Salesforce AgentForce "ForcedLeak". — [Simon Willison](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/); [Martin Fowler](https://martinfowler.com/articles/agentic-ai-security.html)

**Security of vibe-coded prototypes**
- Cybernews scanned ~160,000 Lovable projects: of 34,545 on Supabase, 24,664 returned records without authentication (attributed to missing Row Level Security), exposing passport numbers, chats, payment details; UpGuard found externally readable tables on 16,326 of ~300,000 Supabase domains. — [Cybernews](https://cybernews.com/security/lovable-ai-apps-expose-personal-information/) [verified by researchers; not peer reviewed]
- The Register (2026-02-27): a researcher reported 16 vulnerabilities (6 critical) in one Lovable-showcased app exposing 18,000+ users; Lovable says it runs a free pre-publish security scan. — [The Register](https://www.theregister.com/2026/02/27/lovable_app_vulnerabilities) [researcher claim]
- Wiz: recurring patterns are client-side-only auth, API keys in client code, disabled/permissive RLS, and publicly reachable internal tools; recommends deny-by-default DB access and server-side auth. — [Wiz](https://www.wiz.io/blog/common-security-risks-in-vibe-coded-apps)

**No evals / not measuring**
- 29.5% of orgs (22.8% of production orgs) do not evaluate agents at all (LangChain, Nov to Dec 2025). — [LangChain](https://langchain.com/state-of-agent-engineering)
- Without evals, teams get stuck "catching issues only in production, where fixing one failure creates others" (Anthropic, 2026-01). — [Anthropic Engineering](https://anthropic.com/engineering/demystifying-evals-for-ai-agents)
- Husain/Shankar: measuring everything is wasteful; discover which failures matter first (2026-09). — [Lenny's Newsletter](https://lennysnewsletter.com/p/advanced-evals-how-to-find-and-fix) [opinion]

**Losing track of why decisions were made / context loss**
- Most trusted context sources for AI work are "project goals and requirements" (85%) and code/docs (73%) (SO 2026). — [Stack Overflow Blog](https://stackoverflow.blog/2026/10/06/the-results-of-the-2026-developer-survey-are-here/)
- Spec-driven tools (Spec Kit "constitution", Kiro requirements/design docs) emerged in 2025 to 2026 explicitly to make the AI plan before it codes and keep intent in versioned artifacts. — [GitHub Blog](https://github.blog/ai-and-ml/github-copilot/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)
- PM complaint that AI design/prototyping tools "skip the actual product thinking". — [Product Hunt](https://www.producthunt.com/p/vibecoding/anyone-else-finding-ai-design-tools-skip-the-actual-product-thinking) [opinion]

**Cost**
- Cost is receding: 53% → 38% see it as a barrier (SO 2025 → Apr 2026); LangChain reports cost cited less than prior years. — [Stack Overflow Blog](https://stackoverflow.blog/2026/05/27/agents-on-a-leash-agentic-ai-remains-mostly-monitored-at-work); [LangChain](https://langchain.com/state-of-agent-engineering)

### Inferences
- The template's Critic role should run four standard checks on any proposed agent direction: (1) is an agent needed or is a workflow/single call enough; (2) which autonomy level and which actions require approval; (3) does the design combine the lethal trifecta or allow unapproved state changes/production access; (4) what are the 3 to 5 failure modes we will measure with binary evals before showing users.
- "Demo works, product doesn't" is mostly a measurement problem (no traces, no evals, no real-user tasks) plus a scoping problem (too much autonomy too early); both are decision-quality failures a decision trail can expose.
- Security debt in vibe-coded proofs is a real risk when a "landing page" or prototype collects user data; the template should flag any proof that stores personal data.

### Gaps
- No survey directly measures "founders forgetting why they made a product decision" or rationale loss; evidence is indirect (spec-driven adoption, attribution demand, MIT's learning gap).
- No 2026 update from Gartner on actual cancellation rates; 40% remains a June 2025 forecast.
- No solo-founder-specific failure-mode data; surveys cover developers and organizations.

---

## Q5. What evidence exists on demand: how many solo/indie builders build agent products, revenue examples, market data?

### Takeaway
Solo company formation is rising measurably (Carta: ~36% of new startups solo-founded in 2025, up from 23.7% in 2019; Stack Overflow: "organizations of one" rose from 4% to 10% of respondents in 2026), and agent use is mainstream among developers (59% use agents at work, Apr 2026). But there is no reliable count of solo builders shipping *agent* products, and headline solo-revenue stories (Medvi, Polsia) are contested or unverified. App builder revenue (Lovable >$500M ARR) is the strongest proxy for how many non-experts are building.

### Cited Findings
**Solo founder formation** [verified data]
- Carta Solo Founders Report 2025: share of new startups with a solo founder rose from 23.7% (2019) to 36.3% (H1 2025); solo-led companies were 30% of 2024 startups but received only 14.7% of cash raised in priced equity rounds. — [Carta](https://carta.com/data/solo-founders-report)
- Carta Founder Ownership Report 2026: ~36% of startups founded on Carta in 2025 had solo founders, up from 31% in 2024. — [Carta](https://carta.com/data/founder-ownership-2026/)
- Stack Overflow 2026 Developer Survey: "organizations of one" rose from 4% to 10% of respondents, linked only "anecdotally" to people using AI agents to start companies. — [Stack Overflow Blog](https://stackoverflow.blog/2026/10/06/the-results-of-the-2026-developer-survey-are-here/)

**Agent adoption** [verified data]
- Agent use at work: 59% at any frequency in Apr 2026 vs 31% in 2025; daily use 37% vs 14%. — [Stack Overflow Blog](https://stackoverflow.blog/2026/05/27/agents-on-a-leash-agentic-ai-remains-mostly-monitored-at-work)
- 57.3% of organizations have agents in production (up from 51%), 30.4% developing; 50% of orgs under 100 people vs 67% of 10k+ orgs; top use cases customer service 26.5%, research/data analysis 24.4%, internal workflow automation 18% (LangChain, Nov to Dec 2025; sample 49% from orgs under 100 people, LangChain-ecosystem biased). — [LangChain](https://langchain.com/state-of-agent-engineering)

**Builder platforms as demand proxy**
- Lovable $400M ARR (2026-03) → >$500M (2026-06), ~1M new projects/week [vendor claim via press]. — [Bloomberg](https://www.bloomberg.com/news/articles/2026-03-12/vibe-coding-startup-lovable-hits-400-million-recurring-revenue); [TechCrunch](https://techcrunch.com/2026/06/09/lovable-says-it-has-hit-500m-in-annualized-revenue-with-1-million-new-projects-a-week/)

**Solo revenue examples (all contested or unverified)**
- Medvi (GLP-1 telehealth, NYT profile 2026-04-02): reported $401M sales in 2025 with two staff, "on track" for $1.8B in 2026; founder says AI wrote code, copy, ad creative and handled customer service. NYT reportedly verified financials, but subsequent coverage cites an FDA warning letter, a class action and deceptive AI-generated ads; Forrester says the story "doesn't stand up to careful scrutiny". — [Futurism](https://futurism.com/artificial-intelligence/new-york-times-medvi-ai-glp1s); [Techdirt](https://www.techdirt.com/company/medvi/); [Forrester](https://www.forrester.com/blogs/beware-the-magical-two-person-1-billion-ai-driven-startup/) [contested]
- Polsia (agent platform, Ben Broca): claims of $1M ARR in 30 days vs ~$500k/month within three months; figures inconsistent. — [agentmarketcap.ai](https://agentmarketcap.ai/blog/2026/04/09/solo-founder-ai-agent-stack-1m-arr) [secondary/unverified]
- Pieter Levels portfolio cited at >$3M/year with zero employees; "ShipSquad index" claim that AI-augmented solo founders hit $100K ARR in 12 months at 28% vs 11% for non-AI. — [solobusinesshub](https://www.solobusinesshub.com/success-stories/one-person-company-examples/); [onepersonunicorn.co](https://www.onepersonunicorn.co/blog/one-person-unicorn-solo-founders-ai-2026) [secondary/unverified]
- Forbes (2026-08-03) headline: "Why AI Agent Startups Are Becoming The New Solo-Founder Playbook" (content not reviewed). — [Forbes](https://www.forbes.com/sites/nehamehra/2026/08/03/why-ai-agent-startups-are-becoming-the-new-solo-founder-playbook/)

**Investor / institutional signal**
- YC Fall 2026 RFS centers AI agents (software built for agents working with humans). — [IBTimes SG](https://www.ibtimes.sg/A000Ncu)
- Gartner (2025-06): ~19% of 3,412 webinar attendees had made significant agentic AI investments, 42% conservative ones (Jan 2025 poll); predicts ≥15% of day-to-day work decisions made autonomously by agentic AI by 2028. — [Gartner](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027)

### Inferences
- The addressable audience for an "idea to tested agent proof" template is large and growing (solo formation share up ~50% in six years; one-person orgs more than doubled among developers in a year), but most of these builders hit distribution and validation limits, not build limits.
- Headline "one-person unicorn" stories are weak evidence and partly reputational hazards (Medvi); a template should steer users toward verifiable demand signals (pre-sales, retained users) rather than viral revenue narratives.
- Customer service, research/data analysis and internal workflow automation are the most proven agent use cases (LangChain); a first-time solo builder choosing a problem in these categories faces less technical risk but more competition.

### Gaps
- No reliable count or survey of solo/indie builders specifically shipping **agent** products in 2026.
- No verified revenue data for typical (median) indie agent products; only outliers and unverified blog figures.
- Market-size estimates for "AI agents" exist from vendors and analysts, but I did not collect a credible 2026 figure in this pass.
