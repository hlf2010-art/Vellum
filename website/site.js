/* Vellum website: language, theme, the live board demo, and the small interactive bits. No dependencies. */
(function () {
  "use strict";

  // ---- Go-live settings -------------------------------------------------------------------
  // Fill these in to make Download and the waitlist real. While they're empty the page says so.
  var CONFIG = {
    downloads: {
      mac: "",   // e.g. "https://github.com/hlf2010-art/Vellum/releases/latest/download/Vellum-mac.dmg"
      win: ""    // e.g. "https://github.com/hlf2010-art/Vellum/releases/latest/download/Vellum-Setup.exe"
    },
    releasesPage: "https://github.com/hlf2010-art/Vellum/releases",
    waitlistEndpoint: "" // POST {email, use, lang} as JSON (Formspree, Buttondown, a Worker…)
  };

  var root = document.documentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  // ---- Copy -------------------------------------------------------------------------------
  var T = {
    en: {
      "skip": "Skip to content",
      "nav.how": "How it works", "nav.why": "Why Vellum", "nav.crew": "The crew", "nav.get": "Download",
      "cta.waitlist": "Join the waitlist", "cta.download": "Download Vellum",
      "hero.title": "The whiteboard that remembers why.",
      "hero.lede": "Vellum is a shared thinking space for you and AI. Lay out what you know, let agents argue the directions from different expert views, and keep every decision with the reason behind it.",
      "board.hint": "Drag the cards around", "board.replay": "Play again",
      "why.title": "Most AI canvases help you make more. Vellum helps you think it through.",
      "why.p1": "The best product meetings skip the slides and go straight to the whiteboard. You draw what you know, argue about what it means, and leave with a decision.",
      "why.p2": "Vellum is that whiteboard, with a memory. It keeps the context, the options you turned down and why, and it brings a decision back to you when the facts change.",
      "why.h1": "A generator canvas", "why.h2": "Vellum",
      "why.a1": "Forty images, no idea which one is right", "why.b1": "Three directions, each with what it rests on",
      "why.a2": "An assistant that agrees with you", "why.b2": "A crew that argues from different expert views",
      "why.a3": "Rejected ideas deleted or buried", "why.b3": "Set-aside ideas kept, with the reason",
      "why.a4": "A decision you can't explain next month", "why.b4": "A decision log that speaks up when new evidence lands",
      "how.title": "One board, four zones, left to right.",
      "how.lede": "Every board reads like a line of reasoning. Evidence on the left, a decision you can ship on the right, and every card in between linked to what it came from.",
      "how.l1": "Gather", "how.l1d": "Drop in what people did and said: interviews, reviews, photos, playtests. Scout reads it and marks how strong each piece is.",
      "how.l2": "Explore", "how.l2d": "Turn evidence into judgments, then fork a judgment into directions you can test. Pick one and the others stay, with why.",
      "how.l3": "Prototype", "how.l3d": "Branch prototypes from the direction you chose, using the image, video or code tools you already like.",
      "how.l4": "Snapshot", "how.l4d": "Freeze an edition to share. It carries the decision, the reasons and the evidence trail with it.",
      "p.title": "Built for thinking clearly, not for making more.",
      "p.1t": "Spatial context", "p.1d": "Where you put something is part of what it means. Snap cards together or draw a line between them, and the relation is recorded: supports, counters or refines.",
      "p.2t": "Collective intelligence", "p.2d": "Agents reason from distinct expert views instead of echoing you. The Strategist forks, the Critic objects, and you see the disagreement on the board.",
      "p.3t": "Decision memory", "p.3d": "Every decision keeps what you chose, why, what it rests on and what you set aside. Months later, you can still explain it.",
      "p.4t": "Continuous reasoning", "p.4d": "When new evidence lands, Vellum shows which decisions it touches and whether it supports or counters them. Reopen the choice, or note why it still holds.",
      "p.5t": "Human agency", "p.5d": "Agents can challenge a direction you confirmed. They never replace it. Nothing they draft lands on the board until you keep it.",
      "p.cap": "Snap two cards together and they're related. Pull them apart and the relation stays, drawn as a line.",
      "crew.title": "A crew that thinks with you, and sometimes against you.",
      "crew.lede": "Four agents with different jobs work on the same board you do. Each card shows who worked on it, so you always know where an idea came from.",
      "crew.scout": "Reads your sources and weighs the evidence: observed, reported, or just a guess.",
      "crew.scoutq": "Two of these seven sources are the same review, quoted twice.",
      "crew.strat": "Forks a judgment into directions you can actually test, and says what each one is betting on.",
      "crew.stratq": "If B is right, testers should find the lantern in under five seconds.",
      "crew.wright": "Builds the proof: a page, a storyboard, a render brief, an action list. Drafts wait for your OK.",
      "crew.wrightq": "Here's a foam mock-up plan for B. Keep or retry?",
      "crew.critic": "Checks the work against its sources and flags a direction that rests only on assumptions.",
      "crew.criticq": "Nothing on the board shows campers want a dial.",
      "crew.agency": "They can challenge your decision. Only you can make it.",
      "mode.focus": "Focus", "mode.listen": "Listening", "mode.team": "Teamwork",
      "mode.focusd": "Focus: the crew stays quiet while you think. They catch up when you're back.",
      "mode.listend": "Listening: the crew follows along and speaks up when something on the board doesn't add up.",
      "mode.teamd": "Teamwork: the crew drafts directions and proofs alongside you. Drafts wait for your OK.",
      "cases.title": "From evidence to prototype, whatever you make.",
      "cases.t1": "Product design", "cases.t2": "Short video", "cases.t3": "AI products",
      "get.title": "Why it's called Vellum.",
      "get.story": "Vellum is the translucent paper designers lay over a drawing. You trace the next idea on top, and the earlier lines stay visible underneath. That's how decisions work here.",
      "get.dl": "Get the app", "get.dld": "Early builds for macOS and Windows.",
      "get.mac": "Download for macOS", "get.win": "Windows",
      "get.dlpending": "The first public build isn't out yet. These buttons open the releases page on GitHub.",
      "get.dlready": "Opens the latest release.",
      "get.wl": "Join the waitlist", "get.wld": "We'll write when there's a new build worth trying. No newsletter.",
      "get.email": "Email", "get.use": "Mostly for", "get.other": "Something else",
      "get.thanks": "You're on the list.",
      "get.thanksd": "We'll email {email} when a build is ready.",
      "get.thankspreview": "This is a preview, so {email} wasn't sent anywhere. Sign-ups go live once the waitlist is connected.",
      "get.bademail": "Enter an email address like name@example.com.",
      "get.fail": "That didn't go through. Check your connection and try again.",
      "get.placeholder": "Preview: sign-ups aren't sent anywhere yet.",
      "foot.tag": "A shared thinking space for humans and AI."
    },
    zh: {
      "skip": "跳到正文",
      "nav.how": "怎么用", "nav.why": "为什么是 Vellum", "nav.crew": "AI 伙伴", "nav.get": "下载",
      "cta.waitlist": "加入等候名单", "cta.download": "下载 Vellum",
      "hero.title": "会记住「为什么」的白板。",
      "hero.lede": "Vellum 是人类与 AI 共同思考的空间。把你知道的摆上白板，让不同专业视角的 AI 伙伴推演方向，每个决定都连同它的理由一起留下。",
      "board.hint": "卡片可以随意拖动", "board.replay": "再看一遍",
      "why.title": "多数 AI 画布帮你产出更多。Vellum 帮你想得更清楚。",
      "why.p1": "最好的产品讨论不放 PPT，直接上白板。把已知的画出来，争论它意味着什么，最后带着决定离开。",
      "why.p2": "Vellum 就是这块白板，而且它有记忆。它留住上下文、你放弃的选项和放弃的理由；事实变了，它会把相关的决定重新摆到你面前。",
      "why.h1": "生成式画布", "why.h2": "Vellum",
      "why.a1": "四十张图，不知道哪张对", "why.b1": "三个方向，每个都写明依据",
      "why.a2": "一个总附和你的助手", "why.b2": "一组从不同专业视角争论的伙伴",
      "why.a3": "被否的想法删掉或埋没", "why.b3": "搁置的想法留着，附上理由",
      "why.a4": "下个月就说不清的决定", "why.b4": "新证据出现时会主动提醒的决策记录",
      "how.title": "一块白板，四个区域，从左到右。",
      "how.lede": "每块白板读起来都是一条推理线：左边是证据，右边是可以交付的决定，中间每张卡片都连着它的来处。",
      "how.l1": "收集", "how.l1d": "放进人们做了什么、说了什么：访谈、评论、照片、试玩记录。Scout 会读完并标出每条证据有多可靠。",
      "how.l2": "探索", "how.l2d": "把证据变成判断，再把判断分叉成可以验证的方向。选定一个，其余的连同理由一起保留。",
      "how.l3": "原型", "how.l3d": "从选定的方向分出原型，用你习惯的图像、视频或代码工具。",
      "how.l4": "定稿", "how.l4d": "冻结一个版本拿去分享。决定、理由和证据链都跟着它走。",
      "p.title": "为想清楚而做，不为产出更多。",
      "p.1t": "空间语境", "p.1d": "东西放在哪，本身就是含义的一部分。把卡片吸附在一起或连一条线，关系就被记下来：支持、反驳或细化。",
      "p.2t": "集体智能", "p.2d": "AI 伙伴从各自的专业视角推理，而不是附和你。Strategist 分叉方向，Critic 提出反对，分歧就摆在白板上。",
      "p.3t": "决策记忆", "p.3d": "每个决定都记着选了什么、为什么、依据是什么、搁置了哪些。几个月后你依然讲得清楚。",
      "p.4t": "持续推理", "p.4d": "新证据进来时，Vellum 会指出它影响哪些决定，是支持还是反驳。你可以重新讨论，或写下为什么依然成立。",
      "p.5t": "人的主导", "p.5d": "AI 伙伴可以质疑你确认过的方向，但永远不会替你改掉它。它们起草的任何内容，都要你点头才会留在白板上。",
      "p.cap": "两张卡片吸附在一起，就建立了关系。拉开它们，关系仍在，以连线显示。",
      "crew.title": "和你一起想的伙伴，有时也会和你唱反调。",
      "crew.lede": "四个分工不同的 AI 伙伴和你在同一块白板上工作。每张卡片都标着谁参与过，你总能知道一个想法从哪来。",
      "crew.scout": "阅读你的资料并衡量证据：是亲眼观察、他人转述，还是只是猜测。",
      "crew.scoutq": "这七条来源里有两条是同一篇评论，被引用了两次。",
      "crew.strat": "把一个判断分叉成真正能验证的方向，并说明每个方向押注的是什么。",
      "crew.stratq": "如果 B 是对的，测试者应该能在五秒内找到营灯。",
      "crew.wright": "把方向做成可以看的东西：页面、分镜、渲染需求、行动清单。草稿等你确认。",
      "crew.wrightq": "这是 B 的泡沫手板方案。保留还是重来？",
      "crew.critic": "对照来源检查成果，并指出只建立在假设上的方向。",
      "crew.criticq": "白板上没有任何证据表明露营者想要旋钮。",
      "crew.agency": "它们可以质疑你的决定，但只有你能做决定。",
      "mode.focus": "专注", "mode.listen": "旁听", "mode.team": "协作",
      "mode.focusd": "专注：你思考时伙伴们保持安静，等你回来再同步。",
      "mode.listend": "旁听：伙伴们跟着看，发现白板上有说不通的地方时才开口。",
      "mode.teamd": "协作：伙伴们和你一起起草方向和原型，草稿等你确认。",
      "cases.title": "从证据到原型，不管你做什么。",
      "cases.t1": "产品设计", "cases.t2": "短视频", "cases.t3": "AI 产品",
      "get.title": "为什么叫 Vellum。",
      "get.story": "Vellum 是设计师覆在图纸上的半透明描图纸。你在上面描下一个想法，下面原来的线条依然看得见。这里的决定也是这样。",
      "get.dl": "下载应用", "get.dld": "macOS 和 Windows 早期版本。",
      "get.mac": "下载 macOS 版", "get.win": "Windows",
      "get.dlpending": "第一个公开版本还没发布。这两个按钮会打开 GitHub 上的发布页。",
      "get.dlready": "打开最新版本。",
      "get.wl": "加入等候名单", "get.wld": "有值得一试的新版本时我们会写信给你。不发通讯。",
      "get.email": "邮箱", "get.use": "主要用来做", "get.other": "其他",
      "get.thanks": "你已在名单上。",
      "get.thanksd": "版本准备好后，我们会发邮件到 {email}。",
      "get.thankspreview": "这是预览版，{email} 没有被发送到任何地方。接入等候名单服务后才会真正登记。",
      "get.bademail": "请输入邮箱地址，例如 name@example.com。",
      "get.fail": "提交没有成功。请检查网络后再试一次。",
      "get.placeholder": "预览：报名信息暂不会发送到任何地方。",
      "foot.tag": "人类与 AI 共同思考的空间。"
    }
  };

  // Board demo copy. The example is a camping lantern: product design is Vellum's first use case.
  var BOARD = {
    en: {
      steps: ["Evidence", "Judgment", "Directions", "Decision", "New evidence"],
      captions: [
        "Start with what you know. Field notes, reviews and quotes go on the board as evidence.",
        "Say what it means. A judgment rests on the evidence under it, and you can see exactly which.",
        "The Strategist forks it into directions you can test. The Critic pushes back on one.",
        "You choose B. The directions you set aside stay readable, each with its reason.",
        "New evidence counters B. Vellum flags it on the decision. Reopen the choice, or say why it still holds."
      ],
      reopened: "Reopened. Nothing was lost: A and C still carry the reasons you set them aside, and B keeps its history.",
      held: "Still holds. Your reason is saved next to the counter-evidence, so the next person sees both.",
      cards: {
        e1: { k: "Observed", t: "Field notes", b: "8 of 10 campers hung the lantern from the tent loop.", by: "You" },
        e2: { k: "Reported", t: "Reviews", b: "“Blinding at arm's length.” 41 mentions.", by: "Scout" },
        e3: { k: "Said", t: "Interview", b: "“I just want to find it in the dark.”", by: "You" },
        j1: { k: "Judgment", t: "It's used hanging, up close, after dark.", b: "Rests on 3 sources, mostly observed.", by: "You + Scout" },
        dA: { k: "Direction", t: "Shade dial", b: "Twist a hood to dim it.", by: "Strategist" },
        dB: { k: "Direction", t: "Hook-first, warm low glow", b: "Hook on top, 2200K glow at 40 lumens.", by: "Strategist" },
        dC: { k: "Direction", t: "Glow-ring locator", b: "A faint ring so you can find it at night.", by: "Strategist" },
        st: { k: "Critic", b: "A dial is hard to turn in gloves, and nothing here says people want one." },
        n1: { k: "Observed · new", t: "Field test", b: "The hook slips on thin guylines.", by: "You" }
      },
      adopted: "<strong>Adopted by you.</strong> Why: it fits how 8 of 10 campers actually hang it.",
      asideA: "<strong>Set aside.</strong> Hard to use in gloves.",
      asideC: "<strong>Set aside.</strong> Solves finding it, not the glare.",
      back: "Back in play",
      flagH: "New since you decided: 1 counter",
      reopen: "Reopen the choice", holds: "Still holds",
      heldNote: "Still holds. You noted: a wider hook mouth fixes it.",
      reopenedNote: "Reopened. A and C are back in play.",
      supports: "supports", counters: "counters"
    },
    zh: {
      steps: ["证据", "判断", "方向", "决定", "新证据"],
      captions: [
        "从你知道的开始。实地记录、用户评论和访谈原话，都作为证据放上白板。",
        "说出它意味着什么。判断建立在下面的证据上，具体是哪几条一目了然。",
        "Strategist 把判断分叉成可验证的方向，Critic 对其中一个提出反对。",
        "你选了 B。被搁置的方向依然清晰可读，每个都附着理由。",
        "新证据反驳了 B，Vellum 在决定上标了出来。你可以重新讨论，或写下为什么依然成立。"
      ],
      reopened: "已重新讨论。什么都没丢：A 和 C 还带着当初被搁置的理由，B 也保留着它的历史。",
      held: "依然成立。你的理由和反驳证据保存在一起，下一个人能同时看到两者。",
      cards: {
        e1: { k: "观察", t: "实地记录", b: "10 位露营者中有 8 位把营灯挂在帐篷挂环上。", by: "你" },
        e2: { k: "转述", t: "用户评论", b: "“近距离太刺眼。” 41 条提到。", by: "Scout" },
        e3: { k: "原话", t: "访谈", b: "“我只想在黑暗里找得到它。”", by: "你" },
        j1: { k: "判断", t: "它是挂着用的，近距离，在天黑以后。", b: "依据 3 条来源，大多是观察。", by: "你 + Scout" },
        dA: { k: "方向", t: "遮光旋钮", b: "转动灯罩来调暗。", by: "Strategist" },
        dB: { k: "方向", t: "挂钩优先，暖色低光", b: "顶部挂钩，2200K 暖光，40 流明。", by: "Strategist" },
        dC: { k: "方向", t: "夜光定位环", b: "一圈微光，夜里也能找到它。", by: "Strategist" },
        st: { k: "Critic", b: "戴手套很难拧旋钮，而且这里没有证据表明有人想要旋钮。" },
        n1: { k: "观察 · 新", t: "实地测试", b: "挂钩在细的防风绳上会滑脱。", by: "你" }
      },
      adopted: "<strong>由你采纳。</strong>理由：它符合 10 位露营者中 8 位的真实挂法。",
      asideA: "<strong>已搁置。</strong>戴手套不好用。",
      asideC: "<strong>已搁置。</strong>解决的是找灯，不是刺眼。",
      back: "重新纳入考虑",
      flagH: "决定之后的新情况：1 条反驳",
      reopen: "重新讨论", holds: "依然成立",
      heldNote: "依然成立。你的备注：把挂钩开口加宽就能解决。",
      reopenedNote: "已重新讨论。A 和 C 重新纳入考虑。",
      supports: "支持", counters: "反驳"
    }
  };

  var CASES = {
    en: {
      product: {
        lede: "From field notes to a hardware or app concept. Interviews, teardown photos and usability notes become directions you can sketch, render and put in someone's hands.",
        also: "Works for physical products and digital ones, and the launch content that goes with them.",
        trail: [
          ["Evidence", "8 of 10 campers hang the lantern", "Field notes and 41 reviews", ""],
          ["Judgment", "It's used up close, after dark", "Rests on 3 sources", "ink"],
          ["Direction", "Hook-first, warm low glow", "Chosen over a shade dial and a glow ring, with reasons", "pick"],
          ["Prototype", "Foam mock-up and a 2200K light test", "Wright drafts the plan, you keep it", ""],
          ["Snapshot", "Concept v1 for the factory call", "Ships with the decision trail", ""]
        ]
      },
      video: {
        lede: "A 10 to 20 second piece, from concept to cut. Audience notes and references become a hook worth testing, shots come from the video models you already use, and the cut you keep has a reason.",
        also: "Vellum orchestrates the generators. It doesn't try to replace them.",
        trail: [
          ["Evidence", "Comments say the intro drags", "Retention drops at second 3", ""],
          ["Judgment", "People need the payoff first", "Rests on analytics and 60 comments", "ink"],
          ["Direction", "Open on the finished result", "Chosen over a voice hook and a text card", "pick"],
          ["Prototype", "Storyboard, then three generated takes", "Using your own video models", ""],
          ["Snapshot", "Final 15-second cut", "With why this hook won", ""]
        ]
      },
      ai: {
        lede: "Design an AI feature the way you'd test it. Failure cases are the evidence, evals are the tests, and each prompt direction says what it's betting on.",
        also: "Copilot sits beside each step, so the reasoning around the model is as visible as the model.",
        trail: [
          ["Evidence", "Users rewrite 6 of 10 drafted replies", "Logged failure cases", ""],
          ["Judgment", "Tone is the problem, not facts", "Rests on 40 rewrites", "ink"],
          ["Direction", "Mirror the sender's register", "Chosen over a tone slider and templates", "pick"],
          ["Prototype", "Prompt plus a 50-case eval set", "Critic checks results against the cases", ""],
          ["Snapshot", "Spec for the next sprint", "With the evals that justify it", ""]
        ]
      }
    },
    zh: {
      product: {
        lede: "从实地记录到硬件或 App 概念。访谈、拆解照片和可用性记录，变成可以画草图、做渲染、交到用户手里的方向。",
        also: "实体产品和数字产品都适用，配套的发布内容也一样。",
        trail: [
          ["证据", "10 位露营者中 8 位会把营灯挂起来", "实地记录和 41 条评论", ""],
          ["判断", "它是近距离、天黑后使用的", "依据 3 条来源", "ink"],
          ["方向", "挂钩优先，暖色低光", "相比遮光旋钮和定位环被选中，理由都在", "pick"],
          ["原型", "泡沫手板和 2200K 光测试", "Wright 起草方案，你决定保留", ""],
          ["定稿", "给工厂沟通用的概念 v1", "附带完整的决策链", ""]
        ]
      },
      video: {
        lede: "10 到 20 秒的作品，从概念到成片。观众反馈和参考素材变成值得验证的开头，镜头来自你已经在用的视频模型，最终留下的剪辑有它的理由。",
        also: "Vellum 负责编排生成模型，而不是取代它们。",
        trail: [
          ["证据", "评论说开头太拖", "第 3 秒留存明显下降", ""],
          ["判断", "观众要先看到结果", "依据数据和 60 条评论", "ink"],
          ["方向", "直接以成品画面开场", "相比口播开头和文字卡被选中", "pick"],
          ["原型", "分镜，然后生成三个版本", "用你自己的视频模型", ""],
          ["定稿", "15 秒最终剪辑", "附带这个开头胜出的原因", ""]
        ]
      },
      ai: {
        lede: "像测试一样设计 AI 功能。失败案例就是证据，评测就是测试，每个提示词方向都写明它押注的是什么。",
        also: "Copilot 陪在每一步旁边，模型周围的推理和模型本身一样看得见。",
        trail: [
          ["证据", "用户重写了 10 条草稿回复中的 6 条", "记录下的失败案例", ""],
          ["判断", "问题在语气，不在事实", "依据 40 次重写", "ink"],
          ["方向", "跟随发件人的语气", "相比语气滑块和模板被选中", "pick"],
          ["原型", "提示词加 50 条评测集", "Critic 对照案例检查结果", ""],
          ["定稿", "下个迭代的需求说明", "附带支撑它的评测", ""]
        ]
      }
    }
  };

  var lang = root.lang === "zh-CN" ? "zh" : "en";
  function t(key) { return (T[lang] && T[lang][key]) || T.en[key] || ""; }

  function applyCopy() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var v = t(el.getAttribute("data-i18n"));
      if (v) el.textContent = v;
    });
    document.querySelectorAll(".lang-btn span").forEach(function (s) { s.classList.toggle("on", s.getAttribute("data-l") === lang); });
    document.title = lang === "zh" ? "Vellum：会记住「为什么」的白板" : "Vellum: the whiteboard that remembers why";
    document.getElementById("langBtn").setAttribute("aria-label", lang === "zh" ? "Switch to English" : "切换到中文");
    updateShot();
    renderCases();
    renderMode();
    renderDownloads();
    board.relabel();
  }

  // ---- Theme ------------------------------------------------------------------------------
  function effectiveTheme() {
    var set = root.getAttribute("data-theme");
    if (set) return set;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.getElementById("themeBtn").addEventListener("click", function () {
    var next = effectiveTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    store.set("vellum-site-theme", next);
    updateShot();
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", updateShot);

  document.getElementById("langBtn").addEventListener("click", function () {
    lang = lang === "zh" ? "en" : "zh";
    root.lang = lang === "zh" ? "zh-CN" : "en";
    store.set("vellum-site-lang", lang);
    applyCopy();
  });

  // Header hairline once the page scrolls.
  var head = document.querySelector(".site-head");
  window.addEventListener("scroll", function () { head.classList.toggle("scrolled", window.scrollY > 8); }, { passive: true });

  // ---- The live board ---------------------------------------------------------------------
  var board = (function () {
    var el = document.getElementById("board");
    var stage = document.getElementById("stage");
    var svg = document.getElementById("lines");
    var stepsEl = document.getElementById("steps");
    var caption = document.getElementById("caption");
    var replayBtn = document.getElementById("replay");

    // Card positions in board units, for a wide and a narrow board.
    var LAYOUT = {
      wide: { w: 1180, h: 720, pos: {
        e1: [24, 40, 210], e2: [24, 256, 210], e3: [24, 486, 210],
        j1: [300, 262, 240],
        st: [322, 44, 190],
        dA: [600, 40, 236], dC: [600, 430, 236],
        dB: [880, 150, 272], n1: [902, 566, 220]
      } },
      narrow: { w: 380, h: 1070, pos: {
        e1: [14, 16, 168], e2: [198, 16, 168], e3: [14, 180, 168],
        j1: [198, 190, 168],
        dA: [14, 396, 168], st: [206, 374, 156], dB: [198, 522, 168],
        dC: [14, 650, 168], n1: [14, 902, 168]
      } }
    };
    var mode = null, scale = 1, step = -1, timer = null, playing = false, played = false, resolved = null;
    var cards = {}, moved = {};
    var RELS = [
      { a: "e1", b: "j1", type: "supports", at: 1, tag: true },
      { a: "e2", b: "j1", type: "supports", at: 1 },
      { a: "e3", b: "j1", type: "supports", at: 1 },
      { a: "j1", b: "dA", type: "related", at: 2 },
      { a: "j1", b: "dB", type: "related", at: 2 },
      { a: "j1", b: "dC", type: "related", at: 2 },
      { a: "st", b: "dA", type: "counters", at: 2 },
      { a: "n1", b: "dB", type: "counters", at: 4, tag: true }
    ];
    var SHOW = { e1: 0, e2: 0, e3: 0, j1: 1, dA: 2, dB: 2, dC: 2, st: 2, n1: 4 };
    var CREW = { "Scout": "var(--crew-scout)", "Strategist": "var(--crew-strategist)", "You": "var(--label)", "你": "var(--label)" };

    function L() { return BOARD[lang]; }

    function build() {
      Object.keys(SHOW).forEach(function (id) {
        var c = document.createElement("div");
        c.className = "bcard";
        if (id === "j1" || id[0] === "d") c.classList.add("ink");
        if (id === "st") c.classList.add("sticky");
        c.dataset.id = id;
        c.innerHTML = '<div class="k"><i></i><span class="kk"></span></div>' +
          (id === "st" ? "" : '<div class="t"></div>') + '<div class="b"></div>' +
          (id === "st" ? "" : '<div class="by"></div>') +
          (id[0] === "d" ? '<div class="note"></div><span class="back-chip"></span>' : "") +
          (id === "dB" ? '<div class="flag" role="group"><div class="fh"></div><div class="fb"><button type="button" class="reopen"></button><button type="button" class="holds"></button></div></div>' : "");
        stage.appendChild(c);
        cards[id] = c;
        drag(c);
      });
      cards.dB.querySelector(".reopen").addEventListener("click", function (e) { e.stopPropagation(); resolve("reopen"); });
      cards.dB.querySelector(".holds").addEventListener("click", function (e) { e.stopPropagation(); resolve("holds"); });
      L().steps.forEach(function (_, i) {
        var li = document.createElement("li");
        li.innerHTML = '<button type="button"><span class="n">' + (i + 1) + '</span><span class="lbl"></span></button>';
        li.firstChild.addEventListener("click", function () { stop(); played = true; resolved = null; go(i, true); });
        stepsEl.appendChild(li);
      });
      replayBtn.addEventListener("click", function () { reset(); play(); });
    }

    function relabel() {
      var l = L();
      Object.keys(cards).forEach(function (id) {
        var c = cards[id], d = l.cards[id];
        var letter = { dA: "A", dB: "B", dC: "C" }[id];
        c.querySelector(".kk").textContent = d.k;
        var tt = c.querySelector(".t");
        if (tt) tt.innerHTML = (letter ? '<span class="chip ' + letter + '">' + letter + "</span>" : "") + esc(d.t);
        c.querySelector(".b").textContent = d.b;
        var by = c.querySelector(".by");
        if (by) {
          var who = d.by.split(" + ");
          by.innerHTML = who.map(function (w) {
            var col = CREW[w] || "var(--label-2)";
            return '<b style="background:' + col + (col === "var(--label)" ? ";color:var(--canvas)" : "") + '">' + esc(w.charAt(0)) + "</b>";
          }).join("") + "<span>" + esc(d.by) + "</span>";
        }
      });
      cards.dB.querySelector(".fh").textContent = resolved === "holds" ? l.heldNote : resolved === "reopen" ? l.reopenedNote : l.flagH;
      cards.dB.querySelector(".reopen").textContent = l.reopen;
      cards.dB.querySelector(".holds").textContent = l.holds;
      cards.dA.querySelector(".back-chip").textContent = "↺ " + l.back;
      cards.dC.querySelector(".back-chip").textContent = "↺ " + l.back;
      setNotes();
      stepsEl.querySelectorAll(".lbl").forEach(function (s, i) { s.textContent = l.steps[i]; });
      el.setAttribute("aria-label", lang === "zh" ? "Vellum 白板演示：决定一盏露营灯该怎么设计" : "A Vellum board deciding how a camping lantern should work");
      setCaption();
      layout();
    }

    function setNotes() {
      var l = L();
      cards.dB.querySelector(".note").innerHTML = l.adopted;
      cards.dA.querySelector(".note").innerHTML = l.asideA;
      cards.dC.querySelector(".note").innerHTML = l.asideC;
    }

    function setCaption() {
      var l = L();
      if (step < 0) { caption.textContent = ""; return; }
      caption.textContent = resolved === "reopen" ? l.reopened : resolved === "holds" ? l.held : l.captions[step];
    }

    function layout() {
      var nextMode = el.clientWidth < 720 ? "narrow" : "wide";
      if (nextMode !== mode) { mode = nextMode; moved = {}; }
      var lay = LAYOUT[mode];
      scale = el.clientWidth / lay.w;
      stage.style.width = lay.w + "px";
      stage.style.height = lay.h + "px";
      stage.style.transform = "scale(" + scale + ")";
      el.style.height = Math.round(lay.h * scale) + "px";
      svg.setAttribute("viewBox", "0 0 " + lay.w + " " + lay.h);
      svg.setAttribute("width", lay.w); svg.setAttribute("height", lay.h);
      Object.keys(cards).forEach(function (id) {
        var p = moved[id] || lay.pos[id];
        var c = cards[id];
        c.style.left = p[0] + "px"; c.style.top = p[1] + "px"; c.style.width = lay.pos[id][2] + "px";
      });
      drawLines(false);
    }

    function box(id) {
      var c = cards[id];
      return { x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight };
    }
    function anchor(a, b) {
      // Leave from the side of A facing B, arrive on the side of B facing A.
      var ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      var dx = bc.x - ac.x, dy = bc.y - ac.y;
      var horiz = Math.abs(dx) > (a.w + b.w) / 2 * 0.9;
      if (horiz) {
        var s = dx > 0 ? 1 : -1;
        var p1 = { x: s > 0 ? a.x + a.w : a.x, y: ac.y }, p2 = { x: s > 0 ? b.x : b.x + b.w, y: bc.y };
        var k = Math.max(40, Math.abs(p2.x - p1.x) * 0.45);
        return { d: "M" + p1.x + " " + p1.y + " C" + (p1.x + s * k) + " " + p1.y + "," + (p2.x - s * k) + " " + p2.y + "," + p2.x + " " + p2.y, m: mid(p1, p2) };
      }
      var v = dy > 0 ? 1 : -1;
      var q1 = { x: ac.x, y: v > 0 ? a.y + a.h : a.y }, q2 = { x: bc.x, y: v > 0 ? b.y : b.y + b.h };
      var kk = Math.max(30, Math.abs(q2.y - q1.y) * 0.45);
      return { d: "M" + q1.x + " " + q1.y + " C" + q1.x + " " + (q1.y + v * kk) + "," + q2.x + " " + (q2.y - v * kk) + "," + q2.x + " " + q2.y, m: mid(q1, q2) };
    }
    function mid(p, q) { return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; }

    var paths = {};
    function drawLines(animateNew) {
      RELS.forEach(function (r, i) {
        var key = "r" + i;
        var visible = step >= r.at;
        var p = paths[key];
        if (!visible) {
          if (p) { p.path.remove(); if (p.tag) p.tag.remove(); delete paths[key]; }
          return;
        }
        var g = anchor(box(r.a), box(r.b));
        if (!p) {
          var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("class", r.type);
          svg.appendChild(path);
          p = paths[key] = { path: path };
          if (animateNew && !reduced) {
            path.setAttribute("pathLength", "1");
            path.classList.add("draw");
            setTimeout(function () { path.removeAttribute("pathLength"); path.classList.remove("draw"); path.classList.add("settled"); }, 760);
          } else path.classList.add("settled");
          if (r.tag) {
            var tag = document.createElement("span");
            tag.className = "rel-tag " + r.type;
            stage.appendChild(tag);
            p.tag = tag;
            requestAnimationFrame(function () { tag.classList.add("on"); });
          }
        }
        p.path.setAttribute("d", g.d);
        p.path.classList.toggle("dim", r.b === "dB" && r.a === "j1" ? false : (step >= 3 && !resolved && (r.b === "dA" || r.b === "dC") && r.type === "related"));
        if (p.tag) { p.tag.textContent = L()[r.type]; p.tag.style.left = g.m.x + "px"; p.tag.style.top = g.m.y + "px"; }
      });
      drawLoop(animateNew);
    }

    // A marker loop around the chosen card, like circling it on a whiteboard.
    var loop = null;
    function drawLoop(animate) {
      var want = step >= 3 && resolved !== "reopen";
      if (!want) { if (loop) { loop.remove(); loop = null; } return; }
      var b = box("dB"), cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w / 2 + 17, ry = b.h / 2 + 17;
      var pts = [], N = 64;
      for (var i = 0; i <= N + 7; i++) {
        var a = -2.2 + (i / N) * Math.PI * 2;
        var wob = 1 + 0.025 * Math.sin(a * 2 + 0.6) + (i > N ? 0.06 * (i - N) / 7 : 0);
        var co = Math.cos(a), si = Math.sin(a), e = 2 / 4; // superellipse: hugs a card like a hand-drawn loop
        pts.push([cx + Math.sign(co) * Math.pow(Math.abs(co), e) * rx * wob, cy + Math.sign(si) * Math.pow(Math.abs(si), e) * ry * wob]);
      }
      var d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
      for (var j = 1; j < pts.length - 1; j++) {
        var mx = (pts[j][0] + pts[j + 1][0]) / 2, my = (pts[j][1] + pts[j + 1][1]) / 2;
        d += " Q" + pts[j][0].toFixed(1) + " " + pts[j][1].toFixed(1) + " " + mx.toFixed(1) + " " + my.toFixed(1);
      }
      if (!loop) {
        loop = document.createElementNS("http://www.w3.org/2000/svg", "path");
        loop.setAttribute("class", "marker");
        svg.appendChild(loop);
        if (animate && !reduced) {
          loop.setAttribute("pathLength", "1");
          loop.classList.add("draw-slow");
          var l = loop;
          setTimeout(function () { l.removeAttribute("pathLength"); l.classList.remove("draw-slow"); }, 1300);
        }
      }
      loop.setAttribute("d", d);
      loop.setAttribute("transform", "rotate(-1.6 " + cx.toFixed(1) + " " + cy.toFixed(1) + ")");
    }

    function go(n, animate) {
      var prev = step;
      step = n;
      if (n < 4) resolved = null;
      Object.keys(cards).forEach(function (id) {
        var c = cards[id];
        var on = SHOW[id] <= n;
        if (on && !c.classList.contains("on") && animate && !reduced) c.style.transitionDelay = (stagger(id) * 90) + "ms";
        else c.style.transitionDelay = "0ms";
        c.classList.toggle("on", on);
      });
      var decided = n >= 3 && resolved !== "reopen";
      cards.dB.classList.toggle("adopted", decided);
      cards.dB.classList.toggle("show-note", decided);
      ["dA", "dC"].forEach(function (id) {
        cards[id].classList.toggle("aside", decided);
        cards[id].classList.toggle("show-note", decided);
        cards[id].classList.toggle("back", n >= 4 && resolved === "reopen");
      });
      cards.dB.classList.toggle("show-flag", n >= 4);
      var flag = cards.dB.querySelector(".flag");
      flag.classList.toggle("resolved", !!resolved);
      cards.dB.querySelector(".fb").style.display = resolved ? "none" : "";
      if (n === 4 && prev < 4 && animate) { cards.n1.classList.remove("fresh"); void cards.n1.offsetWidth; cards.n1.classList.add("fresh"); }
      relabel();
      // Lines need the cards' final sizes, which change as notes appear.
      requestAnimationFrame(function () { drawLines(animate); });
      stepsEl.querySelectorAll("button").forEach(function (b, i) {
        b.classList.toggle("done", i < n);
        b.classList.toggle("cur", i === n);
        b.setAttribute("aria-current", i === n ? "step" : "false");
      });
      replayBtn.hidden = !(n === 4 && !playing);
    }
    function stagger(id) { return { e1: 0, e2: 1, e3: 2, j1: 0, dA: 0, dB: 1, dC: 2, st: 4, n1: 0 }[id] || 0; }

    function resolve(kind) {
      resolved = kind;
      go(4, false);
      var flag = cards.dB.querySelector(".flag");
      flag.style.animation = "none"; void flag.offsetWidth; flag.style.animation = "";
    }

    var DWELL = [2600, 2800, 3400, 3600];
    function play() {
      if (playing) return;
      playing = true; played = true;
      var i = step < 0 ? 0 : step + 1;
      if (i > 4) i = 0;
      (function tick() {
        go(i, true);
        progress(i);
        if (i >= 4) { playing = false; replayBtn.hidden = false; return; }
        timer = setTimeout(function () { i++; tick(); }, DWELL[i]);
      })();
    }
    function progress(i) {
      var b = stepsEl.querySelectorAll("button")[i];
      if (!b || reduced || i >= 4) return;
      b.style.setProperty("--p", "0%");
      var start = performance.now(), dur = DWELL[i];
      (function f(now) {
        if (!playing || step !== i) { b.style.removeProperty("--p"); return; }
        var k = Math.min(1, (now - start) / dur);
        b.style.setProperty("--p", (k * 100) + "%");
        if (k < 1) requestAnimationFrame(f);
      })(start);
    }
    function stop() { playing = false; clearTimeout(timer); }
    function reset() { stop(); moved = {}; resolved = null; step = -1; Object.keys(paths).forEach(function (k) { paths[k].path.remove(); if (paths[k].tag) paths[k].tag.remove(); delete paths[k]; }); layout(); }

    function drag(c) {
      var sx, sy, ox, oy, id = c.dataset.id, active = false;
      c.addEventListener("pointerdown", function (e) {
        if (e.button !== 0 || e.target.closest("button")) return;
        active = true; c.setPointerCapture(e.pointerId);
        sx = e.clientX; sy = e.clientY; ox = c.offsetLeft; oy = c.offsetTop;
        c.classList.add("dragging");
      });
      c.addEventListener("pointermove", function (e) {
        if (!active) return;
        var lay = LAYOUT[mode];
        var nx = Math.max(0, Math.min(lay.w - c.offsetWidth, ox + (e.clientX - sx) / scale));
        var ny = Math.max(0, Math.min(lay.h - c.offsetHeight, oy + (e.clientY - sy) / scale));
        c.style.left = nx + "px"; c.style.top = ny + "px";
        moved[id] = [nx, ny];
        drawLines(false);
      });
      function end() { if (!active) return; active = false; c.classList.remove("dragging"); }
      c.addEventListener("pointerup", end);
      c.addEventListener("pointercancel", end);
    }

    function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; }); }

    build();
    window.addEventListener("resize", function () { layout(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { drawLines(false); });

    // Play once when the board comes into view. Reduced motion shows the final state.
    if (reduced) { go(4, false); }
    else if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting && !played) { play(); io.disconnect(); } });
      }, { threshold: 0.35 });
      io.observe(el);
    } else play();

    return { relabel: relabel, go: go, play: play, stop: stop };
  })();

  // ---- How it works: zone spotlight on the real screenshot -------------------------------
  var LANES = [[5.25, 28.1], [28.9, 51.7], [52.5, 75.2], [76.1, 98.85]]; // % of screenshot width
  var lane = 0;
  function updateShot() {
    var img = document.getElementById("shotImg");
    var want = "assets/board-" + effectiveTheme() + "-" + lang + ".webp";
    if (img.getAttribute("src") !== want) img.setAttribute("src", want);
    img.alt = lang === "zh" ? "Vellum 白板：收集、探索、原型、定稿四个区域" : "A Vellum board with Gather, Explore, Prototype and Snapshot zones";
    setLane(lane);
  }
  function setLane(i) {
    lane = i;
    var l = LANES[i];
    var vl = document.getElementById("veilL"), vr = document.getElementById("veilR"), ring = document.getElementById("laneRing");
    vl.style.left = "0"; vl.style.width = (l[0] - 0.6) + "%";
    vr.style.left = (l[1] + 0.6) + "%"; vr.style.right = "0";
    ring.style.left = (l[0] - 0.6) + "%"; ring.style.width = (l[1] - l[0] + 1.2) + "%";
    document.querySelectorAll(".lanes [role=tab]").forEach(function (b, j) { b.setAttribute("aria-selected", j === i ? "true" : "false"); });
  }
  document.querySelectorAll(".lanes [role=tab]").forEach(function (b, j) {
    b.addEventListener("click", function () { setLane(j); });
    b.addEventListener("mouseenter", function () { if (window.matchMedia("(hover: hover)").matches) setLane(j); });
  });

  // ---- Crew participation modes -----------------------------------------------------------
  var crewMode = "listen";
  function renderMode() {
    document.querySelectorAll(".modes button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.mode === crewMode ? "true" : "false"); });
    document.getElementById("modeDesc").textContent = t({ focus: "mode.focusd", listen: "mode.listend", team: "mode.teamd" }[crewMode]);
  }
  document.querySelectorAll(".modes button").forEach(function (b) {
    b.addEventListener("click", function () { crewMode = b.dataset.mode; renderMode(); });
  });

  // ---- Use cases --------------------------------------------------------------------------
  function renderCases() {
    ["product", "video", "ai"].forEach(function (k) {
      var c = CASES[lang][k], el = document.getElementById("case-" + k);
      el.innerHTML = '<div><p class="lede">' + c.lede + '</p><p class="also">' + c.also + "</p></div>" +
        '<ol class="trail">' + c.trail.map(function (s) {
          return '<li><span class="dotm ' + s[3] + '"></span><div><div class="stage">' + s[0] + '</div><div class="what">' + s[1] + '</div><div class="why">' + s[2] + "</div></div></li>";
        }).join("") + "</ol>";
    });
  }
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".cases-tabs [role=tab]"));
  function selectTab(tab, focus) {
    tabs.forEach(function (b) {
      var on = b === tab;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      document.getElementById(b.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (b, i) {
    b.addEventListener("click", function () { selectTab(b); });
    b.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") selectTab(tabs[(i + 1) % tabs.length], true);
      if (e.key === "ArrowLeft") selectTab(tabs[(i + tabs.length - 1) % tabs.length], true);
    });
  });

  // ---- Downloads --------------------------------------------------------------------------
  function renderDownloads() {
    var ready = CONFIG.downloads.mac || CONFIG.downloads.win;
    document.querySelectorAll("[data-download][data-os]").forEach(function (a) {
      a.href = CONFIG.downloads[a.dataset.os] || CONFIG.releasesPage;
      a.target = "_blank"; a.rel = "noopener";
    });
    document.getElementById("dlNote").textContent = t(ready ? "get.dlready" : "get.dlpending");
  }

  // ---- Waitlist ---------------------------------------------------------------------------
  var form = document.getElementById("waitlist");
  var email = document.getElementById("email");
  var msg = document.getElementById("formMsg");
  document.getElementById("placeholderNote").hidden = !!CONFIG.waitlistEndpoint;
  email.addEventListener("input", function () { email.removeAttribute("aria-invalid"); msg.textContent = ""; });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      email.setAttribute("aria-invalid", "true");
      msg.className = "form-msg err"; msg.textContent = t("get.bademail");
      email.focus();
      return;
    }
    var btn = form.querySelector("button[type=submit]");
    function done(key) {
      document.getElementById("doneText").textContent = t(key).replace("{email}", v);
      form.classList.add("sent");
    }
    if (!CONFIG.waitlistEndpoint) { done("get.thankspreview"); return; }
    btn.disabled = true;
    fetch(CONFIG.waitlistEndpoint, {
      method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ email: v, use: document.getElementById("use").value, lang: lang })
    }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      done("get.thanksd");
    }).catch(function () {
      msg.className = "form-msg err"; msg.textContent = t("get.fail");
    }).then(function () { btn.disabled = false; });
  });

  // ---- Snap demo video plays only while visible ------------------------------------------
  var vid = document.getElementById("snapVideo");
  if (reduced) { vid.controls = true; }
  else if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { var p = vid.play(); if (p && p.catch) p.catch(function () { vid.controls = true; }); } else vid.pause(); });
    }, { threshold: 0.4 }).observe(vid);
  }

  applyCopy();
})();
