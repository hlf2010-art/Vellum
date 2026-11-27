/* Vellum website: copy (EN / 中文), theme, the live board, the zones board, the crew switch and the waitlist. No dependencies. */
(function () {
  "use strict";

  // ---- Go-live settings -------------------------------------------------------------------
  // Fill these in to make Download and the waitlist real. Until then the buttons say "Soon"
  // and a sign-up only tells the visitor that this is a preview.
  var CONFIG = {
    downloads: {
      mac: "",   // e.g. "https://github.com/hlf2010-art/Vellum/releases/latest/download/Vellum-mac.dmg"
      win: ""    // e.g. "https://github.com/hlf2010-art/Vellum/releases/latest/download/Vellum-Setup.exe"
    },
    waitlistEndpoint: "" // POST {email, use, lang} as JSON (Formspree, Buttondown, a Worker…)
  };

  var root = document.documentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover = window.matchMedia("(hover: hover)").matches;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; }); }

  // ---- Copy -------------------------------------------------------------------------------
  // Written in each language, not translated. One idea per line; small print only where it prevents a mistake.
  var T = {
    en: {
      "skip": "Skip to content",
      "nav.why": "Why Vellum", "nav.how": "How it works", "nav.crew": "The crew",
      "cta.get": "Get Vellum",
      "hero.title": "The whiteboard that remembers why.",
      "hero.lede": "A shared thinking space for you and AI, where every decision keeps its reasons.",
      "board.hint": "Drag any card", "board.replay": "Play again",
      "why.t1": "Most AI canvases help you make more.", "why.t2": "Vellum helps you think it through.",
      "why.lede": "The best meetings skip the slides and go to the whiteboard. Then someone wipes it.",
      "why.l1": "Evidence", "why.l2": "Directions", "why.l3": "Decision",
      "why.h1": "A generator canvas", "why.h2": "Vellum",
      "why.a1": "Forty images and a vague feeling", "why.b1": "Three directions, each showing what it rests on",
      "why.a2": "Cards that just happen to be close", "why.b2": "Relations with names: supports, counters, refines",
      "why.a3": "Rejected ideas, lost in final_v3", "why.b3": "Set-aside ideas, kept with the reason",
      "why.a4": "A decision nobody remembers making", "why.b4": "A decision that speaks up when the facts change",
      "how.title": "Every card knows where it came from.",
      "how.lede": "Evidence, then a judgment, then directions, then the thing you build. Pick any card to see what it rests on.",
      "z.1": "Gather", "z.1d": "What people did and said",
      "z.2": "Explore", "z.2d": "Judgments, then directions",
      "z.3": "Prototype", "z.3d": "Built from one direction",
      "z.4": "Snapshot", "z.4d": "A version to share, reasons attached",
      "cases.t1": "Product design", "cases.t2": "Short video", "cases.t3": "AI products",
      "crew.title": "A crew that thinks with you, and sometimes against you.",
      "crew.scout": "Weighs the evidence", "crew.scoutq": "“Two of these seven sources are the same review.”",
      "crew.strat": "Forks it into directions", "crew.stratq": "“If B is right, campers find it in five seconds.”",
      "crew.wright": "Builds the proof", "crew.wrightq": "“The foam mock-up for B is ready. Keep it?”",
      "crew.critic": "Checks it against the sources", "crew.criticq": "“Nothing here says campers want a dial.”",
      "crew.agency": "They can challenge your decision. Only you can make it.",
      "mode.focus": "Focus", "mode.listen": "Listening", "mode.team": "Teamwork",
      "mode.focusd": "They stay quiet and catch up when you're back.",
      "mode.listend": "They speak up only when something doesn't add up.",
      "mode.teamd": "They draft alongside you. You keep what's good.",
      "modes.label": "How much the crew joins in",
      "get.title": "Get Vellum.",
      "get.dl": "Download", "get.dld": "Early builds for macOS and Windows.",
      "get.mac": "macOS", "get.win": "Windows", "get.soon": "Soon",
      "get.wl": "Hear about new builds", "get.wld": "One email when a build is worth your time. That's the whole newsletter.",
      "get.email": "Email", "get.use": "Mostly for", "get.other": "Something else",
      "cta.waitlist": "Join the waitlist",
      "get.thanks": "You're on the list.",
      "get.thanksd": "We'll write to {email} when a build is ready.",
      "get.thankspreview": "This preview doesn't send sign-ups yet, so {email} stayed right here.",
      "get.bademail": "That doesn't look like an email address.",
      "get.fail": "That didn't go through. Try again in a moment.",
      "board.label": "A Vellum board deciding how a camping lantern should work",
      "lang.switch": "切换到中文", "theme.switch": "Switch theme", "steps.label": "Demo steps", "cases.label": "Use cases",
      "title": "Vellum: the whiteboard that remembers why"
    },
    zh: {
      "skip": "跳到正文",
      "nav.why": "为什么是 Vellum", "nav.how": "怎么用", "nav.crew": "AI 伙伴",
      "cta.get": "获取 Vellum",
      "hero.title": "会记住\u200b「为什么」\u2060的白板。",
      "hero.lede": "人类与 AI 共同思考的空间。每个决定，都留着当初的理由。",
      "board.hint": "卡片可以拖动", "board.replay": "再看一遍",
      "why.t1": "多数 AI\u00a0画布\u200b帮你做得更多。", "why.t2": "Vellum\u00a0帮你\u200b想得更清楚。",
      "why.lede": "最好的讨论不放 PPT，直接上白板。然后，有人把白板擦了。",
      "why.l1": "证据", "why.l2": "方向", "why.l3": "决定",
      "why.h1": "生成式画布", "why.h2": "Vellum",
      "why.a1": "四十张图，和一种说不清的感觉", "why.b1": "三个方向，各自写明依据",
      "why.a2": "碰巧挨在一起的卡片", "why.b2": "叫得出名字的关系：支持、反驳、细化",
      "why.a3": "被否的想法，埋在 final_v3 里", "why.b3": "搁置的想法，连同理由一起留着",
      "why.a4": "没人记得是怎么定下的决定", "why.b4": "事实一变，决定会自己站出来",
      "how.title": "每张卡片\u200b都知道自己从哪来。",
      "how.lede": "先有证据，再有判断，再分方向，最后做出东西。点任意一张卡片，看它建立在什么之上。",
      "z.1": "收集", "z.1d": "人们做了什么、说了什么",
      "z.2": "探索", "z.2d": "先下判断，再分方向",
      "z.3": "原型", "z.3d": "从一个方向做出来",
      "z.4": "定稿", "z.4d": "可以分享的版本，理由附在里面",
      "cases.t1": "产品设计", "cases.t2": "短视频", "cases.t3": "AI 产品",
      "crew.title": "和你一起想，\u200b有时也和你唱反调。",
      "crew.scout": "掂量证据", "crew.scoutq": "“这七条来源里，有两条是同一篇评论。”",
      "crew.strat": "把判断分成方向", "crew.stratq": "“如果 B 是对的，露营者五秒内就能找到灯。”",
      "crew.wright": "做出能验证的东西", "crew.wrightq": "“B 的泡沫手板做好了，留下吗？”",
      "crew.critic": "对照来源挑毛病", "crew.criticq": "“这里没有任何证据说露营者想要旋钮。”",
      "crew.agency": "它们可以质疑你的决定，但只有你能做决定。",
      "mode.focus": "专注", "mode.listen": "旁听", "mode.team": "协作",
      "mode.focusd": "它们保持安静，等你回来再跟上。",
      "mode.listend": "只在有地方说不通时才开口。",
      "mode.teamd": "和你一起起草，好的你留下。",
      "modes.label": "AI 伙伴参与的程度",
      "get.title": "获取 Vellum。",
      "get.dl": "下载", "get.dld": "macOS 和 Windows 早期版本。",
      "get.mac": "macOS", "get.win": "Windows", "get.soon": "即将推出",
      "get.wl": "新版本通知", "get.wld": "有值得一试的版本时，发你一封邮件。仅此而已。",
      "get.email": "邮箱", "get.use": "主要用来做", "get.other": "其他",
      "cta.waitlist": "加入等候名单",
      "get.thanks": "已加入名单。",
      "get.thanksd": "版本准备好后，我们会写信到 {email}。",
      "get.thankspreview": "这是预览版，报名还没有接通，{email} 没有被发送出去。",
      "get.bademail": "这看起来不像邮箱地址。",
      "get.fail": "没有提交成功，请稍后再试。",
      "board.label": "Vellum 白板演示：决定一盏露营灯该怎么设计",
      "lang.switch": "Switch to English", "theme.switch": "切换深浅色", "steps.label": "演示步骤", "cases.label": "使用场景",
      "title": "Vellum：会记住「为什么」的白板"
    }
  };

  // The hero board: a camping lantern, because product design is Vellum's first use case.
  var BOARD = {
    en: {
      steps: ["Evidence", "Judgment", "Directions", "Decision", "New evidence"],
      captions: [
        "Start with what you know.",
        "Say what it means, and what it rests on.",
        "The Strategist forks it. The Critic objects.",
        "You choose B. The others stay, with their reasons.",
        "New evidence counters B. Reopen it, or say why it holds."
      ],
      reopened: "Reopened. Nothing was lost along the way.",
      held: "Still holds. Your reason now sits beside the counter-evidence.",
      cards: {
        e1: { k: "Observed", t: "Field notes", b: "8 of 10 campers hung it from the tent loop.", by: "You" },
        e2: { k: "Reported", t: "Reviews", b: "“Blinding at arm's length.” 41 mentions.", by: "Scout" },
        e3: { k: "Said", t: "Interview", b: "“I just want to find it in the dark.”", by: "You" },
        j1: { k: "Judgment", t: "It's used hanging, up close, after dark.", b: "Rests on 3 sources, mostly observed.", by: "You + Scout" },
        dA: { k: "Direction", t: "Shade dial", b: "Twist a hood to dim it.", by: "Strategist" },
        dB: { k: "Direction", t: "Hook-first, warm low glow", b: "Hook on top. 2200K at 40 lumens.", by: "Strategist" },
        dC: { k: "Direction", t: "Glow-ring locator", b: "A faint ring to find it at night.", by: "Strategist" },
        st: { k: "Critic", b: "A dial is hard to turn in gloves. And nobody asked for one." },
        n1: { k: "Observed · new", t: "Field test", b: "The hook slips on thin guylines.", by: "You" }
      },
      adopted: "<strong>Chosen.</strong> It fits how 8 of 10 campers hang it.",
      asideA: "<strong>Set aside.</strong> Hard to use in gloves.",
      asideC: "<strong>Set aside.</strong> Finds the lantern, not the glare.",
      back: "Back in play",
      flagH: "New counter since you chose",
      reopen: "Reopen", holds: "Still holds",
      heldNote: "Still holds. Fix: a wider hook mouth.",
      reopenedNote: "Reopened. A and C are back in play.",
      supports: "supports", counters: "counters"
    },
    zh: {
      steps: ["证据", "判断", "方向", "决定", "新证据"],
      captions: [
        "从你知道的开始。",
        "说出它意味着什么，以及依据是什么。",
        "Strategist 分出方向，Critic 提出反对。",
        "你选了 B。其余的留着，各自带着理由。",
        "新证据反驳了 B。重新讨论，或写下它为何依然成立。"
      ],
      reopened: "已重新讨论。一路上什么都没丢。",
      held: "依然成立。你的理由和反驳证据放在了一起。",
      cards: {
        e1: { k: "观察", t: "实地记录", b: "10 位露营者里，8 位把灯挂在帐篷挂环上。", by: "你" },
        e2: { k: "转述", t: "用户评论", b: "“近看太刺眼。”41 条提到。", by: "Scout" },
        e3: { k: "原话", t: "访谈", b: "“我只想在黑暗里找得到它。”", by: "你" },
        j1: { k: "判断", t: "它是挂着用的：近距离，天黑以后。", b: "依据 3 条来源，大多是观察。", by: "你 + Scout" },
        dA: { k: "方向", t: "遮光旋钮", b: "转动灯罩来调暗。", by: "Strategist" },
        dB: { k: "方向", t: "挂钩优先，暖色低光", b: "顶部挂钩，2200K 暖光，40 流明。", by: "Strategist" },
        dC: { k: "方向", t: "夜光定位环", b: "一圈微光，夜里也找得到。", by: "Strategist" },
        st: { k: "Critic", b: "戴手套拧不动旋钮。而且，没人说想要它。" },
        n1: { k: "观察 · 新", t: "实地测试", b: "挂钩挂在细防风绳上会滑脱。", by: "你" }
      },
      adopted: "<strong>已选定。</strong>顺着 10 位里 8 位的挂法。",
      asideA: "<strong>已搁置。</strong>戴手套不好用。",
      asideC: "<strong>已搁置。</strong>找得到灯，没解决刺眼。",
      back: "重新纳入考虑",
      flagH: "选定之后，出现 1 条反证",
      reopen: "重新讨论", holds: "依然成立",
      heldNote: "依然成立。改法：把挂钩开口加宽。",
      reopenedNote: "已重新讨论。A 和 C 重新纳入考虑。",
      supports: "支持", counters: "反驳"
    }
  };

  // The zones board: the same four zones, filled in for three kinds of work.
  var CASES = {
    en: {
      product: {
        e1: { k: "Reported", t: "Returns", b: "“Too loud for calls.” 38 of them." },
        e2: { k: "Observed", t: "Sound test", b: "48 dB on the lowest setting." },
        j: { t: "Noise, not airflow, is why people send it back." },
        A: { t: "Bigger, slower blades", why: "Won't fit on a desk." },
        B: { t: "Brushless motor, call mode", b: "Chosen. Quiet enough for a meeting." },
        C: { t: "Bladeless tower", why: "Quiet, and twice the price." },
        P: { t: "Call-mode prototype", meta: "31 dB at full speed" },
        S: { t: "Spec for the tooling review" }
      },
      video: {
        e1: { k: "Observed", t: "Retention", b: "Half the viewers leave at second 3." },
        e2: { k: "Reported", t: "Comments", b: "“Get to the point.” 60 of them." },
        j: { t: "People need the payoff first." },
        A: { t: "Voice-over hook", why: "Still slow to the payoff." },
        B: { t: "Open on the result", b: "Chosen. The payoff lands in second one." },
        C: { t: "Text card intro", why: "Reads as an ad." },
        P: { t: "Storyboard, three takes", meta: "From your own video model" },
        S: { t: "Final cut, 15 seconds" }
      },
      ai: {
        e1: { k: "Observed", t: "Logs", b: "Users rewrite 6 of 10 drafted replies." },
        e2: { k: "Said", t: "Interviews", b: "“It sounds like a robot.”" },
        j: { t: "Tone is the problem, not the facts." },
        A: { t: "Tone slider", why: "One more setting nobody touches." },
        B: { t: "Mirror the sender", b: "Chosen. Writes the way they write." },
        C: { t: "Reply templates", why: "Fixes tone by removing it." },
        P: { t: "Eval, 50 real cases", meta: "46 pass" },
        S: { t: "Ship to 10% of users" }
      },
      kinds: { judgment: "Judgment", direction: "Direction", prototype: "Prototype", snapshot: "Snapshot", sources: "2 sources", aside: "A and C set aside, with reasons", by: "Wright" }
    },
    zh: {
      product: {
        e1: { k: "转述", t: "退货原因", b: "“开会时太吵。”38 条。" },
        e2: { k: "观察", t: "噪音测试", b: "最低档也有 48 分贝。" },
        j: { t: "退货是因为噪音，不是风量。" },
        A: { t: "加大扇叶、降低转速", why: "放不进桌面。" },
        B: { t: "无刷电机 + 通话模式", b: "已选定。安静到可以开会。" },
        C: { t: "无叶塔扇", why: "很安静，价格翻倍。" },
        P: { t: "通话模式样机", meta: "最高档 31 分贝" },
        S: { t: "给开模评审的规格书" }
      },
      video: {
        e1: { k: "观察", t: "留存数据", b: "一半观众在第 3 秒离开。" },
        e2: { k: "转述", t: "评论区", b: "“说重点。”60 条。" },
        j: { t: "观众要先看到结果。" },
        A: { t: "口播开场", why: "离结果还是太远。" },
        B: { t: "成品画面开场", b: "已选定。第一秒就给结果。" },
        C: { t: "文字卡开场", why: "一看就像广告。" },
        P: { t: "分镜，三个版本", meta: "用你自己的视频模型生成" },
        S: { t: "15 秒最终剪辑" }
      },
      ai: {
        e1: { k: "观察", t: "日志", b: "10 条草稿回复，用户改写了 6 条。" },
        e2: { k: "原话", t: "访谈", b: "“读起来像机器人。”" },
        j: { t: "问题出在语气，不在事实。" },
        A: { t: "语气滑块", why: "又一个没人会动的设置。" },
        B: { t: "跟随发件人的语气", b: "已选定。对方怎么写，它就怎么写。" },
        C: { t: "回复模板", why: "用去掉语气来解决语气。" },
        P: { t: "评测集，50 条真实案例", meta: "46 条通过" },
        S: { t: "先开放给 10% 的用户" }
      },
      kinds: { judgment: "判断", direction: "方向", prototype: "原型", snapshot: "定稿", sources: "2 条依据", aside: "A、C 已搁置，附理由", by: "Wright" }
    }
  };
  var KIND_ICON = { Observed: "eye", Reported: "msg", Said: "quote", "观察": "eye", "转述": "msg", "原话": "quote" };

  var lang = root.lang === "zh-CN" ? "zh" : "en";
  function t(key) { return (T[lang] && T[lang][key]) || T.en[key] || ""; }

  function applyCopy() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var v = t(el.getAttribute("data-i18n"));
      if (v) el.textContent = v;
    });
    document.querySelectorAll(".lang-btn span[data-l]").forEach(function (s) { s.classList.toggle("on", s.getAttribute("data-l") === lang); });
    document.title = t("title");
    $("langBtn").setAttribute("aria-label", t("lang.switch"));
    $("themeBtn").setAttribute("aria-label", t("theme.switch"));
    $("steps").setAttribute("aria-label", t("steps.label"));
    $("caseTabs").setAttribute("aria-label", t("cases.label"));
    $("modes").setAttribute("aria-label", t("modes.label"));
    board.relabel();
    zones.render(false);
    renderMode(false);
    renderDownloads();
  }

  // ---- Theme and language ------------------------------------------------------------------
  function effectiveTheme() {
    return root.getAttribute("data-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  $("themeBtn").addEventListener("click", function () {
    var next = effectiveTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    store.set("vellum-site-theme", next);
  });
  $("langBtn").addEventListener("click", function () {
    lang = lang === "zh" ? "en" : "zh";
    root.lang = lang === "zh" ? "zh-CN" : "en";
    store.set("vellum-site-lang", lang);
    applyCopy();
  });

  // Hairline under the header once the page moves.
  var head = document.querySelector(".site-head");
  function onScroll() { head.classList.toggle("scrolled", window.scrollY > 4); }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  // ---- The live board ---------------------------------------------------------------------
  var board = (function () {
    var el = $("board"), stage = $("stage"), svg = $("lines"), stepsEl = $("steps"), caption = $("caption"), replayBtn = $("replay"), hint = $("boardHint");

    // Card positions in board units: [x, y, width]. Wide reads left to right; mid and narrow read top to bottom.
    var LAYOUT = {
      wide: { w: 1180, h: 736, loop: 20, max: 1.2, pos: {
        e1: [28, 40, 212], e2: [28, 266, 212], e3: [28, 498, 212],
        j1: [320, 270, 240], st: [342, 50, 196],
        dA: [626, 40, 236], dC: [626, 456, 236],
        dB: [904, 150, 248], n1: [926, 560, 204]
      } },
      mid: { w: 760, h: 966, loop: 15, max: 1.1, pos: {
        e1: [20, 24, 228], e2: [266, 24, 228], e3: [512, 24, 228],
        st: [40, 214, 196], j1: [266, 222, 228],
        dA: [20, 440, 228], dB: [266, 440, 228], dC: [512, 440, 228],
        n1: [266, 806, 228]
      } },
      narrow: { w: 380, h: 1062, loop: 9, max: 1.12, pos: {
        e1: [12, 14, 172], e2: [196, 14, 172], e3: [12, 160, 172],
        j1: [196, 160, 172], st: [20, 316, 158],
        dA: [196, 340, 172], dB: [12, 542, 356],
        dC: [12, 836, 172], n1: [196, 836, 172]
      } }
    };
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
    var KI = { e1: "eye", e2: "msg", e3: "quote", j1: "judge", dA: "fork", dB: "fork", dC: "fork", st: "critic", n1: "eye" };
    var CREW = { "Scout": "var(--crew-scout)", "Strategist": "var(--crew-strategist)" };
    var mode = null, scale = 1, step = -1, timer = null, playing = false, played = false, resolved = null, dragged = false;
    var cards = {}, moved = {}, paths = {}, loop = null, later = [];

    function L() { return BOARD[lang]; }
    function soon(fn, ms) { later.push(setTimeout(fn, ms)); }
    function clearLater() { later.forEach(clearTimeout); later = []; }

    function build() {
      Object.keys(SHOW).forEach(function (id) {
        var c = document.createElement("div");
        c.className = "vc bcard";
        if (id === "j1" || id[0] === "d") c.classList.add("ink");
        if (id === "st") c.classList.add("sticky");
        c.dataset.id = id;
        c.innerHTML = '<div class="k"><svg class="ki" aria-hidden="true"><use href="#i-' + KI[id] + '"/></svg><span class="kk"></span>' + (id === "st" ? "" : '<span class="by"></span>') + "</div>" +
          (id === "st" ? "" : '<div class="t"></div>') + '<div class="b"></div>' +
          (id === "dA" || id === "dC" ? '<div class="veil"></div><div class="note"></div><span class="back-chip"><svg class="ki" aria-hidden="true"><use href="#i-retry"/></svg><span></span></span>' : "") +
          // The chosen card shows one line; why it was chosen and what you can do open on hover, focus or tap.
          (id === "dB" ? '<div class="flag"><div class="fh"></div></div><div class="more"><div class="mi"><div class="note"></div><div class="fb" role="group"><button type="button" class="reopen"></button><button type="button" class="holds"></button></div></div></div>' : "");
        stage.appendChild(c);
        cards[id] = c;
        drag(c);
      });
      // Touch has no hover: a tap opens the chosen card. Lines and the loop follow it as it grows.
      cards.dB.addEventListener("click", function (e) { if (!canHover && !e.target.closest("button")) cards.dB.classList.toggle("open"); });
      if (window.ResizeObserver) new ResizeObserver(function () { requestAnimationFrame(function () { drawLines(false); }); }).observe(cards.dB);
      cards.dB.querySelector(".reopen").addEventListener("click", function (e) { e.stopPropagation(); resolve("reopen"); });
      cards.dB.querySelector(".holds").addEventListener("click", function (e) { e.stopPropagation(); resolve("holds"); });
      var icons = ["eye", "judge", "fork", "decide", "retry"];
      L().steps.forEach(function (_, i) {
        var li = document.createElement("li");
        li.innerHTML = '<button type="button"><svg class="ic" aria-hidden="true"><use href="#i-' + icons[i] + '"/></svg><span class="lbl"></span></button>';
        li.firstChild.addEventListener("click", function () { stop(); played = true; resolved = null; go(i, true); if (i === 4) settle(); });
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
            var col = CREW[w];
            return '<b style="background:' + (col || "var(--label)") + (col ? "" : ";color:var(--card)") + '">' + esc(w === "你" ? "你" : w.charAt(0)) + "</b>";
          }).join("");
          by.title = d.by; by.setAttribute("role", "img"); by.setAttribute("aria-label", d.by);
        }
      });
      cards.dB.querySelector(".fh").textContent = resolved === "holds" ? l.heldNote : resolved === "reopen" ? l.reopenedNote : l.flagH;
      cards.dB.querySelector(".reopen").textContent = l.reopen;
      cards.dB.querySelector(".holds").textContent = l.holds;
      ["dA", "dC"].forEach(function (id) { cards[id].querySelector(".back-chip span").textContent = l.back; });
      cards.dB.querySelector(".note").innerHTML = l.adopted;
      cards.dA.querySelector(".note").innerHTML = l.asideA;
      cards.dC.querySelector(".note").innerHTML = l.asideC;
      stepsEl.querySelectorAll(".lbl").forEach(function (s, i) { s.textContent = l.steps[i]; });
      stepsEl.querySelectorAll("button").forEach(function (b, i) { b.setAttribute("aria-label", (i + 1) + ". " + l.steps[i]); });
      el.setAttribute("aria-label", t("board.label"));
      setCaption(false);
      layout();
    }

    function setCaption(animate) {
      var l = L();
      var text = step < 0 ? "" : resolved === "reopen" ? l.reopened : resolved === "holds" ? l.held : l.captions[step];
      if (caption.textContent === text) return;
      caption.textContent = text;
      if (animate && !reduced) { caption.classList.remove("swap"); void caption.offsetWidth; caption.classList.add("swap"); }
    }

    function layout() {
      var bw = el.clientWidth, nextMode = bw >= 920 ? "wide" : bw >= 600 ? "mid" : "narrow";
      if (nextMode !== mode) { mode = nextMode; moved = {}; el.setAttribute("data-layout", mode); }
      var lay = LAYOUT[mode];
      scale = Math.min(lay.max, bw / lay.w);
      stage.style.width = lay.w + "px"; stage.style.height = lay.h + "px";
      stage.style.left = Math.round((bw - lay.w * scale) / 2) + "px";
      stage.style.transform = "scale(" + scale + ")";
      el.style.height = Math.round(lay.h * scale) + "px";
      svg.setAttribute("viewBox", "0 0 " + lay.w + " " + lay.h);
      svg.setAttribute("width", lay.w); svg.setAttribute("height", lay.h);
      Object.keys(cards).forEach(function (id) {
        var p = moved[id] || lay.pos[id], c = cards[id];
        c.style.left = p[0] + "px"; c.style.top = p[1] + "px"; c.style.width = lay.pos[id][2] + "px";
      });
      drawLines(false);
    }

    function box(id) { var c = cards[id]; return { x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight }; }

    function drawLines(animateNew) {
      RELS.forEach(function (r, i) {
        var key = "r" + i, p = paths[key];
        if (step < r.at) { if (p) { p.path.remove(); if (p.tag) p.tag.remove(); delete paths[key]; } return; }
        var g = curve(box(r.a), box(r.b), true);
        if (!p) {
          var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("class", r.type);
          path.dataset.a = r.a; path.dataset.b = r.b;
          svg.appendChild(path);
          p = paths[key] = { path: path };
          if (animateNew && !reduced) {
            path.setAttribute("pathLength", "1"); path.classList.add("draw");
            setTimeout(function () { path.removeAttribute("pathLength"); path.classList.remove("draw"); }, 800);
          }
          if (r.tag && !(mode === "narrow" && r.a === "n1")) {
            var tag = document.createElement("span");
            tag.className = "rel-tag " + r.type;
            stage.appendChild(tag);
            p.tag = tag;
            requestAnimationFrame(function () { requestAnimationFrame(function () { tag.classList.add("on"); }); });
          }
        }
        p.path.setAttribute("d", g.d);
        p.path.classList.toggle("dim", step >= 3 && !resolved && r.type === "related" && r.b !== "dB");
        if (p.tag) { p.tag.textContent = L()[r.type]; p.tag.style.left = g.m.x + "px"; p.tag.style.top = g.m.y + "px"; }
      });
      drawLoop(animateNew);
    }

    // A marker loop around the chosen card, like circling it on a whiteboard.
    function drawLoop(animate) {
      var want = step >= 3 && resolved !== "reopen";
      if (!want) { if (loop) { loop.remove(); loop = null; } return; }
      var b = box("dB"), m = LAYOUT[mode].loop, cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w / 2 + m, ry = b.h / 2 + m;
      var pts = [], N = 72, over = 6;
      for (var i = 0; i <= N + over; i++) {
        var a = -2.25 + (i / N) * Math.PI * 2;
        var wob = 1 + 0.018 * Math.sin(a * 2 + 0.6) + (i > N ? 0.035 * (i - N) / over : 0);
        var co = Math.cos(a), si = Math.sin(a), e = 0.42;
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
          loop.setAttribute("pathLength", "1"); loop.classList.add("draw-slow");
          var lp = loop; setTimeout(function () { lp.removeAttribute("pathLength"); lp.classList.remove("draw-slow"); }, 1500);
        }
      }
      loop.setAttribute("d", d);
      loop.setAttribute("transform", "rotate(-1.4 " + cx.toFixed(1) + " " + cy.toFixed(1) + ")");
    }

    function go(n, animate) {
      var prev = step;
      step = n;
      if (n < 4) resolved = null;
      Object.keys(cards).forEach(function (id) {
        var c = cards[id], on = SHOW[id] <= n;
        c.style.transitionDelay = on && !c.classList.contains("on") && animate && !reduced ? (stagger(id) * 90) + "ms" : "0ms";
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
      cards.dB.classList.toggle("resolved", !!resolved);
      if (resolved || n < 4) flag.classList.remove("waiting");
      if (n === 4 && prev < 4 && animate && !reduced) { cards.n1.classList.remove("fresh"); void cards.n1.offsetWidth; cards.n1.classList.add("fresh"); }
      relabel();
      setCaption(animate);
      requestAnimationFrame(function () { drawLines(animate); });   // lines need the cards' final sizes
      stepsEl.querySelectorAll("button").forEach(function (b, i) {
        b.classList.toggle("done", i < n);
        b.classList.toggle("cur", i === n);
        if (i === n) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      });
      replayBtn.hidden = !(n === 4 && !playing);
    }
    function stagger(id) { return { e1: 0, e2: 1, e3: 2, j1: 0, dA: 0, dB: 1, dC: 2, st: 4, n1: 0 }[id] || 0; }

    function resolve(kind) {
      resolved = kind;
      go(4, false);
      setCaption(true);
    }

    // After the story ends: the flag glows while it waits for you, then one card shows it can move.
    function settle() {
      var teach = canHover && mode !== "narrow";
      if (reduced) { if (!dragged && teach) hint.classList.add("on"); return; }
      clearLater();
      soon(function () { if (!resolved && step === 4) cards.dB.querySelector(".flag").classList.add("waiting"); }, 700);
      soon(function () {
        if (dragged || !teach) return;
        hint.classList.add("on");
        cards.n1.classList.remove("nudge"); void cards.n1.offsetWidth; cards.n1.classList.add("nudge");
      }, 2200);
    }

    var DWELL = [2400, 2700, 3300, 3500];
    function play() {
      if (playing) return;
      playing = true; played = true;
      var i = step < 0 ? 0 : step + 1;
      if (i > 4) i = 0;
      (function tick() {
        go(i, true);
        progress(i);
        if (i >= 4) { playing = false; replayBtn.hidden = false; settle(); return; }
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
    function stop() { playing = false; clearTimeout(timer); clearLater(); }
    function reset() {
      stop(); moved = {}; resolved = null; step = -1;
      Object.keys(paths).forEach(function (k) { paths[k].path.remove(); if (paths[k].tag) paths[k].tag.remove(); delete paths[k]; });
      Object.keys(cards).forEach(function (id) { cards[id].classList.remove("on", "nudge", "fresh"); });
      layout();
    }

    function hot(id, on) {
      svg.querySelectorAll("path[data-a]").forEach(function (p) { if (p.dataset.a === id || p.dataset.b === id) p.classList.toggle("hot", on); });
    }

    // Cards are paper: they lift, tilt with the drag, and settle when you let go.
    function drag(c) {
      var sx, sy, ox, oy, lx, id = c.dataset.id, active = false, tilt = 0, raf = 0;
      c.addEventListener("pointerenter", function () { hot(id, true); });
      c.addEventListener("pointerleave", function () { if (!active) hot(id, false); });
      c.addEventListener("pointerdown", function (e) {
        if (e.button !== 0 || e.pointerType === "touch" || e.target.closest("button")) return;
        active = true; c.setPointerCapture(e.pointerId);
        sx = lx = e.clientX; sy = e.clientY; ox = c.offsetLeft; oy = c.offsetTop;
        c.classList.remove("nudge");
        c.classList.add("dragging");
        if (!dragged) { dragged = true; hint.classList.remove("on"); }
      });
      c.addEventListener("pointermove", function (e) {
        if (!active) return;
        var lay = LAYOUT[mode];
        var nx = Math.max(0, Math.min(lay.w - c.offsetWidth, ox + (e.clientX - sx) / scale));
        var ny = Math.max(0, Math.min(lay.h - c.offsetHeight, oy + (e.clientY - sy) / scale));
        c.style.left = nx + "px"; c.style.top = ny + "px";
        moved[id] = [nx, ny];
        if (!reduced) { tilt = Math.max(-4, Math.min(4, tilt * 0.7 + (e.clientX - lx) * 0.35)); lx = e.clientX; c.style.setProperty("--tilt", tilt.toFixed(2) + "deg"); }
        if (!raf) raf = requestAnimationFrame(function () { raf = 0; drawLines(false); });
      });
      function end() {
        if (!active) return;
        active = false; tilt = 0;
        c.style.setProperty("--tilt", "0deg");
        c.classList.remove("dragging");
        if (!c.matches(":hover")) hot(id, false);
      }
      c.addEventListener("pointerup", end);
      c.addEventListener("pointercancel", end);
    }

    build();
    var rz = 0;
    window.addEventListener("resize", function () { cancelAnimationFrame(rz); rz = requestAnimationFrame(layout); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(); });

    // Play once when the board comes into view. Reduced motion shows the final state.
    if (reduced) { go(4, false); settle(); }
    else if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting && !played) { play(); io.disconnect(); } });
      }, { threshold: 0.3 });
      io.observe(el);
    } else play();

    return { relabel: relabel };
  })();

  // ---- The zones board: hover or tap a card to trace it back to its evidence --------------------
  var zones = (function () {
    var zb = $("zb"), svg = $("zbLines"), lanes = zb.querySelectorAll(".lane-cards");
    var tabsEl = $("caseTabs"), tabs = Array.prototype.slice.call(tabsEl.querySelectorAll("[role=tab]"));
    var current = "product", nodes = {}, pinned = null, demoed = false, interacted = false;
    var EDGES = [["e1", "j", "supports"], ["e2", "j", "supports"], ["j", "A", "aside"], ["j", "B", ""], ["j", "C", "aside"], ["B", "P", "lineB"], ["P", "S", "lineB"]];

    var ILL = {
      product: // a desk fan in call mode: the blades spin when you point at the card
        '<svg class="ill" viewBox="0 0 200 150" aria-hidden="true"><ellipse cx="100" cy="134" rx="46" ry="5" fill="currentColor" opacity=".07"/>' +
        '<path class="line" d="M100 104v22M78 130h44"/><circle class="fill-card line" cx="100" cy="62" r="42"/>' +
        '<g class="soft"><circle cx="100" cy="62" r="33"/><path d="M100 20v10M100 94v10M58 62h10M132 62h10M70.3 32.3l7 7M122.7 84.7l7 7M70.3 91.7l7-7M122.7 39.3l7-7"/></g>' +
        '<g class="blades"><path class="fill-2 line" d="M100 62c-3-12 2-24 10-24 7 0 6 14-10 24ZM100 62c12-1 21 7 18 15-3 6-15 0-18-15ZM100 62c-8 9-21 10-24 3-2-7 11-12 24-3Z"/></g>' +
        '<circle class="fill-card line" cx="100" cy="62" r="5"/>' +
        '<g class="b-stroke"><path d="M152 50c4 3 6 7 6 12s-2 9-6 12" opacity=".9"/><path d="M161 43c6 5 9 11 9 19s-3 14-9 19" opacity=".45"/></g></svg>',
      video: // a storyboard with the chosen opening framed in B
        '<svg class="ill" viewBox="0 0 200 150" aria-hidden="true">' +
        '<g><rect class="fill-card" x="12" y="42" width="54" height="40" rx="5"/><rect class="b-stroke" x="12" y="42" width="54" height="40" rx="5"/><circle class="b-ink" cx="39" cy="62" r="9" opacity=".9"/><path class="line" d="M28 75h22" opacity=".5"/></g>' +
        '<g><rect class="fill-card line" x="73" y="42" width="54" height="40" rx="5" opacity=".9"/><path class="soft" d="M84 70l10-12 8 8 6-6 9 10"/></g>' +
        '<g><rect class="fill-card line" x="134" y="42" width="54" height="40" rx="5" opacity=".9"/><path class="soft" d="M144 56h34M144 63h24M144 70h28"/></g>' +
        '<text x="12" y="98">0s</text><text x="73" y="98">1s</text><text x="134" y="98">3s</text>' +
        '<path class="soft" d="M12 112h176"/><path class="playhead b-stroke" d="M40 106v12"/></svg>',
      ai: // fifty eval cases, forty-six pass
        (function () {
          var s = '<svg class="ill" viewBox="0 0 200 150" aria-hidden="true">', fails = { 7: 1, 19: 1, 33: 1, 44: 1 };
          for (var i = 0; i < 50; i++) {
            var x = 23 + (i % 10) * 16, y = 30 + Math.floor(i / 10) * 16;
            s += '<rect class="' + (fails[i] ? "fail" : "pass") + '" x="' + x + '" y="' + y + '" width="11" height="11" rx="3" opacity="' + (fails[i] ? ".9" : ".85") + '" style="--i:' + i + '"/>';
          }
          return s + '<text x="23" y="124">46 / 50</text></svg>';
        })()
    };

    function cardHTML(id, d, k, c) {
      var kind = function (icon, label) { return '<div class="k"><svg class="ki" aria-hidden="true"><use href="#i-' + icon + '"/></svg><span>' + esc(label) + "</span></div>"; };
      if (id === "e1" || id === "e2") return '<article class="vc zc" data-id="' + id + '" tabindex="0">' + kind(KIND_ICON[d.k] || "eye", d.k) + '<div class="t">' + esc(d.t) + '</div><div class="b">' + esc(d.b) + "</div></article>";
      if (id === "j") return '<article class="vc zc ink wide" data-id="j" tabindex="0">' + kind("judge", k.judgment) + '<div class="t">' + esc(d.t) + "</div></article>";
      if (id === "A" || id === "C") return '<article class="vc zc ink dir aside" data-id="' + id + '" tabindex="0"><div class="t"><span class="chip ' + id + '">' + id + "</span><span>" + esc(d.t) + '</span></div><div class="veil"></div><div class="note">' + esc(d.why) + "</div></article>";
      if (id === "B") return '<article class="vc zc ink dir adopted wide" data-id="B" tabindex="0">' + kind("fork", k.direction) + '<div class="t"><span class="chip B">B</span><span>' + esc(d.t) + '</span></div><div class="b">' + esc(d.b) + "</div></article>";
      if (id === "P") return '<article class="vc zc wide proto" data-id="P" tabindex="0"><div class="media">' + ILL[c] + "</div>" + kind("window", k.prototype) + '<div class="t">' + esc(d.t) + '</div><div class="meta"><i></i><span>' + esc(d.meta) + "</span></div></article>";
      // The snapshot is a small page: what was decided, what it rests on, and what was set aside (with reasons).
      return '<article class="vc zc wide snap" data-id="S" tabindex="0">' + kind("snap", k.snapshot) + '<div class="t">' + esc(d.t) + "</div>" +
        '<div class="page">' +
          '<div class="r"><span class="chip B">B</span><span>' + esc(CASES[lang][c].B.t) + "</span></div>" +
          '<div class="r">' + esc(k.sources) + "</div>" +
          '<div class="r">' + esc(k.aside) + "</div>" +
        "</div></article>";
    }

    function render(animate) {
      var data = CASES[lang][current], k = CASES[lang].kinds;
      var order = [["e1", "e2"], ["j", "A", "B", "C"], ["P"], ["S"]];
      slide(tabsEl, tabsEl.querySelector('[data-case="' + current + '"]'));
      clearTrace();
      lanes.forEach(function (lane, i) {
        lane.innerHTML = order[i].map(function (id) { return cardHTML(id, data[id], k, current); }).join("");
      });
      nodes = {};
      zb.querySelectorAll(".zc").forEach(function (c) { nodes[c.dataset.id] = c; wire(c); });
      zb.setAttribute("aria-labelledby", "tab-" + current);
      align();
      draw(animate);
      if (animate && !reduced) {
        var list = zb.querySelectorAll(".zc");
        list.forEach(function (c) { c.classList.add("swap"); });
        requestAnimationFrame(function () { requestAnimationFrame(function () {
          list.forEach(function (c, i) { c.style.transitionDelay = (i * 35) + "ms"; c.classList.remove("swap"); });
          setTimeout(function () { list.forEach(function (c) { c.style.transitionDelay = ""; }); }, 700);
        }); });
      }
    }

    function wide() { return getComputedStyle(zb).gridTemplateColumns.split(" ").length === 4; }

    // On the wide board, line cards up so the reasoning reads as one straight path from B to the snapshot.
    function align() {
      zb.querySelectorAll(".zc").forEach(function (c) { c.style.marginTop = ""; });
      if (!wide()) return;
      var B = nodes.B, P = nodes.P, S = nodes.S, j = nodes.j;
      var center = function (el) { return rel(el).y + el.offsetHeight / 2; };
      P.style.marginTop = Math.max(0, center(B) - center(P)) + "px";
      S.style.marginTop = Math.max(0, center(P) - center(S)) + "px";
      var e1 = nodes.e1, e2 = nodes.e2, stackMid = (rel(e1).y + rel(e2).y + e2.offsetHeight) / 2;
      e1.style.marginTop = Math.max(0, center(j) + 40 - stackMid) + "px";
    }

    function rel(el) {
      var x = 0, y = 0, n = el;
      while (n && n !== zb) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      return { x: x, y: y };
    }
    function box(id) { var el = nodes[id], p = rel(el); return { x: p.x, y: p.y, w: el.offsetWidth, h: el.offsetHeight }; }

    function draw(animate) {
      var NS = "http://www.w3.org/2000/svg", W = zb.clientWidth, H = zb.clientHeight, isWide = wide();
      svg.innerHTML = "";
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      // Lines pass behind the lane titles rather than through them.
      var mask = '<mask id="zbMask" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '"><rect width="' + W + '" height="' + H + '" fill="#fff"/>';
      zb.querySelectorAll(".lane-head").forEach(function (h) {
        var p = rel(h);
        mask += '<rect x="' + (p.x - 6) + '" y="' + (p.y - 6) + '" width="' + (h.offsetWidth + 12) + '" height="' + (h.offsetHeight + 12) + '" rx="8" fill="#000"/>';
      });
      svg.innerHTML = "<defs>" + mask + "</mask></defs>";
      var g = document.createElementNS(NS, "g");
      g.setAttribute("mask", "url(#zbMask)");
      svg.appendChild(g);
      EDGES.forEach(function (e, i) {
        // Stacked, the set-aside pair sits under the chosen direction; a line to them would read as coming from B.
        if (!isWide && e[2] === "aside") return;
        var p = document.createElementNS(NS, "path");
        p.setAttribute("d", curve(box(e[0]), box(e[1])).d);
        p.setAttribute("class", e[2]);
        p.dataset.a = e[0]; p.dataset.b = e[1];
        if (animate && !reduced) {
          p.setAttribute("pathLength", "1"); p.classList.add("draw"); p.style.animationDelay = (120 + i * 40) + "ms";
          setTimeout(function () { p.removeAttribute("pathLength"); p.classList.remove("draw"); p.style.animationDelay = ""; }, 900);
        }
        g.appendChild(p);
      });
    }

    function lineage(id) {
      var set = {}; set[id] = 1;
      (function up(n) { EDGES.forEach(function (e) { if (e[1] === n && !set[e[0]]) { set[e[0]] = 1; up(e[0]); } }); })(id);
      (function down(n) { EDGES.forEach(function (e) { if (e[0] === n && !set[e[1]]) { set[e[1]] = 1; down(e[1]); } }); })(id);
      return set;
    }
    function trace(id) {
      var set = lineage(id);
      zb.classList.add("tracing");
      Object.keys(nodes).forEach(function (n) { nodes[n].classList.toggle("lit", !!set[n]); });
      svg.querySelectorAll("path").forEach(function (p) { p.classList.toggle("lit", !!(set[p.dataset.a] && set[p.dataset.b])); });
    }
    function clearTrace() {
      zb.classList.remove("tracing");
      zb.querySelectorAll(".lit").forEach(function (n) { n.classList.remove("lit"); });
    }

    // The prototype plays once when you reach it: the fan spins up, the playhead runs, the evals tick.
    var aliveT = 0;
    function wake() {
      var c = nodes.P;
      if (!c || reduced || c.classList.contains("alive")) return;
      c.classList.add("alive");
      clearTimeout(aliveT); aliveT = setTimeout(function () { if (nodes.P) nodes.P.classList.remove("alive"); }, 2000);
    }

    function wire(c) {
      var id = c.dataset.id;
      if (id === "P") c.addEventListener("pointerenter", wake);
      c.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse" && !pinned) { interacted = true; trace(id); } });
      c.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse" && !pinned) clearTrace(); });
      c.addEventListener("click", function () { interacted = true; if (pinned === id) { pinned = null; clearTrace(); } else { pinned = id; trace(id); if (id === "P") wake(); } });
      c.addEventListener("focus", function () { if (!pinned) trace(id); });
      c.addEventListener("blur", function () { if (!pinned) clearTrace(); });
      c.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.click(); } if (e.key === "Escape") { pinned = null; clearTrace(); } });
    }
    document.addEventListener("click", function (e) { if (pinned && !e.target.closest(".zc")) { pinned = null; clearTrace(); } });

    // The first time the board is seen, trace the snapshot back to its evidence once, then let go.
    function demo() {
      if (demoed || reduced || interacted) return;
      demoed = true;
      var path = ["S", "P", "B", "j", "e1", "e2"], lit = {}, i = 0;
      zb.classList.add("tracing");
      (function next() {
        if (interacted) return;
        if (i < path.length) {
          lit[path[i]] = 1;
          if (path[i] === "P") wake();
          Object.keys(nodes).forEach(function (n) { nodes[n].classList.toggle("lit", !!lit[n]); });
          svg.querySelectorAll("path").forEach(function (p) { p.classList.toggle("lit", !!(lit[p.dataset.a] && lit[p.dataset.b])); });
          i++; setTimeout(next, 260);
        } else setTimeout(function () { if (!interacted && !pinned) clearTrace(); }, 1300);
      })();
    }
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { setTimeout(demo, 350); io.disconnect(); } }); }, { threshold: 0.55 });
      io.observe(zb);
    }

    function select(tab, focus) {
      tabs.forEach(function (b) { var on = b === tab; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
      slide(tabsEl, tab);
      if (focus) tab.focus();
      if (current === tab.dataset.case) return;
      current = tab.dataset.case; pinned = null; interacted = true;
      render(true);
    }
    tabs.forEach(function (b, i) {
      b.addEventListener("click", function () { select(b); });
      b.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight") { e.preventDefault(); select(tabs[(i + 1) % tabs.length], true); }
        if (e.key === "ArrowLeft") { e.preventDefault(); select(tabs[(i + tabs.length - 1) % tabs.length], true); }
      });
    });

    var rz = 0;
    window.addEventListener("resize", function () { cancelAnimationFrame(rz); rz = requestAnimationFrame(function () { slide(tabsEl, tabsEl.querySelector('[aria-selected="true"]')); align(); draw(false); }); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { align(); draw(false); });

    return { render: function (animate) { render(animate); } };
  })();

  // Shared: an S-curve from the side of A that faces B to the side of B that faces A.
  // The sliding thumb of a segmented control.
  function slide(group, btn) {
    var th = group.querySelector(".thumb");
    if (!th) { th = document.createElement("span"); th.className = "thumb"; th.setAttribute("aria-hidden", "true"); group.insertBefore(th, group.firstChild); }
    th.style.width = btn.offsetWidth + "px";
    th.style.transform = "translateX(" + btn.offsetLeft + "px)";
  }

  function curve(a, b, rows) {
    var ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    var dx = bc.x - ac.x, dy = bc.y - ac.y;
    // With rows, a narrow gutter between columns is no place for a line: go over the top instead.
    var hg = Math.max(b.x - a.x - a.w, a.x - b.x - b.w), vg = Math.max(b.y - a.y - a.h, a.y - b.y - b.h);
    var across = rows ? (hg >= 40 || hg >= vg) : Math.abs(dx) > (a.w + b.w) / 2 * 0.9;
    if (across && Math.abs(dx) > 1) {
      var s = dx > 0 ? 1 : -1;
      var p1 = { x: s > 0 ? a.x + a.w : a.x, y: ac.y }, p2 = { x: s > 0 ? b.x : b.x + b.w, y: bc.y };
      var k = Math.max(28, Math.abs(p2.x - p1.x) * 0.5);
      return { d: "M" + p1.x + " " + p1.y + " C" + (p1.x + s * k) + " " + p1.y + "," + (p2.x - s * k) + " " + p2.y + "," + p2.x + " " + p2.y, m: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
    }
    var v = dy > 0 ? 1 : -1;
    var q1 = { x: ac.x, y: v > 0 ? a.y + a.h : a.y }, q2 = { x: bc.x, y: v > 0 ? b.y : b.y + b.h };
    var kk = Math.max(22, Math.abs(q2.y - q1.y) * 0.5);
    return { d: "M" + q1.x + " " + q1.y + " C" + q1.x + " " + (q1.y + v * kk) + "," + q2.x + " " + (q2.y - v * kk) + "," + q2.x + " " + q2.y, m: { x: (q1.x + q2.x) / 2, y: (q1.y + q2.y) / 2 } };
  }

  // ---- The vellum layers: stacked flat until seen, then they fan out so each step shows through ----
  var layers = $("layers");
  if (reduced || !("IntersectionObserver" in window)) layers.classList.add("open");
  else {
    var lio = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { setTimeout(function () { layers.classList.add("open"); }, 250); lio.disconnect(); } }); }, { threshold: 0.6 });
    lio.observe(layers);
  }
  if (!reduced && canHover) {
    layers.addEventListener("pointermove", function (e) {
      var r = layers.getBoundingClientRect();
      layers.style.setProperty("--mx", Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 1.2))).toFixed(3));
      layers.style.setProperty("--my", Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 1.2))).toFixed(3));
    });
    layers.addEventListener("pointerleave", function () { layers.style.setProperty("--mx", "0"); layers.style.setProperty("--my", "0"); });
  }

  // ---- Crew participation: the switch changes the crew above it --------------------------------
  var crewMode = "listen", modesEl = $("modes"), modeBtns = Array.prototype.slice.call(modesEl.querySelectorAll("button"));
  function renderMode(focus) {
    modeBtns.forEach(function (b) {
      var on = b.dataset.mode === crewMode;
      b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on ? 0 : -1;
      if (on) { slide(modesEl, b); if (focus) b.focus(); }
    });
    $("crewRow").setAttribute("data-mode", crewMode);
    $("modeDesc").textContent = t({ focus: "mode.focusd", listen: "mode.listend", team: "mode.teamd" }[crewMode]);
  }
  modeBtns.forEach(function (b, i) {
    b.addEventListener("click", function () { crewMode = b.dataset.mode; renderMode(false); });
    b.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault(); crewMode = modeBtns[(i + d + modeBtns.length) % modeBtns.length].dataset.mode; renderMode(true);
    });
  });
  window.addEventListener("resize", function () { renderMode(false); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { renderMode(false); });

  // ---- Downloads: one primary per card ----------------------------------------------------------
  function renderDownloads() {
    var live = !!(CONFIG.downloads.mac || CONFIG.downloads.win);
    var want = /Win/i.test(navigator.platform || navigator.userAgent || "") ? "win" : "mac";
    if (!CONFIG.downloads[want]) want = CONFIG.downloads.mac ? "mac" : "win";   // one primary, even if only one build is out
    document.querySelectorAll(".dl").forEach(function (a) {
      var url = CONFIG.downloads[a.dataset.os];
      a.classList.toggle("live", !!url);
      if (url) { a.href = url; a.removeAttribute("aria-disabled"); a.removeAttribute("tabindex"); }
      else { a.removeAttribute("href"); a.setAttribute("aria-disabled", "true"); }
      var primary = !!url && a.dataset.os === want;
      a.classList.toggle("btn-primary", primary); a.classList.toggle("btn-quiet", !primary);
    });
    var submit = document.querySelector("#waitlist button[type=submit]");
    submit.classList.toggle("btn-primary", !live); submit.classList.toggle("btn-quiet", live);
  }

  // ---- Waitlist ---------------------------------------------------------------------------
  var form = $("waitlist"), email = $("email"), msg = $("formMsg");
  email.addEventListener("input", function () { email.removeAttribute("aria-invalid"); msg.textContent = ""; });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      email.setAttribute("aria-invalid", "true");
      msg.textContent = t("get.bademail");
      email.focus();
      return;
    }
    var btn = form.querySelector("button[type=submit]");
    function done(key) { $("doneText").textContent = t(key).replace("{email}", v); form.classList.add("sent"); }
    if (!CONFIG.waitlistEndpoint) { done("get.thankspreview"); return; }
    btn.disabled = true;
    fetch(CONFIG.waitlistEndpoint, {
      method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ email: v, use: $("use").value, lang: lang })
    }).then(function (r) { if (!r.ok) throw new Error(r.status); done("get.thanksd"); })
      .catch(function () { msg.textContent = t("get.fail"); })
      .then(function () { btn.disabled = false; });
  });

  applyCopy();
})();
