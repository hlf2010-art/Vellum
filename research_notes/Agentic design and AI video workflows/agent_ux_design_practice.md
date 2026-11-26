# Agent UX design practice: decisions, frameworks, artifacts, tools and demand (as of 2026-11-26)

Scope: how product designers design the *user experience* of agentic AI products (not the engineering build). International focus. Each item is tagged with its date and how reliable it is: **[Primary]** means read at the original source this session. **[Secondary]** means it came from a summary or search snippet, so check it before quoting. **[Vendor]** means a company describing its own product or practice. **[Opinion]** means a practitioner essay or talk.

---

## 1. Which design decisions are specific to agent products, and which pattern libraries or guidelines cover them?

### Takeaway
The decisions that set agent UX apart from other UX have settled into a stable set:
- how much autonomy the agent gets, set per action and by risk;
- where it must stop for approval, including a preview of its plan;
- what it may touch (permissions and scope);
- whether its state and reasoning are visible;
- whether a person can stop it, take over, undo or roll back;
- what it remembers and who controls that;
- when it interrupts or notifies;
- who is accountable, and which agent did what when several work together;
- how far to trust it, shown through confidence signals.

The newest and most agent-specific guidance comes from Linear's Agent Interaction Guidelines (Jul 2025), Microsoft Design's agent principles (Apr 2025), the Shape of AI "Governors" patterns, Smashing Magazine's pattern-plus-metrics article (Feb 2026) and an empirical SAP/HCII 2026 study. The classic libraries (Microsoft HAX 2019, Google PAIR 2019/2021) predate agents and show no agent-specific update.

### Cited Findings

**Autonomy level (the "autonomy dial")**
- **[Opinion, Feb 11 2026]** Smashing Magazine (Victor Yocco, PhD) describes an "Autonomy Dial (Progressive Authorization)". Users set how independent the agent is, ideally per task type, across four levels: observe and suggest → plan and propose → act with confirmation → act autonomously on pre-approved tasks. Proposed metrics are "trust density", the share of users at each setting, and "setting churn". — [Smashing Magazine](https://smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/)
- **[Primary, Jun 17 2026]** An SAP / Hochschule Fresenius / University of Missouri study (HCII 2026) proposes eight agent UX principles. One criterion is that agents should work autonomously only on low-impact or manually intensive tasks. — [arXiv 2606.18716](https://arxiv.org/html/2606.18716)
- **[Primary, arXiv v3 Jul 28 2026; first posted Oct 2025]** Apple/CMU researchers (Liang, Barik, Nichols, Schoop, Cheng) frame proactivity as a core designer question. Their running example is an interaction designer unsure "whether the agent should frequently ask for user input, perform the task and send a summary at the end, or something in between." — [arXiv 2510.04452](https://arxiv.org/pdf/2510.04452)
- **[Secondary, 2026]** A 2026 guide describes an "autonomy gradient: suggest, confirm, then execute". Consent is scoped by the risk of each action, not set with one global toggle. — [aiuxplayground](https://aiuxplayground.com/guides/how-to-design-human-in-the-loop)

**Human-in-the-loop and approval points**
- **[Opinion, Feb 2026]** "Intent Preview (Plan Summary)" shows the agent's planned steps before it acts, so the user can approve, edit or take over. It is required for irreversible, financial or data-sharing actions. Proposed metrics: acceptance ratio above 85%, a model review if overrides exceed 10%, and plan-recall accuracy. — [Smashing Magazine](https://smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/)
- **[Primary, Jun 2026]** In the SAP study, 95% said a human should confirm critical decisions and 86% wanted to be able to intervene, override or disengage. "Human control" was the top-ranked principle: 65% put it in their top three and 40% ranked it first. — [arXiv 2606.18716](https://arxiv.org/html/2606.18716)
- **[Secondary, 2026]** A 2026 heuristic: irreversible actions (deleting files, sending email, purchases) always warrant approval, while reversible ones (reading, searching) generally do not. Scope, cost and novelty are also weighed. — [aiuxplayground](https://aiuxplayground.com/guides/how-to-design-human-in-the-loop)
- **[Vendor/engineering, undated 2025–26]** Google Cloud's agent architecture guide describes a human-in-the-loop pattern in which the agent pauses at predefined checkpoints and waits for a person to review its work. — [Google Cloud](https://docs.cloud.google.com/architecture/choose-design-pattern-agentic-ai-system)
- **[Primary, pattern library, © 2025]** Shape of AI (Emily Campbell) groups human-in-the-loop patterns as **Governors**:
  - Action plan: show the steps before executing.
  - Verification: confirm decisions and actions before the agent proceeds.
  - Sample response: confirm intent on complex prompts.
  - Controls: pause or adjust mid-stream.
  - Stream of Thought: show reasoning, tool use and decisions.
  - Memory, References, Citations.
  - Cost estimates.
  - Draft mode.
  - Shared vision: live view of the agent's actions in a shared canvas.
  - Variations.
  - **Branches:** "a visible path back to the original".

  The page never uses the word "agentic". — [shapeof.ai](https://www.shapeof.ai/)

**Permissions and scope**
- **[Primary, Jul 2026]** The Apple/CMU taxonomy has 4 categories and 21 subcategories. Under scope and risk it lists: scope of the agent, scope of the UI the agent controls, external resources it can reach, personal data and privacy, types of risk, and mitigations. Under user control it lists: indicators of risk or impact, high-impact scenarios, user permission to proceed, levels of impact, and review or editing of the overall plan. — [arXiv 2510.04452](https://arxiv.org/pdf/2510.04452)
- **[Vendor, Jul 30 2025; living doc]** Linear AIG: "An agent should inhabit the platform natively". It works through the existing UI and standard actions, as a human user would, and its actions sit in the same activity feed. — [Linear AIG](https://linear.app/developers/aig); [Linear changelog](https://linear.app/changelog/2025-07-30-agent-interaction-guidelines-and-sdk)

**Transparency of reasoning and status**
- **[Vendor, 2025]** Linear AIG: "An agent should be clear and transparent about its internal state". It should show thinking, waiting, executing or finished, and let humans inspect its reasoning and tool calls. It should also give instant, unobtrusive acknowledgement when invoked. — [Linear AIG](https://linear.app/developers/aig)
- **[Primary, Jun 2026]** In a conjoint experiment (107 respondents, 1,139 choice tasks):
  - High transparency had the largest effect on which agent people chose: **+37.79 percentage points** (95% CI 31.93–41.94).
  - A low-confidence warning added **+22.46 pp**.
  - A stop/pause button added only **+5.11 pp**, not significant (p = 0.0502). The authors say its function may have been unclear.

  Interviewees said transparency needs may fall as trust grows, and that detail matters most for high-stakes tasks and novices. — [arXiv 2606.18716](https://arxiv.org/html/2606.18716)
- **[Secondary/Opinion, 2026]** Jenny Wen, Anthropic design lead, reportedly describes hiding more technical detail because users increasingly trust Claude enough not to need every step. This comes from a podcast summary. — [Double Diamond podcast](https://doublediamondnyc.substack.com/p/jenny-wen-design-lead-at-anthropic)
- **[Vendor, Apr 11 2025]** Microsoft Design "UX design for agents" (He, Fox, Snellinger) groups its principles in three sets:
  - Space: "connecting, not collapsing"; "easily accessible yet largely invisible".
  - Time: Past uses memory and history; Now means "nudge rather than notify"; Future means adapt to devices and modalities.
  - Core: "embrace uncertainty but establish appropriate trust"; "transparency, control, and consistency". Users control when the agent is on or off, and its status is always visible. Background actions should show up in dashboards or activity logs.

  — [Microsoft Design](https://microsoft.design/articles/ux-design-for-agents/)

**Error recovery, undo and escalation**
- **[Opinion, Feb 2026]** Smashing proposes two patterns:
  - "Action Audit & Undo": a chronological action log with one-click undo, and the undo window stated wherever an action becomes irreversible. Metric: if more than 5% of a task's actions are reverted, turn off automation for that task.
  - "Escalation Pathway": ask, offer options or hand off to a human instead of guessing. Healthy escalation is 5–15% of tasks, with a recovery-success target above 90%.

  It also recommends "empathic apologies and clear remediation". — [Smashing Magazine](https://smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/)
- **[Primary, Jul 2026]** The Apple/CMU taxonomy lists, for runtime control: stop/pause, user taking over, intervention during execution, user demonstration, and revert to previous steps. For errors it lists: types of agent error, error recovery, discoverability and communication. — [arXiv 2510.04452](https://arxiv.org/pdf/2510.04452)
- **[Secondary, 2026]** An escalation ladder: self-correction → ask the user → hand off to a human → halt with state preserved. The person receiving the escalation needs a summary and a recommended next step, not a raw transcript. — [Imran Irfani, Agentic UX Playbook](https://imranirfani.com/agentic-ux/)

**Memory**
- **[Vendor, Apr 2025]** Microsoft's "Past" principle: use memory and historical context, not just current state. — [Microsoft Design](https://microsoft.design/articles/ux-design-for-agents/)
- **[Pattern library]** Shape of AI "Memory" pattern: users control what the AI knows about them. Related trust patterns: Consent, Data ownership, Incognito mode, Footprints, Disclosure. — [shapeof.ai](https://www.shapeof.ai/)

**Interruption, notification and disengagement**
- **[Vendor, 2025]** Linear AIG: "An agent should respect requests to disengage". It steps back immediately and resumes only on a clear signal. — [Linear AIG](https://linear.app/developers/aig)
- **[Vendor, Apr 2025]** Microsoft: "nudge rather than notify". Match proactive or reactive behaviour to user settings such as Do Not Disturb, the type of action and how important the task is. — [Microsoft Design](https://microsoft.design/articles/ux-design-for-agents/)
- **[Primary, Jul 2026]** The Apple/CMU taxonomy includes "communication of runtime status", "notification of runtime status", "confirmation on the execution of the last step" and "success/failure at the end of the task". — [arXiv 2510.04452](https://arxiv.org/pdf/2510.04452)

**Multi-agent roles, identity and accountability**
- **[Vendor, 2025]** Linear AIG: "An agent should always disclose that it's an agent", and "An agent cannot be held accountable". A human stays ultimately responsible, so delegation must be clearly structured. — [Linear AIG](https://linear.app/developers/aig)
- **[Opinion, Jul 2026 / Aug 2025]** WEF pieces by Cognizant authors:
  - Make each agent's role visible in both look and behaviour, using colour-coded states and activity cues.
  - Show which agent is working and why there is a delay.
  - Use progressive disclosure: previews, intermediate results, activity indicators.

  These are untested hypotheses. — [WEF 2026](https://www.weforum.org/stories/emerging-technologies/rethinking-the-user-experience-in-the-age-of-multi-agent-ai/); [WEF 2025](https://www.weforum.org/stories/2025/08/rethinking-the-user-experience-in-the-age-of-multi-agent-ai)
- **[Opinion, Aug 20 2026]** Joel Lewenstein, Anthropic Head of Product Design, said: "We haven't invented an interface for managing hundreds or thousands of Claude instances." He juggles 17 Claude Code instances with constant review requests and suggests a "digital chief of staff". — [IDEO](https://www.ideo.com/journal/crafting-the-last-mile-of-delight)
- **[Pattern library]** Shape of AI "Identifiers" covers how agents are told apart: avatar, colour, iconography, name, personality. — [shapeof.ai](https://www.shapeof.ai/)

**Trust calibration**
- **[Primary, Jan 16 2026]** NN/g State of UX 2026: "In 2026, trust will be a major design problem for AI experiences". Agents are "rolled out quickly, often before they are ready". Trust depends on transparency, user control, consistency and support when the system fails. — [NN/g](https://www.nngroup.com/articles/state-of-ux-2026/)
- **[Opinion, Feb 2026]** Smashing "Confidence Signal": a score, a declaration of scope, and visual cues. Proposed metrics are a calibration score (correlation between confidence and acceptance above 0.8) and "scrutiny delta" (review time on low- versus high-confidence plans). — [Smashing Magazine](https://smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/)

**Status of the established guideline sets**
- **[Primary/Secondary]** Microsoft HAX Toolkit still presents the original 18 Guidelines for Human-AI Interaction with patterns and examples, tied to products such as Copilot in Word and Outlook. No 2025–26 agent-specific revision was found. — [HAX Toolkit](https://www.microsoft.com/en-us/haxtoolkit/library/example,pattern/6,12,13,16/)
- **[Secondary]** Google PAIR People + AI Guidebook was published May 2019 and updated May 2021 (2nd edition, with worksheets). A Medium post titled "Updating the People + AI Guidebook in the age of generative AI" exists, but its date and content were not confirmed. No agent chapter was found. — [PAIR Guidebook](https://pair.withgoogle.com/guidebook); [PAIR Medium](https://medium.com/people-ai-research)
- **[Primary, Jun 2026]** The SAP study says Amershi et al.'s 18 guidelines target consumer products rather than enterprise workflows. It finds existing agent frameworks "mostly conceptual" with few empirically validated criteria, and UX, ML and governance views fragmented. Its eight principles, ranked by participants: human control; transparency and explainability; reliability, safety and robustness; context-awareness; collaborative partner; data privacy and governance; ecosystem integration; responsiveness and intuitiveness. — [arXiv 2606.18716](https://arxiv.org/html/2606.18716)
- **[Vendor, ms.date May 20 2026; preview]** Microsoft Learn "Design for agents" covers agent anatomy and entry points, three foundations (Responsible AI; accessibility and inclusion; human-centred design) and two levels of customization: foundational (icon, name) and extended (dialogs, streamed responses). The page metadata says `ai-usage: ai-generated`. — [Microsoft Learn](https://learn.microsoft.com/agents/design-guidelines/overview)
- **[Vendor, Apps SDK launched Oct 2025]** OpenAI Apps SDK UX and UI guidelines:
  - Design around the always-present composer.
  - Use inline cards, carousels and fullscreen only when visual interaction improves the workflow.
  - Don't overload picture-in-picture.
  - Use system colours, with brand colour only on accents.

  The docs now sit under "plugins". — [OpenAI UI guidelines](https://developers.openai.com/apps-sdk/concepts/ui-guidelines); [The New Stack](https://thenewstack.io/openai-launches-apps-sdk-for-chatgpt-a-new-app-platform/)
- **[Secondary, Mar 2026]** UXmatters: in the "Develop" stage of the double diamond, agentic work shifts from screens to designing logic loops, tool-use permissions and multi-agent handoffs. — [UXmatters](https://www.uxmatters.com/mt/archives/2026/03/next-gen-agentic-ai-in-ux-design-evolving-the-double-diamond-process.php)

### Inferences
- The sources agree on a checklist a design template can enforce. For each **action**, not each agent, set: risk and reversibility → autonomy level → approval point → undo window → what is logged. Smashing, the aiuxplayground guide and the SAP study all reject a single global autonomy toggle.
- Transparency should **adapt to trust and stakes**: show more for novices and high-stakes actions, collapse as trust builds. The SAP interviews and Anthropic's reported practice agree. That makes the transparency level itself a design decision with a planned path over time.
- **Accountability and disengagement** (Linear) and **"Branches", a visible path back** (Shape of AI) map directly onto Vellum's model: the person decides; there is a trail of decisions and rejected options; you can go back and try another path. Agent-design guidance treats these as trust mechanisms, not just convenience.
- Multi-agent role design (named agents with distinct jobs, like Scout, Strategist, Wright and Critic) is the least evidenced area. There is only opinion (WEF) and "unsolved" statements (Anthropic, Aug 2026). That is an opening, and also a risk: there is no validated pattern to copy.

### Gaps
- No 2025–26 agent-specific update to Microsoft HAX or Google PAIR could be confirmed. The PAIR generative-AI update post could not be dated.
- No NN/g article dedicated to agent *design patterns* was retrieved directly. Search summaries mention NN/g pieces dated Apr 3 2026 (agent definition), Apr 10 2026 ("AI Agents as Users") and Mar 27 2026 (generative UI), and a Nov 2026 Usability 101 rewrite reported by Interface Wire. None were read in full, and the NN/g "autonomy spectrum" claim is secondary only.
- No published Anthropic design guideline for agent UX was found, only interviews. Fast Company's "Inside Anthropic's biggest design choices" returned 403.
- No user-tested evidence on multi-agent role UI patterns was found.

---

## 2. What artifacts do designers produce for agent products, and how do they prototype non-deterministic behaviour?

### Takeaway
Agent design artifacts are shifting from screens to **behaviour specifications and quality definitions**:
- autonomy or permission policies;
- risk or failure-mode registers;
- action and audit-log designs;
- system prompts and capability prompts treated as design material;
- design-language specs that agents read (Figma Specs, Oct 2026);
- eval sets: prompt sets, golden sets, rubrics, assertions, failure patterns.

Non-determinism is handled by **prototyping with real models in code** (the code-first approach at Anthropic and Notion), by **Wizard-of-Oz** before a model exists, and by **evals** that make taste repeatable.

### Cited Findings
- **[Opinion, Feb 2026]** Smashing recommends three governance artifacts, overseen by a cross-functional "Agentic AI Ethics Council":
  - an **Agent Risk Register** of potential failure modes, owned by Product;
  - **Action Audit Logs**, reviewed regularly;
  - **Autonomy Policy Documentation** defining what the agent may and may not do.

  — [Smashing Magazine](https://smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/)
- **[Vendor, © 2026]** Microsoft Fluent 2 "Evaluating output quality" says designers help define what "good" means even if they don't run evals. They supply scenarios, quality criteria, examples and failure patterns that others formalize or automate.
  - Artifacts: prompt set (including ambiguous and edge cases), context or data set, rubric, golden set, assertions, failure patterns.
  - Steps: audience and scenario → data boundary → prompt set in real user language → define good → testable assertions → automated plus human review → refresh over time.
  - "Evals make human judgment more explicit and more repeatable."

  — [Microsoft Fluent 2](https://fluent2.microsoft.design/content-engineering/evaluating-output-quality/)
- **[Vendor, May 28 2025]** Figma's AI eval process (David Kossnick, Head of Product, AI):
  - Designers and PMs were deliberately included.
  - Success was defined per persona, scenario and expected deliverable.
  - Feedback came in widening circles: core team → designers and PMs on a FigJam board → company-wide "Bakeoffs" → alpha customers.
  - Rubric: a 1–4 **design score** plus a 1–4 **functionality score**.
  - Methods: deterministic scripts; contractors and employees scoring nightly builds against a **golden prompt set** with a brand guide of good and bad examples; an AI judge checked by humans; production A/B tests.
  - Quote: "The most important thing is humans, with taste, doing the evals."

  — [First Round Review](https://review.firstround.com/figma-ai-eval-process/)
- **[Opinion, date not confirmed]** Arin Bhowmick, SAP CDO, in Fast Company: designers are often brought in after engineers and PMs set eval criteria. "Help write the eval criteria before they're final… deciding which mistakes users can live with is our job, too." — [Fast Company](https://www.fastcompany.com/91632166/c_fit) (via search snippet)
- **[Opinion]** Reforge takes a counter-view on who owns the rubric: the PM writes it, engineering works out how to verify each criterion, and design owns how the experience feels. It also advises against having an LLM write the rubric. — [Reforge](https://www.reforge.com/blog/eval-rubrics)
- **[Vendor docs]** Chrome's AI eval docs: a rubric is a structured set of criteria a human or AI judge uses to score outputs. Pair rule-based checks for objective criteria (for example contrast ratio) with LLM-judge rubrics for subjective ones. — [Chrome for Developers](https://developer.chrome.com/docs/ai/evals/design)
- **[Primary, Jul 2026]** In Apple/CMU's AgentUXlab design probe, the designer's artifacts are:
  - a **Workflow Prompt**, generated from a node-based workflow and editable;
  - an **Agent Capabilities Prompt**;
  - a **User Information Prompt**;
  - "Other Instructions", previewed as the full system prompt.

  In other words, prompts are the spec. — [arXiv 2510.04452](https://arxiv.org/pdf/2510.04452)
- **[Primary, Jul 2026]** The same study found five activities in agent UX prototyping:
  - A1: design the scope and boundaries of the agent;
  - A2: design its information display;
  - A3: design agent–user interactions;
  - A4: run the prototype;
  - A5: understand its runtime behaviour.

  — [arXiv 2510.04452](https://arxiv.org/pdf/2510.04452)
- **[Vendor, Oct 14 2026]** Figma Specs is a Markdown editor where teams define their design language. It can link canvas elements, FigJam diagrams, code layers and designs, and teams and agents both reference it. This makes a design-intent document a first-class artifact that agents read. — [TechCrunch](https://techcrunch.com/2026/10/14/figma-announces-new-features-to-define-how-agents-work-on-its-platform/)
- **[Opinion, Aug 20 2026]** Anthropic (Lewenstein):
  - "Being close to the code and adopting a code-first, prototype-first mindset is really central."
  - Rough betas go out to collect feedback.
  - Before adding features, the team asks whether Claude can solve the problem through prompting alone.
  - Building flows and components is "largely automated", while deciding what to build and final polish stay human.

  — [IDEO](https://www.ideo.com/journal/crafting-the-last-mile-of-delight)
- **[Vendor, Oct 14 2026]** Figma CDO Loredana Crisan: "A lot of that code actually is not necessarily built to ship, but really built to discover what the product is." In other words, prototypes as a discovery medium. — [TechCrunch](https://techcrunch.com/2026/10/14/figma-announces-new-features-to-define-how-agents-work-on-its-platform/)
- **[Secondary, 2026]** Notion's design team uses Claude Code to turn Figma designs into working code. Working with real models is presented as necessary to "design something that's plausible and possible". — [Lenny's How I AI](https://www.lennysnewsletter.com/p/this-week-on-how-i-ai-how-notions)
- **[Secondary]** Intercom CPO Paul Adams describes a reversed process: start from what AI makes possible, prototype to test reliability, then design the UX. The old order was customer job → designed solution. — [SaaStr](https://www.saastr.com/why-most-b2b-companies-are-failing-at-ai-and-how-to-avoid-it-with-intercoms-cpo)
- **[Primary, Jul 2026]** Wizard-of-Oz is used to validate agent UX concepts. The Apple/CMU team checked its taxonomy with **20 end users using a Wizard-of-Oz computer-use agent**. — [arXiv 2510.04452](https://arxiv.org/pdf/2510.04452)
- **[Secondary, Oct 2025]** An HCI paper proposes "counterfactual replays and hybrid Wizard-of-Oz" for prototyping multimodal real-time GenAI agents. It notes designers struggle to form accurate mental models of AI capabilities. Tools such as PromptInfuser bring live AI into Figma-like mockups. — [arXiv 2510.06872](https://arxiv.org/pdf/2510.06872)
- **[Secondary, 2026 podcast]** Jenny Wen (Anthropic) reportedly says mocking up has fallen to 30–40% of design work, from 60–70% a few years ago. This is quoted second-hand; the episode is paywalled. — [Lenny's Newsletter](https://www.lennysnewsletter.com/p/the-design-process-is-dead-heres-whats-replacing-it) (Mar 1 2026 episode page)

### Inferences
- A 0-to-1 agent design template should produce, in roughly this order:
  1. problem and "is an agent even warranted" check, following Microsoft's "start with the user's problem; many problems don't need AI";
  2. agent role or persona card with capability scope;
  3. an action-by-risk autonomy matrix with approval points and undo windows;
  4. failure-mode / risk register;
  5. status, interrupt and notification spec;
  6. memory and consent spec;
  7. prompt or behaviour spec;
  8. eval kit: scenarios in real user language, golden set, two-axis rubric, failure patterns;
  9. Wizard-of-Oz script, then a real-model prototype.
- "Prompt as spec" plus "eval as definition of done" is the closest thing agent design has to a handoff document. Several sources (Fluent, Figma, Bhowmick) argue designers should own or co-own it.
- An artifact with a falsifiable test fits Vellum's Strategist, which proposes directions "each with a test it could fail". The eval rubric and Intent-Preview acceptance thresholds are ready-made "tests that could fail" for an agent design direction.

### Gaps
- No published, widely adopted standard template for an "agent spec", "autonomy matrix" or "capability map" was found. These exist as practitioner proposals.
- The PAIR worksheets and HAX workbook/playbook are older (2019–2021) artifact kits. Their agent relevance was not re-verified this session.
- Lenny's pieces with concrete processes are paywalled: Anshu Chimala (Sep 1 2026), Colin Matthews' team-prototyping guide, and the Jenny Wen transcript.

---

## 3. Which tools do designers use for this in 2026, and what do they say the tools cannot do for agents?

### Takeaway
In 2026 designers of agent products work across two kinds of tool:
- **canvas tools moving towards code and agents**: Figma's design agent, Figma Make, code layers (private beta Jun 24 2026 → open beta Oct 2026), Figma Specs and the MCP server; Claude Design (beta, Jul 2026);
- **code-first tools**: Claude Code and Cursor; v0, Lovable, Bolt and Replit for vibe-coded prototypes; node-based agent builders such as Zapier, n8n and OpenAI AgentBuilder.

The documented gaps:
- canvas tools can't natively run or debug non-deterministic agent behaviour over time;
- node-based notations are hard for designers to author;
- AI prototypers produce generic output that can't weigh trade-offs;
- agents lack product context and design intent;
- nobody has an interface for supervising many agents.

### Cited Findings
- **[Vendor, Jun 24 & Oct 14–15 2026]** Figma Config 2026:
  - Code layers announced in private beta (Jun 24 2026), then opened to public beta at Config India (Oct 14–15 2026). They are interactive prototypes backed by running code on the canvas.
  - The design agent was made available to more users, and Figma is adding tools to steer it towards "more predictable results" because "AI is non-deterministic".
  - Figma Specs launched.
  - More than 20 new tools are reachable through the MCP server.
  - Payload CMS is being integrated with Figma Make.

  — [TechCrunch](https://techcrunch.com/2026/10/14/figma-announces-new-features-to-define-how-agents-work-on-its-platform/); [Figma help: What's new from Config 2026](https://help.figma.com/hc/en-us/articles/39582753756695-What-s-new-from-Config-2026). Note: secondary sources disagree on dates. Config SF was Jun 24 2026 (CMSWire, Figma forum); Config India was Oct 15 2026.
- **[Secondary, Nov 2026]** Third-party reviews of Figma's agent say its output is non-deterministic and needs designer review. They also say native prototyping and interactions are listed as "coming soon", the agent can't export assets, and no API runs it from outside Figma. A Bitovi test found the agent ignores a linked design system unless told, and hardcodes variables by default. — [uichemy](https://uichemy.com/blog/figma-ai-agents/); [aiagentslist](https://www.aiagentslist.io/agents/figma-agent); [Bitovi](https://www.bitovi.com/blog/figma-just-opened-the-canvas-to-agents.-heres-what-actually-happens)
- **[Primary, Oct 24 2025; reviewed Aug 19 2026]** NN/g "AI Prototyping in Real Design Contexts" tested Figma Make, Stitch, Bolt, Lovable, Replit, v0 and Claude. Findings:
  - The tools "lack the sophistication to weigh design tradeoffs".
  - Broad prompts lead them to "fill in the gaps" with assumptions.
  - Output is "flat and interchangeable" and reflects training-data bias.
  - Polished AI prototypes can derail stakeholder discussions.
  - AI "magnifies the gap between okay results and exceptional ones."
  - Recommended use: ideation, proof-of-concept and rapid test prototypes, not production.

  — [NN/g](https://www.nngroup.com/articles/ai-prototyping/)
- **[Primary, Jul 2026]** The Apple/CMU requirements study (12 participants, 6 agent experts) lists six capabilities agent UX prototyping tools need:
  - C1: no-code interfaces;
  - C2: help constrain the agent's task space and knowledge of the user;
  - C3: define the agent's UI in the chat and the environment;
  - C4: components that let the agent invoke user interactions, such as confirmations;
  - C5: an environment to run and control the agent;
  - C6: help debugging runtime behaviour.

  Node-based workflow notations, the default in FlowForge, ChainForge, PromptChainer, Zapier, n8n and OpenAI AgentBuilder, were hard for participants to author. They worked better as a **visualization** of agent behaviour for debugging. Generative AI's huge output space makes it "particularly challenging as a design medium". — [arXiv 2510.04452](https://arxiv.org/pdf/2510.04452)
- **[Opinion, Aug 2026]** Lewenstein says the interface for managing hundreds or thousands of agent instances is unsolved, as is team collaboration ("collective chemistry remains unmediated by AI") and the next "unit of computing" after websites, apps and chatbots. — [IDEO](https://www.ideo.com/journal/crafting-the-last-mile-of-delight)
- **[Secondary, Apr 2026]** A UX Collective essay, reported second-hand, argues agents read code structure but lack product context and design intent. The result is implementations that are technically sound but strategically off-target. — [AIUX newsletter](https://www.aiuxdesign.guide/news/this-week-in-aiux-apr-20-this-week-in-aiux-design-tools-go-agentic)
- **[Vendor/Opinion, ~late 2025]** A Salesforce designer reports building multi-agent prototypes in Cursor, including MCP connectors, custom agents and agent-to-agent communication. Salesforce also proposes a unified view showing which agents are active on which platforms. — [Salesforce](https://www.salesforce.com/blog/ux-shift-to-agentic-experience-design/)
- **[Vendor, Jul 2026]** Claude Design (beta) is used by its designer, Nate Parrott, for early visual exploration, as "one click above product design" for communication and ideation. — [Claude blog](https://claude.com/blog/how-the-product-designer-who-built-claude-design-uses-it-to-explore-ideas-before-building-them)
- **[Secondary, 2026]** Reddit built an internal platform, "Reddit Proto", so designers and PMs can build production-like prototypes without touching GitHub. In other words, companies are building their own tools to fill this gap. — [Lenny's How I AI](https://www.lennysnewsletter.com/p/how-i-ai-claude-duet-honest-review)
- **[Primary, Oct 23 2026]** NN/g's AI-in-UX survey (n = 521): 54% cite output quality and 50% cite data security or privacy as major barriers. Of 226 open comments, 69% were partly negative, commonly that output "required significant time to check or correct". UX-specific tasks score low for AI use (1–5 scale): evaluating designs 2.59, testing with users 1.97, interviewing users 1.82. — [NN/g](https://www.nngroup.com/articles/ai-in-ux-survey-26/)
- **[Secondary, 2026 benchmark]** FigmaEval (agents producing native Figma UI) reports that evaluation is hard because design tasks are open-ended with no ground truth. Recurring failures are in asset adaptation, data-to-visual consistency and complex content organization. The arXiv ID could not be independently verified. — [arXiv 2611.32321](https://arxiv.org/html/2611.32321)

### Inferences
- The concrete gap list for a "design an agent" workflow:
  1. no canvas-native way to represent **behaviour over time**: states, approvals, interrupts, branches;
  2. no way to **run the real model inside the design artifact** and watch variance across runs, except code layers (beta) or leaving for code;
  3. no link between the design and its **eval rubric or test outcomes**;
  4. no **decision trail**: why this autonomy level, what was rejected;
  5. no **multi-agent supervision** model.

  Vellum's canvas, with its decision trail, rejected options and branches, targets gaps 3–5 that canvas design tools leave open.
- The Apple/CMU finding that node graphs are better for *seeing* agent behaviour than *authoring* it suggests a canvas should visualize agent flows and decisions, not force designers to program in nodes.

### Gaps
- No primary evidence was found for ProtoPie, Framer, Voiceflow, Miro or FigJam being used specifically for agent UX in 2026, or for designer complaints about them. Voiceflow, the main conversation-design tool, did not appear in results.
- No survey quantifies which tools agent designers use. Figma's 2026 AI report and NN/g's survey cover AI tool *use* by designers, not tools for *designing agents*.

---

## 4. How do designers test agent UX with users, and how do they measure success?

### Takeaway
Testing combines:
- classic qualitative methods, adapted to delegation and regaining control;
- Wizard-of-Oz before a model exists;
- simulated-misbehaviour and trust-calibration studies;
- conjoint or choice experiments on trust features;
- eval programmes in which designers' taste is turned into rubrics scored by humans and AI judges.

Proposed agent-specific metrics include: plan acceptance and override rates, reversion (undo) rate, escalation rate, calibration between confidence and acceptance, setting churn on the autonomy dial, and "why?" ticket volume. These are proposals, not industry benchmarks.

### Cited Findings
- **[Opinion, Feb 2026]** Smashing's research methods: trust-calibration studies, **simulated misbehaviour tests**, longitudinal interviews on evolving mental models, plan-recall tests, post-interaction microsurveys. Proposed metrics and thresholds:
  - acceptance ratio above 85%; override above 10% triggers a model review;
  - reversion above 5% means turn off automation for that task;
  - escalation healthy at 5–15%; recovery success above 90%;
  - calibration above 0.8;
  - "safety net conversion": users who move to autonomous mode within 7 days of using undo;
  - "why?" tickets per 1,000 users.

  — [Smashing Magazine](https://smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/)
- **[Primary, Jun 2026]** SAP's mixed methods for agent UX: expert review (5) and meta-analysis (28 sources), a participatory design workshop (21 people), a ranking survey (22), interviews (12), and a **conjoint experiment** (107 respondents, 1,139 tasks) to measure how much each trust feature counts. Transparency +37.8 pp; low-confidence warning +22.5 pp; pause not significant. — [arXiv 2606.18716](https://arxiv.org/html/2606.18716)
- **[Primary, Jul 2026]** Wizard-of-Oz validation with 20 end users, then a design-probe study with 14 participants running agent prototypes in a browser. — [arXiv 2510.04452](https://arxiv.org/pdf/2510.04452)
- **[Secondary]** Wizard-of-Oz suits AI because "the range of system responses are virtually impossible to replicate with traditional prototyping tools". Its limits: the human operator doesn't scale and must be consistent. — [AnswerLab](https://www.answerlab.com/insights/wizard-of-oz-testing); "Many Wizards of Oz" needs UXR, design and ML engineers working together — [UserTesting podcast](https://www.usertesting.com/resources/podcast/many-wizard-of-oz-ux-research-sam-howard)
- **[Vendor, May 2025]** Figma's human-rater model: contractors and employees score nightly builds on design and functionality (1–4 each) against a golden prompt set; an AI judge is checked by humans; A/B tests run in production. — [First Round Review](https://review.firstround.com/figma-ai-eval-process/)
- **[Vendor, 2026]** Microsoft Fluent: combine automated checks of observable requirements (for example, every claim links to a real source) with human review of whether output is useful and ready to act on, recording scores and failure reasons. — [Microsoft Fluent 2](https://fluent2.microsoft.design/content-engineering/evaluating-output-quality/)
- **[Secondary, Nov 2026]** NN/g's Usability 101 rewrite, per Interface Wire: the core method still holds. Agents raise new questions about how people delegate, understand agent behaviour and regain control. Five users still often surface most major issues. — [Interface Wire](https://interfacewire.com/articles/nielsen-norman-group-reworks-usability-101-for-the-ai-era)
- **[Secondary/Opinion]** LLM-simulated users are an emerging method, for example UXAgent (arXiv 2502.12561, Feb 2025), an LLM-agent usability testing framework. Its findings were not read. — [arXiv 2502.12561](https://arxiv.org/pdf/2502.12561)
- **[Primary, Oct 2026]** NN/g's survey shows practitioners use AI least for user testing (1.97/5) and interviewing (1.82/5), so human research methods are still largely manual. — [NN/g](https://www.nngroup.com/articles/ai-in-ux-survey-26/)

### Inferences
- A practical validation ladder for a 0-to-1 agent design:
  1. concept test with storyboards or Intent Preview mock-ups;
  2. Wizard-of-Oz sessions scripted with planned misbehaviours;
  3. a real-model prototype run on a golden scenario set with a two-axis rubric (outcome quality × experience/trust);
  4. a small longitudinal diary or pilot tracking override, undo and escalation rates and setting churn.

  Each step yields evidence that can be attached to a decision node in Vellum.
- The pause/stop control wasn't significant in the SAP conjoint, while transparency was. This suggests visible state and reasoning earn more trust than control affordances alone. It is one study (self-selected sample) and should be treated as a hypothesis to test.

### Gaps
- No published diary studies specific to agent UX were found.
- No industry benchmark values for agent UX metrics were found. The Smashing thresholds are one author's proposal.
- No source described how designers set up human-rater pools specifically for agent *behaviour*, as opposed to output, beyond Figma's example.

---

## 5. What is the evidence on demand: designers working on AI/agent products, job postings, courses and communities?

### Takeaway
Most product builders are now working on AI products, and agent-building had roughly doubled in Figma's 2025 data. Design roles are blending with development (21% → 41% of designers taking part in development, Figma Jun 2026). Agentic tools are already used by 71% of designers (NN/g, Oct 2026).

Job-market data for "AI product designer" or "agent designer" titles is thin and mostly point-in-time. US product-design postings recovered in 2026 (Academy UX), while big-tech design hiring is reportedly well below 2019 levels. Courses multiplied in 2026, mostly cohort-based (Maven, Designlab, GA, Coursera, Bentley). There is no recognized credential and no single agent-design community.

### Cited Findings
- **[Vendor survey, Jun 24 2026]** Figma 2026 AI report (Stafford & Johnston): 8,403 survey responses and 639 interviews over three years; 10 markets (Brazil, India and South Korea added).
  - Designers taking part in development doubled to **41% from 21%**; developers taking part in design rose 44% → 60%.
  - **41%** say AI meaningfully changes how teams work together (7% two years ago).
  - 90% say design is at least as important as before AI; nearly six in 10 say more important.
  - Adoption patterns: Unified 36%, Directive 27%, Grassroots 20%, Nascent 18%.

  — [Figma blog](https://www.figma.com/blog/2026-ai-report/); [report](https://www.figma.com/reports/2026-ai-report/)
- **[Secondary]** Secondary coverage says the share of Figma respondents building AI products or features rose from 23% to 65% in a year. This was not confirmed on Figma's page. — [mpost.io](https://mpost.io/figmas-2026-ai-report-as-role-boundaries-blur-design-emerges-as-the-new-competitive-edge/)
- **[Vendor survey, 2025; secondary confirmation]** Figma 2025 AI report (about 2,500 builders, 7 countries): **51%** of Figma users working on AI products were building agents, up from 21% the year before. — [Figma AI 2025 report](https://figma.com/reports/ai-2025/); [ADPList breakdown](https://adplist.substack.com/p/breakdown-figma-ai-report-2025)
- **[Primary, Oct 23 2026]** NN/g AI-in-UX survey (Rosala & Banawa; fieldwork Aug 24 – Sep 11 2026; n = 521 from 2,814 raw responses; convenience sample):
  - 99%+ have generative-AI access at work.
  - 66% use at least one agentic tool (48% agentic products, 47% coding agents or app builders).
  - Agentic use by role: ops 83%, PM 81%, engineering 71%, **design 71%**, research 57%, content 35%.
  - Agentic use by organization type: startups 85%, SMB 75%, enterprise 69%, agencies 61%, freelancers 57%.
  - Sentiment 3.57/5.
  - Job-security score: designers 2.99/5, PMs 3.81/5.
  - 65% expect their role to stay important or grow; 18% expect it to shrink.

  — [NN/g](https://www.nngroup.com/articles/ai-in-ux-survey-26/)
- **[Vendor survey, Feb 12 2026]** Figma State of the Designer 2026 (906 designers, NewtonX): 91% say AI tools improve their designs; 89% work faster. No statistic on designers building AI products. — [Figma blog](https://www.figma.com/blog/state-of-the-designer-2026/)
- **[Primary, Nov 1 2026]** Academy UX, US postings via the Adzuna API:
  - October 2026 total UX-family postings 68,915.
  - Product Design 20,726: −1.5% month on month, +22.8% over three months.
  - "AI Product Designer & Design Engineering" (design-engineering column 3,423, up from 2,977): **+15% month on month**.
  - UX Research 791 (−18% month on month).
  - Heat Score 74 "Warm"; September 2026 was 93 "Hot".

  The category label in the table is ambiguous. — [Academy UX](https://www.academyux.com/ux-job-market-hot-or-not)
- **[Snapshot counts, Oct 2026]** These are keyword searches and are noisy; they likely include engineering roles:
  - Glassdoor shows about 3,234 "AI agent designer" US results.
  - Indeed shows about 1,000–1,657 "AI product designer" listings; figures conflict across snippets.
  - ZipRecruiter shows a pay band of $131k–$188k for "AI Product Designer".

  — [Glassdoor](https://www.glassdoor.com/Job/ai-agent-designer-jobs-SRCH_IN1_KO0,17.htm); [Indeed](https://www.indeed.com/q-ai-product-designer-jobs.html); [ZipRecruiter](https://www.ziprecruiter.com/Jobs/Ai-Product-Designer)
- **[Unverified]** A blog reports +58% year-on-year growth through Q2 2026 in titles such as "AI Product Designer" and "Designer, AI Experiences", against 7% for traditional product design. Its method was not published. — [AI Talent Report](https://aitalentreport.blog/ai-product-designer-ux-ml-intersection/)
- **[Secondary]** SignalFire's 2026 data, cited in a Medium post: design hiring at 12 large tech companies is down 48% since 2019, while new job titles keep appearing. — [Medium / Design Bootcamp](https://medium.com/design-bootcamp/designer-hiring-at-big-tech-is-down-48-since-2019-new-job-titles-keep-appearing-d02260aa305f)
- **[Primary, Jan 16 2026]** NN/g State of UX 2026: the job market stabilized unevenly from late 2024 through 2025, with senior and generalist roles recovering faster than junior ones. 2026 stays competitive. Value shifts to judgment and to "designing AI experiences". "If you're just slapping together components from a design system, you're already replaceable by AI." — [NN/g](https://www.nngroup.com/articles/state-of-ux-2026/)
- **[Courses, 2026; schedules may be stale]**
  - Maven's agentic-AI design hub lists 12 live courses, including "UX Design for Agentic AI" taught by Rupa Chaturvedi. — [Maven hub](https://maven.com/learn/design/agentic-ai); [Maven course](https://maven.com/hcaiinstitute/ux-design-for-agentic-ai)
  - Designlab "Designing AI Products" (4 weeks, 3+ years' experience required) and "AI Agents for Work" ($1,199; Nov 13 2026 cohort). — [Designlab](https://designlab.com/advanced/designing-ai-products-course); [Designlab Workbench](https://designlab.com/workbench/ai-agents-course)
  - Bentley University "Prototyping Agentic UX". — [Designlab blog](https://designlab.com/blog/best-ai-agent-courses)
  - General Assembly "UX Design for AI Experiences". — [General Assembly](https://generalassemb.ly/students/courses/ux-design-for-ai-experiences)
  - Coursera "Agentic AI Content for Practitioners". — [Coursera](https://www.coursera.org/learn/agentic-ai-content-for-practitioners)
- **[Opinion, 2026]** OpenAI's head of product design, Ian Silber, calls this the best time to be a product designer. Lenny cites a survey that designers are the "most overwhelmed, anxious and least optimistic" roles in tech; the original survey was not seen. — [Lenny's Newsletter](https://lennysnewsletter.com/p/openais-head-of-design-this-is-the)
- **[Opinion, Aug 2026]** Anthropic's product design, research and content design team is about 30 people. — [IDEO](https://www.ideo.com/journal/crafting-the-last-mile-of-delight)

### Inferences
- Demand for the *skill* of agent UX design is well evidenced: most builders work on AI; agent-building doubled in 2025; designers already use agentic tools. Demand for a distinct *job title* is weakly evidenced. The role seems to be absorbed into "product designer" and "design engineer", consistent with designers moving into development (21% → 41%).
- For a one-person-company audience, the relevant market is designers and founders doing 0-to-1 agent products without a research team. They have the most to gain from built-in Wizard-of-Oz, eval and decision-trail scaffolding, given that NN/g finds AI barely used for user testing.

### Gaps
- No reliable international (non-US) job-posting time series for AI or agent designer titles was found. Academy UX is US-only, and the board counts are keyword snapshots.
- No count was found of how many designers work specifically on *agent* products in 2026. Figma's 2026 agent-building share was not visible on the public page; the last confirmed figure is 51% in the 2025 report.
- No dedicated, ongoing agent-UX design community (Slack, Discord, association) with membership numbers was found.
- No Figma Config 2026 talk transcripts on designing agent UX were retrieved.
