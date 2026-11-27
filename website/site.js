/* Sympo website (the name lives in BRAND below): copy (EN / 中文), theme, the live board, the zones board, the crew switch and the waitlist. No dependencies. */
(function () {
  "use strict";

  // ---- Go-live settings -------------------------------------------------------------------
  // Fill these in to make Download real. Until a build is live, everyone joins the waitlist. Sign-ups go to
  // functions/api/waitlist.js on Cloudflare Pages; anywhere that can't take them (a local preview, or Pages with
  // no KV bound yet), Join says sign-ups aren't open and sends nothing. It never claims a sign-up it didn't make.
  var CONFIG = {
    downloads: {
      mac: "",   // e.g. "https://github.com/hlf2010-art/Vellum/releases/latest/download/Vellum-mac.dmg"
      win: ""    // e.g. "https://github.com/hlf2010-art/Vellum/releases/latest/download/Vellum-Setup.exe"
    },
    demo: "",            // The in-browser demo, built from the repo. Until it's set, the Try the demo button stays hidden.
    waitlistEndpoint: "/api/waitlist" // One POST {email, os, use, lang} as JSON; os is "mac" or "win". 404/405/501/503 = not open yet.
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

  // What the crew writes arrives as it's written: word by word (character by character in Chinese),
  // each piece settling in from a soft blur. Layout is fixed from the start, so nothing around it moves.
  // Your own cards never stream: you put them down whole.
  function stream(el, delay, done) {
    if (!el || reduced) { if (done) done(); return 0; }
    // Clause spans (Chinese line breaks) stay in place: words stream in inside each clause.
    var orig = el.innerHTML, text = el.textContent, cls = el.querySelectorAll(".cl");
    Array.prototype.forEach.call(cls.length ? cls : [el], function (box) {
      var s = box.textContent, parts = s.match(/[⺀-鿿＀-￯]|[^\s⺀-鿿＀-￯]+\s*|\s+/g) || [s];
      box.innerHTML = parts.map(function (p) { return '<span class="tok">' + esc(p) + "</span>"; }).join("");
    });
    var toks = el.querySelectorAll(".tok"), cjk = /[⺀-鿿]/.test(text), step = cjk ? 34 : 62;
    toks.forEach(function (t, i) { setTimeout(function () { t.classList.add("in"); }, (delay || 0) + i * step); });
    var total = (delay || 0) + toks.length * step + 260;
    setTimeout(function () { if (el.querySelector(".tok")) el.innerHTML = orig; if (done) done(); }, total);
    return total;
  }

  // An AI crew member signs with its role icon, a person with their initial, so who's who reads at a glance.
  // Crew avatars match the app: the member's icon on its own pale plate, one hue each. People keep a letter.
  var CREWH = { scout: 200, strategist: 305, wright: 100, critic: 262 };
  function crewAv(name, cls) {
    var k = name.toLowerCase();
    return '<b class="' + (cls == null ? "av" : cls) + ' ai" style="--h:' + CREWH[k] + '" title="' + name + '"><svg aria-hidden="true"><use href="#i-' + k + '"/></svg></b>';
  }

  // The product name, in one place: the public name may still change.
  var BRAND = "Sympo";

  // ---- Copy -------------------------------------------------------------------------------
  // Written in each language, not translated. One idea per line; small print only where it prevents a mistake.
  var T = {
    en: {
      "skip": "Skip to content",
      "nav.why": "Why {brand}", "nav.how": "How it works", "nav.crew": "The crew",
      "cta.get": "Get {brand}",
      "hero.title": "Your best thinking deserves more than a chat box.", "hero.t1": "Your best thinking deserves more than ", "hero.kw": "a chat box", "hero.t2": ".",
      "hero.lede": "Put the whole problem on one board. Let an AI crew argue it out. Every choice keeps its reasons.",
      "board.hint": "Drag any card", "board.replay": "Play again",
      "why.t1": "Most AI canvases help you make more.", "why.t2": "{brand} helps you think it through.",
      "why.lede": "The best meetings skip the slides and go to the whiteboard. Then someone wipes it.",
      "why.l1": "Evidence", "why.l2": "Directions", "why.l3": "Decision",
      "why.h1": "A generator canvas", "why.h2": "{brand}",
      "why.a1": "Forty images and a vague feeling", "why.b1": "Three directions, each showing what it rests on",
      "why.a2": "Cards that just happen to sit close", "why.b2": "Relations with names: supports, counters, refines",
      "why.a3": "Rejected ideas, lost in final_v3", "why.b3": "Ideas you passed on, kept with the reason",
      "why.a4": "A decision nobody remembers making", "why.b4": "A decision that speaks up when the facts change",
      "how.title": "Every card knows where it came from.",
      "how.lede": "Pick a card to see what it rests on.",
      "out.title": "Then make it real.", "out.lede": "Whatever you ship remembers why.", "out.label": "Outputs",
      "out.plan": "Plan", "out.tasks": "Tasks", "out.table": "Table", "out.cut": "Cut", "out.site": "Site",
      "doc.h": "Rough cut, moments marked", "doc.why": "Why this", "doc.whyv": "Editors want the busywork done and the moments left to them.",
      "doc.rests": "Evidence", "doc.k1": "Observed", "doc.e1": "Editors undo 6 of every 10 cuts the AI makes", "doc.k2": "Quote", "doc.e2": "“Give me a first pass. The moments are mine.”",
      "doc.aside": "Not chosen", "doc.a1": "A, one-click cut: it picks the moments for you", "doc.a2": "C, suggestions only: saves almost no time",
      "kb.todo": "To do", "kb.doing": "Doing", "kb.done": "Done", "kb.1": "Pre-mark top 5 moments", "kb.2": "Long-clip test, 10 editors",
      "kb.3": "Moment markers on the timeline", "kb.4": "Undo-rate tracking", "kb.5": "Beta with 20 editors", "kb.t1": "2h ago", "kb.t2": "Yesterday", "kb.t3": "40m ago", "kb.t4": "Done Tue", "kb.t5": "Done Mon",
      "tb.h": "Beta, 20 editors", "tb.table": "Table", "tb.chart": "Chart", "tb.r1": "Faster than by hand",
      "tb.r2": "Kept the rough cut", "tb.r3": "Long clips felt slow", "tb.r4": "Agent missed a moment",
      "cut.line": "Your moments. Its busywork.", "site.h": "Your moments. Its busywork.", "site.p": "A rough cut in minutes. You pick what stays.", "site.cta": "Try it free",
      "z.1": "Gather", "z.1d": "What people did and said",
      "z.2": "Explore", "z.2d": "Judgments, then directions",
      "z.3": "Prototype", "z.3d": "Built from one direction",
      "z.4": "Snapshot", "z.4d": "A version to share, reasons attached",
      "cases.t1": "Product design", "cases.t2": "Short video", "cases.t3": "AI products",
      "crew.title": "A crew that thinks with you, and sometimes against you.",
      "crew.scout": "Weighs the evidence", "crew.scoutq": "“These two bad reviews came from the same person.”",
      "crew.strat": "Forks it into directions", "crew.stratq": "“If B is right, editors keep 9 in 10 rough cuts.”",
      "crew.wright": "Builds the proof", "crew.wrightq": "“The moment-marker prototype for B is ready. Keep it?”",
      "crew.critic": "Checks it against the sources", "crew.criticq": "“Nothing here says editors want one click.”",
      "crew.agency": "Constructive challenges. Faster decisions.",
      "mode.focus": "Focus", "mode.listen": "Listening", "mode.team": "Teamwork",
      "mode.focusd": "Nothing interrupts you. What they notice waits until you're back.",
      "sc.wait": "waiting", "sc.backK": "While you focused", "sc.backT": "3 notes from the crew",
      "sc.srcK": "Quote · Editor interview", "sc.srcB": "“Most of my time goes to finding the good shots the AI cut.”",
      "sc.note": "Editing is too slow. Ship one-click final cut.",
      "sc.critic": "The interview is about good shots getting cut, not speed. One click would cut more. Let editors pick the moments first?", "sc.draftK": "Prototype · draft", "sc.draftT": "One-click flow prototype", "sc.keep": "Keep", "sc.discard": "Discard",
      "mode.listend": "They speak up only when something doesn't add up.",
      "mode.teamd": "They draft alongside you. You keep what's good.",
      "modes.label": "How much the crew joins in",
      "get.title": "Get {brand}.",
      "get.l1": "Early builds for Mac and Windows are on the way.", "get.l2": "We'll email you the day yours is ready.",
      "get.os": "Preferred system", "get.mac": "macOS", "get.win": "Windows", "get.use": "What will you use it for?", "get.email": "Email",
      "get.useph": "A product launch, a short film…", "get.step": "Request early access", "get.close": "Close", "get.join": "Join",
      "get.needos": "Pick a system first.", "get.needemail": "Where should we write to?", "get.needuse": "A few words on what it's for.",
      "cta.waitlist": "Join the waitlist", "cta.demo": "Try the demo", "get.dlfor": "Download for {os}",
      "get.thanks": "You're on the list.", "get.thanksos": "You're on the list for {os}.",
      "get.thanksd": "We'll email {email} the day it's ready.",
      "get.closed": "Sign-ups open soon. Nothing was sent.",
      "get.bademail": "That doesn't look like an email address.",
      "get.fail": "That didn't go through. Try again in a moment.",
      "board.label": "A {brand} board deciding how an AI video-editing agent should work",
      "lang.label": "Language", "theme.switch": "Switch theme", "steps.label": "Demo steps", "cases.label": "Use cases",
      "title": "{brand}: your best thinking deserves more than a chat box"
    },
    zh: {
      "skip": "跳到正文",
      "nav.why": "为什么选 {brand}", "nav.how": "工作方式", "nav.crew": "AI 团队",
      "cta.get": "抢先体验",
      "hero.title": "好想法，何必挤在对话框里。", "hero.t1": "好想法，何必挤在", "hero.kw": "对话框", "hero.t2": "里。",
      "hero.lede": "把问题摊在白板上，让 AI 陪你聊透。怎么定的、为什么，都有据可查。",
      "board.hint": "试试拖动卡片", "board.replay": "重播",
      "why.t1": "别的 AI 帮你​多做一点。", "why.t2": "{brand} 帮你​想透一点。",
      "why.lede": "最好的讨论，不放 PPT，只用白板。可白板，迟早要擦。",
      "why.l1": "证据", "why.l2": "方向", "why.l3": "决策",
      "why.h1": "生成式画布", "why.h2": "{brand}",
      "why.a1": "生成四十张图，还是说不清哪张好", "why.b1": "三个方向，依据一目了然",
      "why.a2": "卡片挨着放，关系全靠猜", "why.b2": "支持、反驳、细化，关系一清二楚",
      "why.a3": "否掉的方案，埋在一堆“最终版”里", "why.b3": "没选的方案，理由也留着",
      "why.a4": "当初为什么这么定，没人记得", "why.b4": "情况一变，它提醒你回头看看",
      "how.title": "每张卡片，​都有出处。",
      "how.lede": "点开任意一张，来龙去脉都在。",
      "out.title": "想透了，再动手。", "out.lede": "做出什么，都说得清为什么。", "out.label": "产出",
      "out.plan": "方案", "out.tasks": "任务", "out.table": "表格", "out.cut": "成片", "out.site": "网站",
      "doc.h": "粗剪 + 高光标记", "doc.why": "为什么选它", "doc.whyv": "剪辑师只想让 AI 干杂活，高光要自己挑。",
      "doc.rests": "证据", "doc.k1": "实测", "doc.e1": "AI 剪的 10 刀，剪辑师撤回了 6 刀", "doc.k2": "原话", "doc.e2": "“先给我个粗剪，高光我自己挑。”",
      "doc.aside": "没选", "doc.a1": "A 一键成片：高光被它替你挑了", "doc.a2": "C 只给建议：省不了多少时间",
      "kb.todo": "待办", "kb.doing": "进行中", "kb.done": "已完成", "kb.1": "预标 5 个高光", "kb.2": "10 人长素材测试",
      "kb.3": "时间线高光标记", "kb.4": "撤回率统计", "kb.5": "20 位剪辑师内测", "kb.t1": "2 小时前", "kb.t2": "昨天", "kb.t3": "40 分钟前", "kb.t4": "周二完成", "kb.t5": "周一完成",
      "tb.h": "内测：20 位剪辑师", "tb.table": "表格", "tb.chart": "图表", "tb.r1": "比手动剪更快",
      "tb.r2": "保留了粗剪", "tb.r3": "长素材偏慢", "tb.r4": "漏掉了高光",
      "cut.line": "高光你来挑，杂活它来干。", "site.h": "高光你来挑，杂活它来干。", "site.p": "几分钟出粗剪，留什么你说了算。", "site.cta": "免费试用",
      "z.1": "收集", "z.1d": "用户怎么做、怎么说",
      "z.2": "探索", "z.2d": "先下判断，再分方向",
      "z.3": "原型", "z.3d": "挑一个方向，做出来",
      "z.4": "定稿", "z.4d": "附上理由，随时分享",
      "cases.t1": "产品设计", "cases.t2": "短视频", "cases.t3": "AI 产品",
      "crew.title": "肯唱反调，​才算好搭档。",
      "crew.scout": "核查证据", "crew.scoutq": "“这两条差评，其实是同一个人发的。”",
      "crew.strat": "拆出几个方向", "crew.stratq": "“如果 B 成立，10 个粗剪能留下 9 个。”",
      "crew.wright": "做原型验证", "crew.wrightq": "“B 方案的原型好了，要保留吗？”",
      "crew.critic": "对照来源挑刺", "crew.criticq": "“没有任何证据说明，剪辑师想要一键成片。”",
      "crew.agency": "提出建设性的质疑，让决定更快落地。",
      "mode.focus": "专注", "mode.listen": "旁听", "mode.team": "协作",
      "mode.focusd": "绝不打扰。有发现先记下，等你回来再说。",
      "sc.wait": "条待看", "sc.backK": "专注期间", "sc.backT": "团队记下了 3 条",
      "sc.srcK": "原话 · 剪辑师访谈", "sc.srcB": "“最花时间的，是把 AI 剪掉的好镜头一个个找回来。”",
      "sc.note": "剪辑太费时间，那就做一键成片。",
      "sc.critic": "访谈说的是好镜头被剪掉，不是剪得慢。一键成片只会剪掉更多。先让剪辑师自己挑高光？", "sc.draftK": "原型 · 草稿", "sc.draftT": "一键成片流程原型", "sc.keep": "保留", "sc.discard": "丢弃",
      "mode.listend": "平时不出声，发现不对劲才开口。",
      "mode.teamd": "和你一起起草，好的留下就行。",
      "modes.label": "AI 团队的参与程度",
      "get.title": "抢先体验 {brand}。",
      "get.l1": "Mac 和 Windows 内测版即将推出。", "get.l2": "留下邮箱，上线第一时间通知你。",
      "get.os": "常用系统", "get.mac": "macOS", "get.win": "Windows", "get.use": "打算用它做什么？", "get.email": "邮箱",
      "get.useph": "比如：新品立项、短视频脚本……", "get.step": "申请内测资格", "get.close": "关闭", "get.join": "提交",
      "get.needos": "请先选择系统。", "get.needemail": "请填写邮箱。", "get.needuse": "简单说说你的用途。",
      "cta.waitlist": "加入内测", "cta.demo": "在线体验", "get.dlfor": "下载 {os} 版",
      "get.thanks": "你已加入内测名单。", "get.thanksos": "你已加入 {os} 版内测名单。",
      "get.thanksd": "上线后，我们会第一时间发邮件到 {email}。",
      "get.closed": "报名通道即将开放，本次信息未提交。",
      "get.bademail": "邮箱格式好像不对。",
      "get.fail": "提交失败，请稍后再试。",
      "board.label": "{brand} 白板演示：AI 剪辑助手该怎么工作",
      "lang.label": "语言 Language", "theme.switch": "切换深色或浅色外观", "steps.label": "演示步骤", "cases.label": "使用场景",
      "title": "{brand} 思波：好想法，何必挤在对话框里"
    }
  };

  // The hero board: an AI video-editing agent deciding how much to cut on its own (Mars chose it, 2026-11-27).
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
        e1: { k: "Observed", t: "Session logs", b: "Editors undo 6 of 10 cuts the agent makes.", by: "You" },
        e2: { k: "Reported", t: "Reviews", b: "34 reviews say it cut the best moment.", by: "Scout" },
        e3: { k: "Quote", t: "Editor", b: "Give me a first pass. The moments are mine.", by: "You" },
        j1: { k: "Judgment", t: "Editors want the busywork done and the moments left to them.", b: "Logs, reviews and an editor's own words all point here.", by: "You + Scout" },
        dA: { k: "Direction", t: "One-click final cut", b: "Upload, get a finished video.", by: "Strategist" },
        dB: { k: "Direction", t: "Rough cut, moments marked", b: "It trims the dead air. You pick the moments.", by: "Strategist" },
        dC: { k: "Direction", t: "Suggestions only", b: "It comments. You make every cut.", by: "Strategist" },
        st: { k: "Critic", b: "One click hides the cuts editors undo most. And nobody asked for it." },
        dc: { k: "Decision", t: "Ship the rough cut. Editors mark the moments.", by: "You", rests: "Rests on", aside: "Not chosen",
              ev: ["6 of 10 cuts undone", "“The moments are mine.”"], A: "One-click final cut", C: "Suggestions only" },
        pB: { k: "Prototype", b: "24 minutes of footage, rough-cut to 6. You mark the moments.", by: "Wright" },
        n1: { k: "Observed · new", t: "Beta test", b: "On long clips, picking moments takes longer than cutting by hand.", by: "You" }
      },
      adopted: "<strong>Chosen.</strong> It does the cuts editors keep, and leaves them the moments.",
      asideA: "<strong>Not chosen.</strong> Fast, but it picks the moments for you.",
      asideC: "<strong>Not chosen.</strong> You keep control, but save no time.",
      back: "Back in play",
      flagH: "New counter since you chose",
      reopen: "Reopen", holds: "Still holds",
      heldNote: "Still holds. Fix: the agent pre-marks its top 5 moments.",
      // The reviews Scout read, as they sit in the spreadsheet. [[...]] marks what matched.
      sheet: { head: ["Review", "★"], rows: [[212, "Saved me an hour", 5], [213, "It [[cut the punchline]]", 2], [214, "Exports are quick", 4], [215, "[[Dropped my best take]]", 2], [216, "[[Cut the reaction shot]]", 1]] },
      reopenedNote: "Reopened. A and C are back in play.",
      supports: "supports", counters: "counters"
    },
    zh: {
      steps: ["证据", "判断", "方向", "决策", "新证据"],
      captions: [
        "先摆出已知的事实。",
        "得出判断，标明依据。",
        "Strategist 拆出方向，Critic 提出质疑。",
        "你选了 B。没选的也留着，理由都在。",
        "新证据不利于 B。重新讨论，或写下它为何仍然成立。"
      ],
      reopened: "已重新讨论，之前的思路一条没丢。",
      held: "仍然成立。你的理由已和反证放在一起。",
      cards: {
        e1: { k: "实测", t: "操作日志", b: "AI 剪的 10 刀，剪辑师撤回了 6 刀。", by: "你" },
        e2: { k: "反馈", t: "用户评价", b: "34 条评价说，最精彩的部分被剪掉了。", by: "Scout" },
        e3: { k: "原话", t: "剪辑师", b: "先给我个粗剪，高光我自己挑。", by: "你" },
        j1: { k: "判断", t: "剪辑师希望 AI 干杂活，高光留给自己挑。", b: "日志、评价和剪辑师原话，都指向这一点。", by: "你 + Scout" },
        dA: { k: "方向", t: "一键成片", b: "上传素材，直接出成片。", by: "Strategist" },
        dB: { k: "方向", t: "粗剪 + 高光标记", b: "它剪掉冗余，高光由你来挑。", by: "Strategist" },
        dC: { k: "方向", t: "只给建议", b: "它只提意见，每一刀都由你剪。", by: "Strategist" },
        st: { k: "Critic", b: "一键成片恰好藏起了剪辑师最常撤回的那几刀。况且，根本没人提过这个需求。" },
        dc: { k: "决策", t: "先上线粗剪，高光交给剪辑师标。", by: "你", rests: "依据", aside: "没选",
              ev: ["10 刀撤回 6 刀", "“高光我自己挑。”"], A: "一键成片", C: "只给建议" },
        pB: { k: "原型", b: "24 分钟素材，粗剪到 6 分钟。高光由你来标。", by: "Wright" },
        n1: { k: "实测 · 新", t: "内测", b: "素材一长，挑高光比自己剪还慢。", by: "你" }
      },
      adopted: "<strong>已选定。</strong>剪辑师会保留的刀它来剪，高光留给人挑。",
      asideA: "<strong>没选。</strong>快是快，但高光它替你挑了。",
      asideC: "<strong>没选。</strong>掌控感有了，时间没省下。",
      back: "重新考虑",
      flagH: "选定后出现 1 条新反证",
      reopen: "重新讨论", holds: "仍然成立",
      heldNote: "仍然成立。改进：AI 先预标 5 个高光。",
      sheet: { head: ["评价", "★"], rows: [[212, "帮我省了一小时", 5], [213, "[[笑点被剪没了]]", 2], [214, "导出挺快", 4], [215, "[[最好的一条没了]]", 2], [216, "[[反应镜头被剪掉了]]", 1]] },
      reopenedNote: "已重新讨论，A 和 C 也重新考虑。",
      supports: "支持", counters: "反驳"
    }
  };

  // Labels for the note a card opens on the zones board.
  var POPL = {
    en: { label: "Why this card", src: "Source", why: "Why this one", whyNot: "Why not", rests: "Rests on", led: "Led to", tested: "Tested", notChosen: "Not chosen" },
    zh: { label: "这张卡片的来龙去脉", src: "来源", why: "为什么选它", whyNot: "为什么没选", rests: "依据", led: "带出了", tested: "测试结果", notChosen: "没选" }
  };

  // The zones board: the same four zones, filled in for three kinds of work.
  var CASES = {
    en: {
      product: {
        e1: { k: "Reported", t: "Returns", b: "“Hurts my nose after an hour.” 38 of them.", page: "Returns, last 90 days" },
        e2: { k: "Observed", t: "Wear time", b: "Worn 2 hours a day after the first week." },
        j: { t: "Weight, not features, is why they come off." },
        A: { t: "Bigger battery, same frame", why: "Even heavier." },
        B: { t: "32 g frame, battery in the temple tips", b: "Chosen. Light enough to forget." },
        C: { t: "Drop the camera", why: "Lighter, but loses the main use." },
        P: { t: "32 g prototype", meta: "Worn 6 hours straight in testing" },
        S: { t: "Spec for the tooling review" }
      },
      video: {
        e1: { k: "Observed", t: "Retention", b: "Half the viewers leave at second 3." },
        e2: { k: "Reported", t: "Comments", b: "“Get to the point.” 60 of them." },
        j: { t: "People need the payoff first." },
        A: { t: "Voice-over hook", why: "Still slow to the payoff." },
        B: { t: "Open on the result", b: "Chosen. The payoff lands in second one." },
        C: { t: "Text card intro", why: "Reads as an ad." },
        P: { t: "Storyboard, three takes", meta: "Take 2 holds 70% past second 3" },
        S: { t: "Final cut, 15 seconds" }
      },
      ai: {
        e1: { k: "Observed", t: "Logs", b: "Users rewrite 6 of 10 drafted replies." },
        e2: { k: "Quote", t: "Interviews", b: "“It sounds like a robot.”" },
        j: { t: "Tone is the problem, not the facts." },
        A: { t: "Tone slider", why: "One more setting nobody touches." },
        B: { t: "Mirror the sender", b: "Chosen. Writes the way they write." },
        C: { t: "Reply templates", why: "Fixes tone by removing it." },
        P: { t: "Eval, 50 real cases", meta: "46 pass" },
        S: { t: "Ship to 10% of users" }
      },
      kinds: { judgment: "Judgment", direction: "Direction", prototype: "Prototype", snapshot: "Snapshot", sources: "Reasons attached", aside: "Not chosen: A, C", by: "Wright" }
    },
    zh: {
      product: {
        e1: { k: "反馈", t: "退货原因", b: "“戴一小时，鼻梁就疼。”共 38 条。", page: "退货记录 · 近 90 天" },
        e2: { k: "实测", t: "佩戴时长", b: "第一周过后，每天只戴 2 小时。" },
        j: { t: "让人摘下它的是重量，不是功能。" },
        A: { t: "加大电池，镜框不变", why: "只会更重。" },
        B: { t: "32 克镜框，电池移到镜腿末端", b: "已选定。轻到忘了自己戴着。" },
        C: { t: "去掉摄像头", why: "轻是轻了，核心用途也没了。" },
        P: { t: "32 克样机", meta: "实测连续佩戴 6 小时" },
        S: { t: "开模评审规格书" }
      },
      video: {
        e1: { k: "实测", t: "完播数据", b: "一半观众在第 3 秒划走。" },
        e2: { k: "反馈", t: "评论区", b: "“说重点！”共 60 条。" },
        j: { t: "观众想先看到结果。" },
        A: { t: "口播开场", why: "结果还是来得太慢。" },
        B: { t: "结果前置", b: "已选定。第一秒就亮出结果。" },
        C: { t: "字幕卡开场", why: "一看就像广告。" },
        P: { t: "分镜脚本，三个版本", meta: "第 2 版过了 3 秒还留住七成观众" },
        S: { t: "15 秒成片" }
      },
      ai: {
        e1: { k: "实测", t: "日志", b: "AI 起草的回复，用户改写了六成。" },
        e2: { k: "原话", t: "用户访谈", b: "“读起来像机器人。”" },
        j: { t: "问题出在语气，不在内容。" },
        A: { t: "语气滑块", why: "又多一个没人动的设置。" },
        B: { t: "模仿发件人的语气", b: "已选定。对方怎么写，它就怎么回。" },
        C: { t: "回复模板", why: "用消灭语气来解决语气问题。" },
        P: { t: "评测集：50 条真实案例", meta: "通过 46 条" },
        S: { t: "先灰度 10% 用户" }
      },
      kinds: { judgment: "判断", direction: "方向", prototype: "原型", snapshot: "定稿", sources: "附理由和证据", aside: "没选 A、C", by: "Wright" }
    }
  };
  // A quote shows where it came from: who said it, and the recording it was transcribed from.
  var WAVE = (function () {
    var h = [5, 9, 6, 12, 8, 14, 7, 10, 13, 6, 9, 11, 5, 8, 12, 7, 10, 6], o = '<span class="wave" aria-hidden="true"><i class="pl"></i>';
    h.forEach(function (v, i) { o += '<i class="w' + (i < 7 ? " on" : "") + '" style="height:' + v + 'px"></i>'; });
    return o + "</span>";
  })();
  // Evidence comes in whatever form it was captured: a screenshot, an excerpt of a spreadsheet, a clip.
  // The label on the card still says where it came from; the picture only shows what it is.
  var MEDIA = {
    // The agent's timeline as the editor saw it: the cuts they undid are left as dashed outlines.
    photo:
      '<svg class="ill" viewBox="0 0 200 84" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<rect class="ph-bg" width="200" height="84"/>' +
      '<path class="tl-tick" d="M6 5v4"/><path class="tl-tick" d="M16 5v2"/><path class="tl-tick" d="M26 5v2"/><path class="tl-tick" d="M36 5v2"/><path class="tl-tick" d="M46 5v2"/><path class="tl-tick" d="M56 5v4"/><path class="tl-tick" d="M66 5v2"/><path class="tl-tick" d="M76 5v2"/><path class="tl-tick" d="M86 5v2"/><path class="tl-tick" d="M96 5v2"/><path class="tl-tick" d="M106 5v4"/><path class="tl-tick" d="M116 5v2"/><path class="tl-tick" d="M126 5v2"/><path class="tl-tick" d="M136 5v2"/><path class="tl-tick" d="M146 5v2"/><path class="tl-tick" d="M156 5v4"/><path class="tl-tick" d="M166 5v2"/><path class="tl-tick" d="M176 5v2"/><path class="tl-tick" d="M186 5v2"/><path class="tl-tick" d="M196 5v2"/>' +
      '<rect class="tl-clip" x="6" y="16" width="40" height="18" rx="3"/><rect class="tl-undo" x="50" y="16.5" width="28" height="17" rx="3"/>' +
      '<rect class="tl-clip" x="82" y="16" width="44" height="18" rx="3"/><rect class="tl-undo" x="130" y="16.5" width="20" height="17" rx="3"/>' +
      '<rect class="tl-clip" x="154" y="16" width="40" height="18" rx="3"/>' +
      '<rect class="tl-aud" x="6" y="40" width="72" height="10" rx="2.5"/><rect class="tl-aud" x="82" y="40" width="112" height="10" rx="2.5"/>' +
      '<rect class="tl-clip dim" x="6" y="56" width="60" height="10" rx="2.5"/><rect class="tl-undo" x="70" y="56.5" width="34" height="9" rx="2.5"/><rect class="tl-clip dim" x="108" y="56" width="86" height="10" rx="2.5"/>' +
      '<path class="tl-redo" d="M58 25.5a5 5 0 1 1 1.5 3.6M58 25.5v-3.2M58 25.5h3.2"/>' +
      '<circle class="tl-glow" cx="104" cy="9" r="9"/><path class="tl-head" d="M104 7v74"/><path class="tl-cap" d="M100.5 4h7v4l-3.5 3-3.5-3Z"/></svg>',
    // A long beta session, as it was recorded. The strip below is crowded with moments still waiting to be picked.
    clip:
      '<video muted loop playsinline preload="none" poster="assets/beta-clip-poster.jpg" src="assets/beta-clip.mp4"></video>' +
      '<svg class="ill" viewBox="0 0 200 84" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<rect class="tk" x="6" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="10" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="14" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="18" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="22" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="26" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="30" y="63" width="1.6" height="5" rx=".8"/><rect class="tk on" x="34" y="60" width="1.6" height="10" rx=".8"/><rect class="tk" x="38" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="42" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="46" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="50" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="54" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="58" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="62" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="66" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="70" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="74" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="78" y="63" width="1.6" height="5" rx=".8"/><rect class="tk on" x="82" y="60" width="1.6" height="10" rx=".8"/><rect class="tk" x="86" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="90" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="94" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="98" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="102" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="106" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="110" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="114" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="118" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="122" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="126" y="63" width="1.6" height="5" rx=".8"/><rect class="tk on" x="130" y="60" width="1.6" height="10" rx=".8"/><rect class="tk" x="134" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="138" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="142" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="146" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="150" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="154" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="158" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="162" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="166" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="170" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="174" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="178" y="63" width="1.6" height="5" rx=".8"/><rect class="tk on" x="182" y="60" width="1.6" height="10" rx=".8"/><rect class="tk" x="186" y="63" width="1.6" height="5" rx=".8"/><rect class="tk" x="190" y="63" width="1.6" height="5" rx=".8"/>' +
      '<rect class="cl-track" x="0" y="81" width="200" height="3"/><rect class="cl-done" x="0" y="81" width="22" height="3"/>' +
      '<rect class="cl-time" x="162" y="8" width="30" height="12" rx="6"/><text class="cl-tx" x="177" y="16.6" text-anchor="middle">24:10</text></svg>',
    // B's first proof: the dead air is gone, the track is one tight run of clips, and the moments you marked sit on it.
    proto:
      '<svg class="ill" viewBox="0 0 200 84" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<rect class="ph-bg" width="200" height="84"/>' +
      (function () { var t = ""; for (var x = 6; x <= 196; x += 10) t += '<path class="tl-tick" d="M' + x + ' 9v' + ((x - 6) % 50 ? 2 : 4) + '"/>'; return t; })() +
      '<rect class="tl-clip" x="6" y="22" width="33" height="20" rx="3"/><rect class="tl-clip" x="40" y="22" width="27" height="20" rx="3"/>' +
      '<rect class="tl-clip" x="68" y="22" width="41" height="20" rx="3"/><rect class="tl-clip" x="110" y="22" width="22" height="20" rx="3"/>' +
      '<rect class="tl-clip" x="133" y="22" width="31" height="20" rx="3"/><rect class="tl-clip" x="165" y="22" width="29" height="20" rx="3"/>' +
      '<rect class="tl-aud" x="6" y="47" width="188" height="10" rx="2.5"/>' +
      '<path class="mk-l" d="M53 19v26M88 19v26M149 19v26"/>' +
      '<path class="mk" d="M53 14.5l3.4 3.4-3.4 3.4-3.4-3.4Z"/><path class="mk" d="M88 14.5l3.4 3.4-3.4 3.4-3.4-3.4Z"/><path class="mk" d="M149 14.5l3.4 3.4-3.4 3.4-3.4-3.4Z"/>' +
      '<rect class="cl-time" x="164" y="64" width="30" height="12" rx="6"/><text class="cl-tx" x="179" y="72.6" text-anchor="middle">6:02</text></svg>'
  };
  function unquote(t) { return String(t).replace(/^[“"「『]|[”"」』]$/g, ""); }
  var KIND_ICON = { Observed: "eye", Reported: "msg", Quote: "quote", "实测": "eye", "反馈": "msg", "原话": "quote" };

  var lang = root.lang === "zh-CN" ? "zh" : "en";
  // A language may leave a slot empty on purpose ("" is a value, not a gap), so only a missing key falls back to English.
  function has(key) { return !!T[lang] && Object.prototype.hasOwnProperty.call(T[lang], key); }
  function t(key) { var v = has(key) ? T[lang][key] : T.en[key]; return (v == null ? "" : String(v)).replace(/\{brand\}/g, BRAND); }
  // Chinese may break between any two characters, which in a short line can split a word (剪/辑师).
  // With clauses on, each clause stays whole and lines break between clauses; a clause too long for the line still wraps.
  function setCopy(el, v, clauses) {
    if (lang === "zh" && clauses) el.innerHTML = v.replace(/([，；：])/g, "$1\u0001").split("\u0001").map(function (c) { return '<span class="cl">' + esc(c) + "</span>"; }).join("");
    else el.textContent = v;
  }
  // Shrink a wrapped block to its longest line, so a balanced paragraph leaves no empty strip on the right.
  // Works inside scaled boards: line boxes and the element are measured in the same (scaled) space.
  function snug(el) {
    el.style.width = "";
    var box = el.getBoundingClientRect();
    if (!box.width) return;
    var r = document.createRange(); r.selectNodeContents(el);
    var right = 0, rects = r.getClientRects();
    for (var i = 0; i < rects.length; i++) right = Math.max(right, rects[i].right - box.left);
    if (right > 0 && right < box.width - 1) el.style.width = Math.ceil(right * el.offsetWidth / box.width + 1) + "px";
  }

  function applyCopy() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var k = el.getAttribute("data-i18n"), v = t(k);
      if (!v && !has(k)) return;
      setCopy(el, v, el.hasAttribute("data-clauses"));
    });
    $("langSel").value = lang;
    document.title = t("title");
    $("langSel").setAttribute("aria-label", t("lang.label"));
    $("themeBtn").setAttribute("aria-label", t("theme.switch"));
    $("steps").setAttribute("aria-label", t("steps.label"));
    $("caseTabs").setAttribute("aria-label", t("cases.label"));
    $("reelTabs").setAttribute("aria-label", t("out.label"));
    $("modes").setAttribute("aria-label", t("modes.label"));
    board.relabel();
    if (scene) scene.relabel();
    $("hero-title").setAttribute("aria-label", t("hero.title"));
    headline.type(true);
    zones.render(false);
    reel.relabel();
    renderMode(false);
    $("useText").setAttribute("placeholder", t("get.useph"));
    renderPicks();
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
  // Language lives at the foot of the page, like most sites: the browser's language picks it first.
  $("langSel").addEventListener("change", function () {
    lang = this.value === "zh" ? "zh" : "en";
    root.lang = lang === "zh" ? "zh-CN" : "en";
    store.set("vellum-site-lang", lang);
    applyCopy();
  });

  // While the page scrolls, things slide under a resting pointer. Anything that reacts to hover in script asks
  // this first, so a pointer that never moved can't focus, trace or dim a card. CSS hover lifts pause too.
  var lastScrollAt = 0, scrollT = 0;
  function scrollingNow() { return performance.now() - lastScrollAt < 450; }
  window.addEventListener("scroll", function () {
    lastScrollAt = performance.now();
    root.classList.add("scrolling");
    clearTimeout(scrollT); scrollT = setTimeout(function () { root.classList.remove("scrolling"); }, 200);
  }, { passive: true });

  // Hairline under the header once the page moves.
  var head = document.querySelector(".site-head");
  function onScroll() { head.classList.toggle("scrolled", window.scrollY > 4); }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  // ---- The headline's keyword ---------------------------------------------------------------
  // "a chat box" sits inside an actual chat input, a size too small for the thought, and gets typed in the way
  // you'd type into one. The open board right below is the "more".
  var headline = (function () {
    var box = $("heroKw"), txt = box.querySelector(".cb-text"), still = matchMedia("(prefers-reduced-motion: reduce)"), timers = [];
    function type(animate) {
      timers.forEach(clearTimeout); timers = [];
      var full = t("hero.kw"), chars = Array.from(full);
      box.classList.remove("typing", "sent");
      if (!animate || still.matches) { txt.textContent = full; box.classList.add("sent"); return; }
      // Hold the box at its final width so the line never reflows while letters arrive.
      txt.textContent = full; box.style.width = box.getBoundingClientRect().width + "px";
      txt.textContent = ""; box.classList.add("typing");
      var step = lang === "zh" ? 150 : 72, at = 520;
      chars.forEach(function (c, i) { timers.push(setTimeout(function () { txt.textContent = chars.slice(0, i + 1).join(""); }, at + i * step)); });
      timers.push(setTimeout(function () { box.classList.remove("typing"); box.classList.add("sent"); box.style.width = ""; }, at + chars.length * step + 650));
    }
    window.addEventListener("resize", function () { box.style.width = ""; });
    return { type: type };
  })();

  // ---- The live board ---------------------------------------------------------------------
  var board = (function () {
    var el = $("board"), stage = $("stage"), svg = $("lines"), stepsEl = $("steps"), caption = $("caption"), replayBtn = $("replay"), hint = $("boardHint");

    // Card positions in board units: [x, y, width]. Wide reads left to right; mid and narrow read top to bottom.
    var LAYOUT = {
      wide: { w: 1180, h: 768, loop: 18, max: 1.2, pos: {
        e1: [28, 36, 212], e2: [28, 262, 212], e3: [28, 520, 212],
        st: [312, 36, 200], j1: [300, 284, 232],
        dA: [584, 36, 236], dB: [584, 284, 244], dC: [584, 590, 236],
        dc: [880, 36, 284], pB: [880, 284, 252], n1: [880, 512, 236]
      } },
      mid: { w: 760, h: 1060, loop: 15, max: 1.1, pos: {
        e1: [20, 24, 228], e2: [266, 24, 228], e3: [512, 24, 228],
        st: [40, 254, 196], j1: [266, 262, 228],
        dA: [20, 480, 228], dB: [266, 480, 228], dC: [512, 480, 228],
        dc: [20, 790, 228], pB: [266, 790, 228], n1: [512, 790, 228]
      } },
      narrow: { w: 380, h: 1360, loop: 9, max: 1.12, pos: {
        e1: [12, 14, 172], e2: [196, 14, 172], e3: [12, 196, 172],
        j1: [196, 196, 172], st: [20, 356, 158],
        dA: [196, 404, 172], dB: [12, 628, 356],
        dC: [12, 864, 172], dc: [196, 864, 172],
        pB: [12, 1092, 172], n1: [196, 1164, 172]
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
      { a: "dB", b: "dc", type: "related", at: 3 },
      { a: "dB", b: "pB", type: "related", at: 3 },
      { a: "pB", b: "n1", type: "related", at: 4 },
      { a: "n1", b: "dB", type: "counters", at: 4, tag: true }
    ];
    var SHOW = { e1: 0, e2: 0, e3: 0, j1: 1, dA: 2, dB: 2, dC: 2, st: 2, dc: 3, pB: 3, n1: 4 };
    // Spotlight: each step lights only what it is about. What those cards touch stays half lit, so you still
    // see where they sit; everything else steps back but stays readable. Pointing at a card overrides it.
    var LIT = { 0: ["e1", "e2", "e3"], 1: ["j1"], 2: ["dA", "dB", "dC", "st"], 3: ["dB", "dc", "pB"], 4: ["n1"] };
    var CTX = { 3: ["dA", "dC"] };
    var litSet = {}, spotOne = null, spotT = 0;
    // While a step is being built, the light follows the card that just landed; once it is all down, the
    // whole step lights up together.
    function spotlight(id, settleAfter) {
      spotOne = id; light();
      clearTimeout(spotT);
      if (settleAfter) spotT = setTimeout(function () { spotOne = null; light(); }, settleAfter);
    }
    function light() {
      var lit = {}, ctx = {};
      (LIT[step] || []).forEach(function (id) { lit[id] = 1; });
      if (step === 4 && resolved) lit.dB = 1;
      if (spotOne && lit[spotOne]) Object.keys(lit).forEach(function (k) { if (k !== spotOne) { delete lit[k]; ctx[k] = 1; } });
      (CTX[step] || []).forEach(function (id) { ctx[id] = 1; });
      RELS.forEach(function (r) { if (lit[r.a]) ctx[r.b] = 1; if (lit[r.b]) ctx[r.a] = 1; });
      litSet = lit;
      el.classList.toggle("b-back", !lit.dB);           // the marker loop belongs to B: it steps back with it
      Object.keys(cards).forEach(function (id) {
        cards[id].classList.toggle("lit", !!lit[id]);
        cards[id].classList.toggle("ctx", !lit[id] && !!ctx[id]);
      });
      svg.querySelectorAll("path[data-a]").forEach(function (p) { p.classList.toggle("lit", !!(lit[p.dataset.a] || lit[p.dataset.b])); });
      stage.querySelectorAll(".rel-tag[data-a]").forEach(function (g) { g.classList.toggle("lit", !!(lit[g.dataset.a] || lit[g.dataset.b])); });
      el.classList.add("spotlit");
      clip();
    }
    // The beta footage plays only while its card is on the board and the board is on screen; still under reduced motion.
    var inView = false;
    function clip() {
      var v = cards.n1 && cards.n1.querySelector("video");
      if (!v) return;
      if (inView && !reduced && cards.n1.classList.contains("on")) { if (v.paused) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); } }
      else if (!v.paused) v.pause();
    }
    if (window.IntersectionObserver) new IntersectionObserver(function (en) { inView = en[0].isIntersecting; clip(); }).observe(el);
    var KI = { e1: "eye", e2: "msg", e3: "quote", j1: "judge", dA: "fork", dB: "fork", dC: "fork", st: "critic", dc: "decide", pB: "window", n1: "eye" };
    var CREW = { "Scout": 1, "Strategist": 1, "Wright": 1 };
    var mode = null, scale = 1, step = -1, timer = null, playing = false, played = false, resolved = null, dragged = false;
    var cards = {}, moved = {}, paths = {}, loop = null, later = [];
    // Choreography: cards the director is still holding back, and who is on the board right now.
    var held = {}, holdDecide = false, holdFlag = false, shownAt = {}, cursors = {};
    var track = $("track"), pinned = false, stepPx = 400, pinTop = 80, decidedAt = 0;

    function L() { return BOARD[lang]; }
    function soon(fn, ms) { later.push(setTimeout(fn, ms)); }
    function clearLater() { later.forEach(clearTimeout); later = []; }

    function build() {
      Object.keys(SHOW).forEach(function (id) {
        var c = document.createElement("div");
        c.className = "vc bcard";
        if (id === "j1" || id[0] === "d") c.classList.add("ink");
        if (id === "dc") c.classList.add("dec");
        if (id === "st") c.classList.add("sticky");
        if (id === "e3") c.classList.add("quote");
        var pic = { e1: MEDIA.photo, e2: '<table class="xl" aria-hidden="true"></table>', pB: MEDIA.proto, n1: MEDIA.clip }[id];
        if (pic) c.classList.add("has-media");
        c.dataset.id = id;
        c.innerHTML = (pic ? '<div class="media' + (id === "e2" ? " xl-wrap" : id === "n1" ? " vid" : "") + '">' + pic + "</div>" : "") + '<div class="k"><svg class="ki" aria-hidden="true"><use href="#i-' + KI[id] + '"/></svg><span class="kk"></span>' + (id === "st" ? "" : '<span class="by"></span>') + "</div>" +
          (id === "e3" ? '<div class="b"></div><div class="cite"><div class="t"></div>' + WAVE + "</div>" :
          // The decision record: what was decided, what it rests on, what was not chosen. Reasons stay on A and C.
          id === "dc" ? '<div class="t"></div><dl class="rec"><dt class="r1"></dt><dd class="ev"></dd><dt class="r2"></dt><dd class="ns"></dd></dl>' :
          (id === "st" || pic ? "" : '<div class="t"></div>') + '<div class="b"></div>') +
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
        li.firstChild.addEventListener("click", function () {
          if (pinned) { window.scrollTo({ top: window.scrollY + track.getBoundingClientRect().top - pinTop + i * stepPx + 2, behavior: reduced ? "auto" : "smooth" }); return; }
          stop(); played = true; resolved = null; stepTo(i, true);
        });
        stepsEl.appendChild(li);
      });
      replayBtn.addEventListener("click", function () { reset(); play(); });
    }

    function relabel() {
      var l = L();
      Object.keys(cards).forEach(function (id) {
        var c = cards[id], d = l.cards[id];
        var letter = { dA: "A", dB: "B", dC: "C", dc: "B" }[id];
        c.querySelector(".kk").textContent = d.k;
        var tt = c.querySelector(".t");
        if (tt) tt.innerHTML = (letter ? '<span class="chip ' + letter + '">' + letter + "</span>" : "") + '<span class="tt">' + esc(d.t) + "</span>";
        var bb = c.querySelector(".b"); if (bb) bb.textContent = d.b;
        var by = c.querySelector(".by");
        if (by) {
          var who = d.by.split(" + ");
          by.innerHTML = who.map(function (w) {
            if (CREW[w]) return crewAv(w, "");
            return '<b class="me">' + esc(w === "你" ? "你" : w.charAt(0)) + "</b>";
          }).join("");
          by.title = d.by; by.setAttribute("role", "img"); by.setAttribute("aria-label", d.by);
        }
      });
      var dc = l.cards.dc, ek = ["eye", "quote"];
      cards.dc.querySelector(".r1").textContent = dc.rests;
      cards.dc.querySelector(".r2").textContent = dc.aside;
      cards.dc.querySelector(".ev").innerHTML = dc.ev.map(function (e, i) { return '<span class="pill"><svg class="ki" aria-hidden="true"><use href="#i-' + ek[i] + '"/></svg>' + esc(e) + "</span>"; }).join("");
      cards.dc.querySelector(".ns").innerHTML = ["A", "C"].map(function (k) { return '<span class="pill off"><span class="chip ' + k + '">' + k + "</span>" + esc(dc[k]) + "</span>"; }).join("");
      cards.e2.querySelector(".xl").innerHTML = '<tr><th></th><th>' + esc(l.sheet.head[0]) + "</th><th>" + l.sheet.head[1] + "</th></tr>" +
        l.sheet.rows.map(function (r) {
          var hit = r[1].indexOf("[[") > -1, tx = esc(r[1]).replace(/\[\[(.+?)\]\]/g, "<mark>$1</mark>");
          return '<tr' + (hit ? ' class="hit"' : "") + '><td class="n">' + r[0] + '</td><td class="tx">' + tx + '</td><td class="st">' + r[2] + "</td></tr>";
        }).join("");
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
      // Pin the board while the story plays if the whole board fits on screen at a readable size.
      var head = document.querySelector(".site-head"), foot = el.parentNode.querySelector(".board-foot");
      pinTop = (head ? head.offsetHeight : 64) + 24;
      var room = window.innerHeight - pinTop - (foot ? foot.offsetHeight + 16 : 80) - 16;
      var fit = Math.min(scale, room / lay.h);
      var canPin = !reduced && mode !== "narrow" && fit >= 0.7 && fit >= scale * 0.72;
      if (canPin) scale = fit;
      if (canPin !== pinned) { pinned = canPin; track.classList.toggle("pinned", pinned); replayBtn.hidden = pinned || !(step === 4 && !playing); }
      stage.style.width = lay.w + "px"; stage.style.height = lay.h + "px";
      stage.style.left = Math.round((bw - lay.w * scale) / 2) + "px";
      stage.style.transform = "scale(" + scale + ")";
      el.style.height = Math.round(lay.h * scale) + "px";
      if (pinned) {
        stepPx = Math.round(Math.max(260, window.innerHeight * 0.48));
        track.style.setProperty("--pin-top", pinTop + "px");
        track.style.height = (el.parentNode.offsetHeight + stepPx * 4 + Math.round(window.innerHeight * 0.25)) + "px";
      } else track.style.height = "";
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
        var seen = step >= r.at && cards[r.a].classList.contains("on") && cards[r.b].classList.contains("on");
        if (!seen) {   // lines leave quickly, the way cards do
          if (p) { delete paths[key]; p.path.classList.add("out"); if (p.tag) p.tag.classList.remove("on"); (function (q) { setTimeout(function () { q.path.remove(); if (q.tag) q.tag.remove(); }, 240); })(p); }
          return;
        }
        var g = curve(box(r.a), box(r.b), true);
        // A line drawn because a card just landed is drawn by hand, even if a resize asked first.
        var fresh = animateNew || (performance.now() - Math.max(shownAt[r.a] || 0, shownAt[r.b] || 0) < 900);
        if (!p) {
          var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("class", r.type);
          path.dataset.a = r.a; path.dataset.b = r.b;
          svg.appendChild(path);
          p = paths[key] = { path: path };
          if (fresh && !reduced) {
            path.setAttribute("pathLength", "1"); path.classList.add("draw");
            setTimeout(function () { path.removeAttribute("pathLength"); path.classList.remove("draw"); }, 800);
            p.pen = r.type;
          }
          if (r.tag && !(mode === "narrow" && r.a === "n1")) {
            var tag = document.createElement("span");
            tag.className = "rel-tag " + r.type;
            tag.dataset.a = r.a; tag.dataset.b = r.b;
            stage.appendChild(tag);
            p.tag = tag;
            requestAnimationFrame(function () { requestAnimationFrame(function () { tag.classList.add("on"); }); });
          }
        }
        p.path.setAttribute("d", g.d);
        if (p.pen) { pen(p.path, p.pen); p.pen = null; }
        p.path.classList.toggle("dim", step >= 3 && !resolved && r.type === "related" && r.b !== "dB");
        p.path.classList.toggle("lit", !!(litSet[r.a] || litSet[r.b]));
        if (p.tag) { p.tag.textContent = L()[r.type]; p.tag.style.left = g.m.x + "px"; p.tag.style.top = g.m.y + "px"; p.tag.classList.toggle("lit", !!(litSet[r.a] || litSet[r.b])); }
      });
      drawLoop(animateNew);
    }

    // A marker loop around the chosen card, like circling it on a whiteboard.
    function drawLoop(animate) {
      var want = step >= 3 && resolved !== "reopen" && !holdDecide;
      if (!want) { if (loop) { var lp0 = loop; loop = null; lp0.classList.add("out"); setTimeout(function () { lp0.remove(); }, 240); } return; }
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
      animate = (animate || performance.now() - decidedAt < 400) && !reduced;
      if (!loop) {
        loop = document.createElementNS("http://www.w3.org/2000/svg", "path");
        loop.setAttribute("class", "marker");
        svg.appendChild(loop);
        if (animate && !reduced) {
          loop.setAttribute("pathLength", "1"); loop.classList.add("draw-slow");
          var lp = loop; setTimeout(function () { lp.removeAttribute("pathLength"); lp.classList.remove("draw-slow"); }, 1500);
          if (cursors.you && cursors.you.classList.contains("on")) requestAnimationFrame(function () { trace(lp); });
        }
      }
      loop.setAttribute("d", d);
      loop.setAttribute("transform", "rotate(-1.4 " + cx.toFixed(1) + " " + cy.toFixed(1) + ")");
    }

    // ---- The director: who does what, when a step plays ---------------------------------------------
    var easeIO = function (k) { return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
    var PEN = { supports: "color-mix(in srgb, var(--ok) 80%, transparent)", counters: "var(--danger)", related: "var(--label-3)" };

    // A small nib rides the tip of a line while it is being drawn, so you see which way the relation runs.
    function pen(path, type) {
      var dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("r", "3"); dot.setAttribute("class", "pen"); dot.style.fill = PEN[type] || PEN.related;
      svg.appendChild(dot);
      var len = path.getTotalLength(), t0 = performance.now(), dur = 750;
      (function f(now) {
        var k = Math.min(1, (now - t0) / dur), pt = path.getPointAtLength(easeIO(k) * len);
        dot.setAttribute("cx", pt.x); dot.setAttribute("cy", pt.y);
        dot.style.opacity = k < .85 ? 1 : (1 - k) / .15;
        if (k < 1 && dot.isConnected) requestAnimationFrame(f); else dot.remove();
      })(t0);
    }

    var CREWMADE = { dA: 1, dB: 1, dC: 1, st: 1, pB: 1 };   // written by the crew, so it streams in
    var WHO = { you: "var(--label)", scout: "var(--crew-scout)", strategist: "var(--crew-strategist)", critic: "var(--crew-critic)", wright: "var(--crew-wright)" };
    function cursor(name) {
      if (cursors[name]) return cursors[name];
      var c = document.createElement("div");
      c.className = "cursor" + (name === "you" ? " you" : "");
      c.style.setProperty("--c", WHO[name]);
      c.innerHTML = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2.5 1.8 15 8.4l-5.6 1.5-2.4 5.4Z"/></svg><span class="who"></span>';
      c.setAttribute("aria-hidden", "true");
      stage.appendChild(c);
      return (cursors[name] = c);
    }
    function nameOf(name) { return name === "you" ? (lang === "zh" ? "你" : "You") : name.charAt(0).toUpperCase() + name.slice(1); }
    // Glide a cursor to a point on the board; a cursor that isn't on the board yet drifts in from nearby.
    function moveTo(name, x, y, then) {
      var c = cursor(name), p = c._p;
      c.querySelector(".who").textContent = nameOf(name);
      if (!c.classList.contains("on")) {
        p = [x + (x > LAYOUT[mode].w / 2 ? 70 : -70), y + 60];
        c.style.setProperty("--mv", "0ms"); c.style.transform = "translate(" + p[0] + "px," + p[1] + "px)";
        void c.offsetWidth; c.classList.add("on");
      }
      var d = Math.hypot(x - p[0], y - p[1]), t = Math.round(Math.max(360, Math.min(880, 260 + d * 0.75)));
      c.style.setProperty("--mv", t + "ms"); c.style.transform = "translate(" + x + "px," + y + "px)";
      c._p = [x, y];
      if (then) soon(then, t);
      return t;
    }
    function press(name, then) {
      var c = cursor(name), r = document.createElement("span");
      c.classList.add("press"); soon(function () { c.classList.remove("press"); }, 140);
      r.className = "ripple"; r.style.setProperty("--c", WHO[name]); r.style.left = c._p[0] + 3 + "px"; r.style.top = c._p[1] + 2 + "px";
      stage.appendChild(r); setTimeout(function () { r.remove(); }, 700);
      if (then) soon(then, 160);
    }
    function leave(name, ms) { soon(function () { if (cursors[name]) cursors[name].classList.remove("on"); }, ms || 0); }
    function leaveAll() { Object.keys(cursors).forEach(function (n) { cursors[n].classList.remove("on"); }); }
    // Where a hand would put a card down: a little left of centre, near the top.
    function spot(id) { var b = box(id); return [b.x + b.w * 0.46, b.y + Math.min(b.h * 0.42, 44)]; }
    function mid(id) { var b = box(id); return [b.x + b.w / 2, b.y + b.h / 2]; }

    // A card lands from the point that placed it: lifted and soft, then settled, its shadow last.
    function reveal(id, at) {
      var c = cards[id], b = box(id), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      delete held[id];
      c.style.transition = "none";
      c.style.setProperty("--ox", ((at[0] - cx) * 0.32).toFixed(1) + "px");
      c.style.setProperty("--oy", ((at[1] - cy) * 0.32).toFixed(1) + "px");
      c.style.transformOrigin = (at[0] - b.x).toFixed(0) + "px " + (at[1] - b.y).toFixed(0) + "px";
      void c.offsetWidth;
      c.style.transition = ""; c.style.transitionDelay = "0ms";
      c.classList.add("on", "landing", "landed");
      shownAt[id] = performance.now();
      setTimeout(function () { c.classList.remove("landing"); }, 360);
      setTimeout(function () { c.classList.remove("landed"); }, 1300);
      if (id === "n1") { c.classList.remove("fresh"); void c.offsetWidth; c.classList.add("fresh"); }
      if (CREWMADE[id]) { stream(c.querySelector(".t .tt"), 120); stream(c.querySelector(".b"), id === "st" ? 160 : 420); }
      requestAnimationFrame(function () { drawLines(true); });
    }

    // Your cursor circles the chosen card, the way you'd circle it with a marker.
    function trace(path) {
      var c = cursor("you"), len = path.getTotalLength(), t0 = performance.now() + 300, dur = 1150;
      c.style.setProperty("--mv", "0ms");
      (function f(now) {
        if (!c.classList.contains("on") || !path.isConnected) return;
        var k = Math.max(0, Math.min(1, (now - t0) / dur)), pt = path.getPointAtLength(easeIO(k) * len);
        var m = path.getCTM ? path.transform.baseVal.consolidate() : null, x = pt.x, y = pt.y;
        if (m) { var q = m.matrix; x = q.a * pt.x + q.c * pt.y + q.e; y = q.b * pt.x + q.d * pt.y + q.f; }
        c.style.transform = "translate(" + x + "px," + y + "px)"; c._p = [x, y];
        if (k < 1) requestAnimationFrame(f);
      })(performance.now());
    }

    // Bring the board to step n. One step forward plays its choreography; anything else just moves there.
    function stepTo(n, animate) {
      clearLater();
      clearTimeout(spotT); spotOne = null;
      held = {}; holdDecide = false; holdFlag = false;
      var choreo = animate && !reduced && n === step + 1;
      if (!choreo) { leaveAll(); go(n, animate); if (n === 4) settle(); return; }
      if (step >= 0) go(step, false);   // finish whatever the last step was still doing
      leaveAll();
      ({ 0: evidence, 1: judgment, 2: directions, 3: decision, 4: news })[n]();
    }
    function evidence() {
      // One card at a time, so the eye has somewhere to start: yours, then the Scout's, then yours again.
      held = { e1: 1, e2: 1, e3: 1 }; go(0, true);
      moveTo("you", spot("e1")[0], spot("e1")[1], function () {
        press("you", function () {
          reveal("e1", spot("e1")); spotlight("e1");
          soon(function () {
            moveTo("scout", spot("e2")[0], spot("e2")[1], function () {
              press("scout", function () {
                reveal("e2", spot("e2")); spotlight("e2"); leave("scout", 900);
                soon(function () {
                  moveTo("you", spot("e3")[0], spot("e3")[1], function () {
                    press("you", function () { reveal("e3", spot("e3")); spotlight("e3", 1500); leave("you", 700); });
                  });
                }, 380);
              });
            });
          }, 420);
        });
      });
    }
    function judgment() {
      held = { j1: 1 }; go(1, true);
      moveTo("you", spot("j1")[0], spot("j1")[1], function () { press("you", function () { reveal("j1", spot("j1")); leave("you", 1000); }); });
    }
    function directions() {
      held = { dA: 1, dB: 1, dC: 1, st: 1 }; go(2, true);
      var o = mid("j1");
      moveTo("strategist", o[0], o[1], function () {
        press("strategist", function () {
          ["dA", "dB", "dC"].forEach(function (id, i) { soon(function () { reveal(id, o); }, i * 120); });
          soon(function () { moveTo("strategist", spot("dB")[0] - 30, spot("dB")[1] + 24); leave("strategist", 900); }, 420);
        });
      });
      soon(function () {
        moveTo("critic", spot("st")[0], spot("st")[1], function () { press("critic", function () { reveal("st", spot("st")); spotlight("st", 1900); leave("critic", 1100); }); });
      }, 1250);
    }
    // You circle B. The decision is written down beside it, then the Wright builds the first proof.
    function decision() {
      holdDecide = true; held = { dc: 1, pB: 1 }; go(3, true);
      moveTo("you", spot("dB")[0], spot("dB")[1], function () {
        press("you", function () {
          holdDecide = false; go(3, true);
          soon(function () { reveal("dc", mid("dB")); spotlight("dc"); leave("you", 300); }, 1250);
          soon(function () {
            moveTo("wright", spot("pB")[0], spot("pB")[1], function () {
              press("wright", function () { reveal("pB", spot("pB")); spotlight("pB", 1500); leave("wright", 1000); });
            });
          }, 1900);
        });
      });
    }
    function news() {
      held = { n1: 1 }; holdFlag = true; go(4, true);
      moveTo("you", spot("n1")[0], spot("n1")[1], function () {
        press("you", function () {
          reveal("n1", spot("n1")); leave("you", 900);
          soon(function () { holdFlag = false; go(4, true); settle(); }, 950);
        });
      });
    }

    function go(n, animate) {
      var prev = step;
      step = n;
      if (n < 4) resolved = null;
      Object.keys(cards).forEach(function (id) {
        var c = cards[id], on = SHOW[id] <= n && !held[id];
        if (on && !c.classList.contains("on") && animate) shownAt[id] = performance.now() + stagger(id) * 90;
        c.style.transitionDelay = on && !c.classList.contains("on") && animate && !reduced ? (stagger(id) * 90) + "ms" : "0ms";
        c.classList.toggle("on", on);
      });
      var decided = n >= 3 && resolved !== "reopen" && !holdDecide;
      if (decided && animate && !cards.dB.classList.contains("adopted")) decidedAt = performance.now();
      cards.dB.classList.toggle("adopted", decided);
      cards.dB.classList.toggle("show-note", decided);
      ["dA", "dC"].forEach(function (id) {
        cards[id].classList.toggle("aside", decided);
        cards[id].classList.toggle("show-note", decided);
        cards[id].classList.toggle("back", n >= 4 && resolved === "reopen");
      });
      cards.dB.classList.toggle("show-flag", n >= 4 && !holdFlag);
      var flag = cards.dB.querySelector(".flag");
      flag.classList.toggle("resolved", !!resolved);
      flag.classList.toggle("held", resolved === "holds");
      cards.dB.classList.toggle("resolved", !!resolved);
      if (resolved || n < 4) flag.classList.remove("waiting");
      if (n === 4 && prev < 4 && animate && !reduced && !held.n1) { cards.n1.classList.remove("fresh"); void cards.n1.offsetWidth; cards.n1.classList.add("fresh"); }
      relabel();
      setCaption(animate);
      light();
      requestAnimationFrame(function () { drawLines(animate); });   // lines need the cards' final sizes
      stepsEl.querySelectorAll("button").forEach(function (b, i) {
        b.classList.toggle("done", i < n);
        b.classList.toggle("cur", i === n);
        if (i === n) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      });
      replayBtn.hidden = !(n === 4 && !playing) || pinned;
    }
    function stagger(id) { return { e1: 0, e2: 1, e3: 2, j1: 0, dA: 0, dB: 1, dC: 2, st: 4, dc: 0, pB: 2, n1: 0 }[id] || 0; }

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

    var DWELL = [4300, 2900, 4400, 5200];
    function play() {
      if (playing) return;
      playing = true; played = true;
      var i = step < 0 ? 0 : step + 1;
      if (i > 4) i = 0;
      (function tick() {
        stepTo(i, true);
        progress(i);
        if (i >= 4) { playing = false; replayBtn.hidden = pinned; return; }
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
    function stop() { playing = false; clearTimeout(timer); clearLater(); leaveAll(); held = {}; holdDecide = false; holdFlag = false; }
    function reset() {
      stop(); moved = {}; resolved = null; step = -1;
      Object.keys(paths).forEach(function (k) { paths[k].path.remove(); if (paths[k].tag) paths[k].tag.remove(); delete paths[k]; });
      Object.keys(cards).forEach(function (id) { cards[id].classList.remove("on", "nudge", "fresh"); });
      layout();
    }

    // Point at a card and the board answers "what is this connected to?": its lines and neighbours stay,
    // everything else steps back. A short pause first, so passing over the board doesn't flicker.
    // Only a pointer that actually moves can focus a card. While you scroll, cards slide under a resting
    // pointer; that must not dim the story mid-step.
    var hotT = 0;
    function hot(id, on) {
      clearTimeout(hotT);
      if (on && scrollingNow()) return;
      svg.querySelectorAll("path[data-a]").forEach(function (p) { if (p.dataset.a === id || p.dataset.b === id) p.classList.toggle("hot", on); });
      stage.querySelectorAll(".rel-tag[data-a]").forEach(function (g) { if (g.dataset.a === id || g.dataset.b === id) g.classList.toggle("hot", on); });
      if (!on) { el.classList.remove("focus", "b-far"); Object.keys(cards).forEach(function (n) { cards[n].classList.remove("near"); }); return; }
      hotT = setTimeout(function () {
        if (!cards[id].matches(":hover") || cards[id].classList.contains("dragging")) return;
        var near = {}; near[id] = 1;
        svg.querySelectorAll("path[data-a]").forEach(function (p) { if (p.dataset.a === id) near[p.dataset.b] = 1; if (p.dataset.b === id) near[p.dataset.a] = 1; });
        Object.keys(cards).forEach(function (n) { cards[n].classList.toggle("near", !!near[n]); });
        el.classList.add("focus"); el.classList.toggle("b-far", !near.dB);
      }, 160);
    }

    // Cards are paper: they lift, tilt with the drag, and settle when you let go.
    function drag(c) {
      var sx, sy, ox, oy, lx, id = c.dataset.id, active = false, tilt = 0, raf = 0;
      // The card under the pointer is always at full strength, whatever the story is lighting at that moment.
      c.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") c.classList.add("hov"); hot(id, true); });
      c.addEventListener("pointermove", function (e) { if (e.pointerType === "mouse") { c.classList.add("hov"); if (!el.classList.contains("focus") && !active) hot(id, true); } });
      c.addEventListener("pointerleave", function () { c.classList.remove("hov"); if (!active) hot(id, false); });
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

    // Pinned, scrolling is the timeline: each half screen moves the story one step, and the bar under the
    // current step fills as you go. Scroll back and the board steps back with you. Nothing is taken from the
    // scroll itself; the page moves exactly as far as you do.
    function onScroll() {
      if (!pinned || step < 0 || playing) return;
      var scrolled = pinTop - track.getBoundingClientRect().top;
      var k = Math.max(0, Math.min(4, Math.floor(scrolled / stepPx + 0.5)));
      if (k !== step) { resolved = k < 4 ? null : resolved; stepTo(k, true); }
      stepsEl.querySelectorAll("button").forEach(function (x, i) { if (i !== step) x.style.removeProperty("--p"); });
      var b = stepsEl.querySelectorAll("button")[step];
      if (b) b.style.setProperty("--p", step >= 4 ? "100%" : (Math.max(0, Math.min(1, scrolled / stepPx + 0.5 - step)) * 100).toFixed(1) + "%");
    }
    var sr = 0;
    window.addEventListener("scroll", function () { if (!sr) sr = requestAnimationFrame(function () { sr = 0; onScroll(); }); }, { passive: true });

    // The story starts when the board comes into view: pinned, it then follows your scroll; otherwise it
    // plays on its own. Reduced motion shows the final state.
    if (reduced) { go(4, false); settle(); }
    else if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          if (!en.isIntersecting || played) return;
          played = true; io.disconnect();
          if (pinned) { stepTo(0, true); setTimeout(onScroll, 1800); } else { played = false; play(); }
        });
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
      product: // the 32 g prototype, on the scale
        '<img class="ph" src="assets/glasses-prototype.jpg" alt="" loading="lazy" decoding="async">',
      video: // the storyboard: it opens on the result (framed in B), then shows how it was made
        '<div class="sb">' + [["1-result", "0s"], ["2-process", "1s"], ["3-start", "3s"]].map(function (f, i) {
          return '<figure' + (i ? "" : ' class="on"') + '><img src="assets/storyboard-' + f[0] + '.jpg" alt="" loading="lazy" decoding="async"><figcaption>' + f[1] + "</figcaption></figure>";
        }).join("") + "</div>",
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

    // What ships, drawn as the thing itself: a spec document, the final cut, or a staged rollout.
    // Each picture carries the same three facts without words: B on top, what it rests on, A and C set aside.
    var SHIP = {
      product:
        '<svg class="ill" viewBox="0 0 200 150" aria-hidden="true">' +
        '<rect class="sheet-back" x="62" y="20" width="92" height="114" rx="7" transform="rotate(4 108 77)"/>' +
        '<rect class="sheet-front" x="50" y="16" width="96" height="118" rx="7"/>' +
        '<rect class="b-ink" x="62" y="29" width="13" height="13" rx="4"/><rect class="bar-ink" x="81" y="31.5" width="50" height="8" rx="4"/>' +
        '<rect class="bar-soft" x="62" y="52" width="72" height="5" rx="2.5"/><rect class="bar-soft" x="62" y="62" width="58" height="5" rx="2.5"/>' +
        '<rect class="pill-ok" x="62" y="77" width="26" height="9" rx="4.5"/><rect class="pill-ok" x="92" y="77" width="26" height="9" rx="4.5"/>' +
        '<g class="set-aside"><rect x="62" y="100" width="58" height="5" rx="2.5"/><rect x="62" y="111" width="44" height="5" rx="2.5"/></g></svg>',
      video:
        '<svg class="ill" viewBox="0 0 200 150" aria-hidden="true">' +
        '<rect class="frame" x="22" y="20" width="156" height="88" rx="9"/>' +
        '<circle class="glow-b" cx="78" cy="64" r="26"/><path class="frame-ink" d="M22 92c34-18 70-22 156-8v15a9 9 0 0 1-9 9H31a9 9 0 0 1-9-9Z"/>' +
        '<circle class="play" cx="100" cy="64" r="13"/><path class="play-ink" d="M96 57.5v13l11-6.5Z"/>' +
        '<rect class="track" x="22" y="120" width="156" height="8" rx="4"/><rect class="b-ink" x="22" y="120" width="52" height="8" rx="4"/>' +
        '<rect class="track-cut" x="78" y="120" width="44" height="8" rx="4"/><rect class="track-cut" x="126" y="120" width="52" height="8" rx="4"/>' +
        '<path class="playhead b-stroke" d="M74 115v18"/></svg>',
      ai:
        '<svg class="ill" viewBox="0 0 200 150" aria-hidden="true">' +
        '<rect class="sheet-front" x="20" y="18" width="160" height="114" rx="9"/><path class="soft" d="M20 36h160"/>' +
        '<circle class="dot3" cx="31" cy="27" r="2.6"/><circle class="dot3" cx="40" cy="27" r="2.6"/><circle class="dot3" cx="49" cy="27" r="2.6"/>' +
        '<rect class="b-ink" x="34" y="50" width="13" height="13" rx="4"/><rect class="bar-ink" x="53" y="52.5" width="58" height="8" rx="4"/>' +
        '<rect class="bar-soft" x="34" y="74" width="80" height="5" rx="2.5"/><rect class="bar-soft" x="34" y="84" width="64" height="5" rx="2.5"/>' +
        '<rect class="pill-ok" x="34" y="102" width="26" height="9" rx="4.5"/><rect class="pill-ok" x="64" y="102" width="26" height="9" rx="4.5"/>' +
        '<circle class="ring" cx="148" cy="88" r="20"/><circle class="ring-b" cx="148" cy="88" r="20" pathLength="100" stroke-dasharray="10 90" transform="rotate(-90 148 88)"/></svg>'
    };

    // Each case brings in evidence in a different form, so between the three you see what a board can hold:
    // a link from the store, a retention chart, a slice of the logs. The claim under it is still the card.
    var FORM = { product: { e1: "link" }, video: { e1: "chart" }, ai: { e1: "code" } };
    var LOG = [["1041", "rewritten"], ["1042", "sent"], ["1043", "rewritten"], ["1044", "rewritten"], ["1045", "sent"]];
    function formHTML(form, d) {
      if (form === "link") return '<div class="media lp"><span class="lp-ic"><svg class="ki" aria-hidden="true"><use href="#i-link"/></svg></span>' +
        '<span class="lp-tx"><span class="lp-d">admin.yourstore.com</span><span class="lp-t">' + esc(d.page) + "</span></span></div>";
      if (form === "code") return '<div class="media cb" aria-hidden="true">' + LOG.map(function (l) {
        return '<div><i>' + l[0] + "</i>draft → " + (l[1] === "rewritten" ? "<mark>rewritten</mark>" : l[1]) + "</div>"; }).join("") + "</div>";
      return '<div class="media"><svg class="ill" viewBox="0 0 200 84" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
        '<path class="rt-grid" d="M12 16h176M12 40h176M12 64h176"/>' +
        '<path class="rt-area" d="M12 16C24 17 32 24 40 44c10 6 30 8 60 10s60 4 88 6V76H12Z"/>' +
        '<path class="rt-line" d="M12 16C24 17 32 24 40 44c10 6 30 8 60 10s60 4 88 6"/>' +
        '<path class="rt-cut" d="M40 10v66"/><circle class="rt-dot" cx="40" cy="44" r="3"/><text class="rt-tx" x="45" y="74">3s</text></svg></div>';
    }

    function cardHTML(id, d, k, c) {
      var kind = function (icon, label) { return '<div class="k"><svg class="ki" aria-hidden="true"><use href="#i-' + icon + '"/></svg><span>' + esc(label) + "</span></div>"; };
      if ((id === "e1" || id === "e2") && KIND_ICON[d.k] === "quote")
        return '<article class="vc zc quote" data-id="' + id + '" tabindex="0"><div class="k"></div><div class="b">' + esc(unquote(d.b)) + '</div><div class="cite"><div class="t">' + esc(d.t) + "</div>" + WAVE + "</div></article>";
      var form = FORM[c][id];
      if (form) return '<article class="vc zc has-media" data-id="' + id + '" tabindex="0" aria-label="' + esc(d.t) + '">' + formHTML(form, d) + kind(KIND_ICON[d.k] || "eye", d.k) + '<div class="b">' + esc(d.b) + "</div></article>";
      if (id === "e1" || id === "e2") return '<article class="vc zc" data-id="' + id + '" tabindex="0">' + kind(KIND_ICON[d.k] || "eye", d.k) + '<div class="t">' + esc(d.t) + '</div><div class="b">' + esc(d.b) + "</div></article>";
      if (id === "j") return '<article class="vc zc ink wide" data-id="j" tabindex="0">' + kind("judge", k.judgment) + '<div class="t">' + esc(d.t) + "</div></article>";
      if (id === "A" || id === "C") return '<article class="vc zc ink dir aside" data-id="' + id + '" tabindex="0"><div class="t"><span class="chip ' + id + '">' + id + "</span><span>" + esc(d.t) + '</span></div><div class="veil"></div><div class="note">' + esc(d.why) + "</div></article>";
      if (id === "B") return '<article class="vc zc ink dir adopted wide" data-id="B" tabindex="0">' + kind("fork", k.direction) + '<div class="t"><span class="chip B">B</span><span>' + esc(d.t) + '</span></div><div class="b">' + esc(d.b) + "</div></article>";
      if (id === "P") return '<article class="vc zc wide proto" data-id="P" tabindex="0"><div class="media">' + ILL[c] + "</div>" + kind("window", k.prototype) + '<div class="t">' + esc(d.t) + '</div><div class="meta"><i></i><span>' + esc(d.meta) + "</span></div></article>";
      // What ships: the same anatomy as the prototype beside it. A picture of the thing, one word for what it
      // is, its name, and one quiet line of what it carries.
      return '<article class="vc zc wide proto ship" data-id="S" tabindex="0"><div class="media">' + SHIP[c] + "</div>" +
        kind("snap", k.snapshot) + '<div class="t">' + esc(d.t) + '</div><div class="meta">' + esc(k.sources) + '<span class="sep" aria-hidden="true">·</span>' + esc(k.aside) + "</div></article>";
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
      flow(set);
    }
    // A spark runs down each lit line, evidence first, so you can watch the reasoning arrive at the card.
    var flowRun = 0, SPARK = { supports: "var(--ok)", lineB: "var(--B-fill)" };
    function flow(set) {
      var run = ++flowRun;
      svg.querySelectorAll(".spark").forEach(function (d) { d.remove(); });
      if (reduced) return;
      var depth = {};
      var dep = function (n) {
        if (depth[n] != null) return depth[n];
        var d = 0;
        EDGES.forEach(function (e) { if (e[1] === n && set[e[0]]) d = Math.max(d, dep(e[0]) + 1); });
        return (depth[n] = d);
      };
      svg.querySelectorAll("path.lit").forEach(function (p) {
        var dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("r", "3.2"); dot.setAttribute("class", "spark");
        dot.style.fill = SPARK[p.getAttribute("class").split(" ")[0]] || "var(--label-2)";
        dot.style.opacity = "0";
        p.parentNode.appendChild(dot);
        var len = p.getTotalLength(), t0 = performance.now() + dep(p.dataset.a) * 200, dur = 560;
        (function f(now) {
          if (run !== flowRun || !dot.isConnected) { dot.remove(); return; }
          var k = (now - t0) / dur;
          if (k >= 0) {
            var kk = Math.min(1, k), e = kk < .5 ? 2 * kk * kk : 1 - Math.pow(-2 * kk + 2, 2) / 2, pt = p.getPointAtLength(e * len);
            dot.setAttribute("cx", pt.x); dot.setAttribute("cy", pt.y);
            dot.style.opacity = kk < .12 ? kk / .12 : kk > .8 ? (1 - kk) / .2 : 1;
            if (kk >= 1) { dot.remove(); return; }
          }
          requestAnimationFrame(f);
        })(performance.now());
      });
    }
    // Opening a card: a small note beside it that says, in the board's own words, what it rests on, why it was
    // or wasn't chosen, and what it led to. Hover only traces; a click (or tap, or Enter) opens the note.
    var pop = document.createElement("div");
    pop.className = "zpop"; pop.setAttribute("role", "dialog"); pop.hidden = true;
    zb.appendChild(pop);
    function said(id) {
      var d = CASES[lang][current][id];
      if (id === "A" || id === "B" || id === "C") return '<b class="chip ' + id + '">' + id + "</b>" + esc(d.t);
      if (id === "e1" || id === "e2") return '<i class="zk">' + esc(d.k) + "</i>" + esc(d.page ? d.b : d.b || d.t);
      return esc(d.t);
    }
    function row(label, items) { return items.length ? '<div class="zr"><span class="zl">' + esc(label) + '</span><ul>' + items.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul></div>" : ""; }
    function showPop(id) {
      var d = CASES[lang][current][id], P = POPL[lang], up = [], down = [];
      EDGES.forEach(function (e) { if (e[1] === id) up.push(e[0]); if (e[0] === id) down.push(e[1]); });
      var h = "";
      if (id === "e1" || id === "e2") h += row(P.src, [esc(d.page || d.t)]);
      if (id === "B") h += row(P.why, [esc(String(d.b).replace(/^(Chosen\.|已选定。)\s*/, ""))]);
      if (id === "A" || id === "C") h += row(P.whyNot, [esc(d.why)]);
      var data = CASES[lang][current];
      if (id === "S") up = ["B"].map(said).concat([esc(data.P.t) + '<span class="zm"> · ' + esc(data.P.meta) + "</span>"]);
      else up = up.map(said);
      h += row(P.rests, up);
      if (id === "P") h += row(P.tested, [esc(d.meta)]);
      if (id === "S") h += row(P.notChosen, ["A", "C"].map(function (k) { return said(k) + '<span class="zm">' + (lang === "zh" ? "：" : ": ") + esc(data[k].why) + "</span>"; }));
      if (id !== "A" && id !== "C") h += row(P.led, down.map(said));
      pop.innerHTML = h;
      pop.setAttribute("aria-label", P.label);
      pop.hidden = false;
      place(id);
      pop.classList.remove("in"); void pop.offsetWidth; pop.classList.add("in");
    }
    // Beside the card where there is room (right, else left); stacked boards put it under the card.
    function place(id) {
      var b = box(id), W = zb.clientWidth, pw = Math.min(280, W - 24), gap = 12, x, y;
      pop.style.width = pw + "px";
      var ph = pop.offsetHeight;
      if (b.x + b.w + gap + pw <= W - 8) { x = b.x + b.w + gap; y = b.y; pop.dataset.side = "r"; }
      else if (b.x - gap - pw >= 8) { x = b.x - gap - pw; y = b.y; pop.dataset.side = "l"; }
      else { x = Math.max(8, Math.min(W - pw - 8, b.x + (b.w - pw) / 2)); y = b.y + b.h + gap; pop.dataset.side = "b"; }
      y = Math.max(8, Math.min(y, zb.clientHeight - ph - 8));
      pop.style.left = Math.round(x) + "px"; pop.style.top = Math.round(y) + "px";
    }
    function clearTrace() {
      pop.hidden = true; pop.classList.remove("in");
      flowRun++; svg.querySelectorAll(".spark").forEach(function (d) { d.remove(); });
      zb.classList.remove("tracing");
      zb.querySelectorAll(".lit").forEach(function (n) { n.classList.remove("lit"); });
    }

    // The prototype plays once when you reach it: the glasses settle on the scale, the playhead runs, the evals tick.
    var aliveT = 0;
    function wake() {
      var c = nodes.P;
      if (!c || reduced || c.classList.contains("alive")) return;
      c.classList.add("alive");
      clearTimeout(aliveT); aliveT = setTimeout(function () { if (nodes.P) nodes.P.classList.remove("alive"); }, 2000);
    }

    function wire(c) {
      var id = c.dataset.id;
      if (id === "P") c.addEventListener("pointerenter", function () { if (!scrollingNow()) wake(); });
      c.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse" && !pinned && !scrollingNow()) { interacted = true; trace(id); } });
      c.addEventListener("pointermove", function (e) { if (e.pointerType === "mouse" && !pinned && !c.classList.contains("lit") && !scrollingNow()) { interacted = true; trace(id); } });
      c.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse" && !pinned) clearTrace(); });
      c.addEventListener("click", function () { interacted = true; if (pinned === id) { pinned = null; clearTrace(); } else { pinned = id; trace(id); showPop(id); if (id === "P") wake(); } });
      c.addEventListener("focus", function () { if (!pinned) trace(id); });
      c.addEventListener("blur", function () { if (!pinned) clearTrace(); });
      c.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.click(); } if (e.key === "Escape") { pinned = null; clearTrace(); } });
    }
    document.addEventListener("click", function (e) { if (pinned && !e.target.closest(".zc") && !e.target.closest(".zpop")) { pinned = null; clearTrace(); } });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && pinned) { var n = nodes[pinned]; pinned = null; clearTrace(); if (n) n.focus({ preventScroll: true }); } });

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
        } else { flow(lit); setTimeout(function () { if (!interacted && !pinned) clearTrace(); }, 1700); }
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

  // ---- What it becomes --------------------------------------------------------------------
  // One decision, five things you could ship. Only the one in front is lit; the rest wait at the edges.
  // It moves on by itself while you watch, and stops for good the moment you pick one.
  var reel = (function () {
    var root = $("reel"), track = $("reelTrack"), tabsEl = $("reelTabs");
    var items = Array.prototype.slice.call(track.children), tabs = Array.prototype.slice.call(tabsEl.querySelectorAll("[role=tab]"));
    var at = 0, timer = 0, seen = false, hold = false, touched = false;
    // The one in front lines up with the text column above it; the next ones wait to its right.
    var col = root.parentNode.querySelector(".wrap");
    function center() {
      var it = items[at], cs = getComputedStyle(col), left = col.getBoundingClientRect().left - root.getBoundingClientRect().left + parseFloat(cs.paddingLeft);
      root.style.setProperty("--fl", Math.max(2, Math.min(14, (left - 8) / root.clientWidth * 100)).toFixed(1) + "%");
      track.style.transform = "translateX(" + Math.round(left - it.offsetLeft) + "px)";
    }
    function go(i, user) {
      at = (i + items.length) % items.length;
      items.forEach(function (it, k) { var on = k === at; it.classList.toggle("on", on); it.setAttribute("aria-hidden", on ? "false" : "true"); });
      tabs.forEach(function (b, k) { var on = k === at; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
      root.setAttribute("aria-labelledby", tabs[at].id);
      slide(tabsEl, tabs[at]);
      center();
      if (user) { touched = true; clearTimeout(timer); } else tick();
      play();
    }
    // The finished cut plays its last seconds once each time it comes to the front, and rests on the landing.
    var vid = track.querySelector(".cut-vid");
    function play() {
      if (!vid) return;
      var on = items[at].contains(vid) && seen && !reduced;
      if (on) { try { vid.currentTime = 0; } catch (e) {} var pr = vid.play(); if (pr && pr.catch) pr.catch(function () {}); }
      else vid.pause();
    }
    function tick() {
      clearTimeout(timer);
      if (touched || reduced || !seen) return;
      timer = setTimeout(function () { if (!hold && seen && !touched) go(at + 1); else tick(); }, 3800);
    }
    tabs.forEach(function (b, i) {
      b.addEventListener("click", function () { go(i, true); });
      b.addEventListener("keydown", function (e) {
        var n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
        if (n === null) return;
        e.preventDefault(); n = (n + tabs.length) % tabs.length; go(n, true); tabs[n].focus();
      });
    });
    items.forEach(function (it, k) { it.addEventListener("click", function () { if (k !== at && !swiped) go(k, true); }); });
    // A swipe moves one step; a tap on a side card brings it to the front.
    var x0 = null, swiped = false;
    root.addEventListener("pointerdown", function (e) { x0 = e.clientX; swiped = false; });
    root.addEventListener("pointerup", function (e) {
      if (x0 === null) return;
      var dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) { swiped = true; go(at + (dx < 0 ? 1 : -1), true); }
    });
    root.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") hold = true; });
    root.addEventListener("pointerleave", function () { hold = false; });
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) {
      es.forEach(function (en) { var was = seen; seen = en.isIntersecting; if (seen) tick(); else clearTimeout(timer); if (seen !== was) play(); });
    }, { threshold: 0.5 }).observe(root);
    var rz = 0;
    window.addEventListener("resize", function () { cancelAnimationFrame(rz); rz = requestAnimationFrame(function () { slide(tabsEl, tabs[at]); center(); }); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { slide(tabsEl, tabs[at]); center(); });
    root.classList.add("still"); go(0); requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove("still"); }); });
    return { relabel: function () { slide(tabsEl, tabs[at]); center(); } };
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

  // ---- The contrast table: as you scroll, each row resolves in turn ---------------------------
  // The old way gets struck through, then the new way arrives beside it. A row resolves when it is well inside
  // the screen; rows that arrive together queue up so they still go one by one. Rows already scrolled past on
  // load (a reload halfway down) just show their final state. No JS or reduced motion: the final state.
  (function () {
    var table = document.querySelector(".contrast");
    if (!table || reduced || !("IntersectionObserver" in window)) return;
    var rows = Array.prototype.slice.call(table.tBodies[0].rows), queue = [], busy = false;
    table.classList.add("reveal");
    function pump() {
      if (busy || !queue.length) return;
      busy = true;
      queue.shift().classList.add("done");
      setTimeout(function () { busy = false; pump(); }, 340);
    }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        var row = en.target;
        if (en.isIntersecting) { io.unobserve(row); queue.push(row); queue.sort(function (a, b) { return rows.indexOf(a) - rows.indexOf(b); }); pump(); }
        else if (en.boundingClientRect.bottom < 0) { io.unobserve(row); row.classList.add("done"); }
      });
    }, { rootMargin: "0px 0px -18% 0px", threshold: 1 });
    rows.forEach(function (r) { io.observe(r); });
  })();

  // ---- The layers: stacked flat until seen, then they fan out so each step shows through ----
  var layers = $("layers");
  if (reduced || !("IntersectionObserver" in window)) layers.classList.add("open");
  else {
    // Arriving: the sheets land one after another; after that, no delays, so hover answers at once.
    var lio = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { layers.classList.add("arriving"); setTimeout(function () { layers.classList.add("open"); setTimeout(function () { layers.classList.remove("arriving"); }, 1400); }, 250); lio.disconnect(); } }); }, { threshold: 0.6 });
    lio.observe(layers);
  }
  // Point at the stack and it opens into an exploded view; leave and it settles back. On touch, a tap toggles it.
  var sheetsEl = layers.querySelector(".sheets");
  if (canHover) {
    sheetsEl.addEventListener("pointerenter", function () { layers.classList.remove("arriving"); layers.classList.add("apart"); });
    sheetsEl.addEventListener("pointerleave", function () { layers.classList.remove("apart"); layers.style.setProperty("--mx", "0"); layers.style.setProperty("--my", "0"); });
    if (!reduced) sheetsEl.addEventListener("pointermove", function (e) {
      var r = sheetsEl.getBoundingClientRect();
      layers.style.setProperty("--mx", Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2))).toFixed(3));
      layers.style.setProperty("--my", Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2))).toFixed(3));
    });
  } else sheetsEl.addEventListener("click", function () { layers.classList.toggle("apart"); });

  // ---- The crew scene: the same moment on a small board, played three ways --------------------------
  // You put down a direction and keep working. What the crew does about it, and when, is the whole
  // difference between the modes, so the board plays it out in time.
  var scene = (function () {
    var boxEl = $("sceneBox"), st = $("sceneStage");
    // The source is already on the board. You read it, write your take on a sticky beside it, and the crew answers that.
    // hops: where your pointer goes. The first is relative to your sticky (where you type), the rest are board points
    // in a patch the crew never uses, so name tags never sit on words or on each other.
    var W = 560, H = 252, D = 5600, L, LAY = {
      wide: { W: 560, H: 262, src: [22, 20, 236], mine: [46, 136, 214], bubble: [280, 118, 258], back: [300, 124], draft: [326, 108], tip: "bl", wr: [1.01, .2],
        hops: [[.9, .82], [318, 46], [376, 64], [344, 82], [430, 52], [398, 74]] },
      narrow: { W: 340, H: 394, src: [16, 16, 250], mine: [36, 128, 214], bubble: [40, 250, 280], back: [96, 256], draft: [116, 260], tip: "tl", wr: [.62, 1.04],
        hops: [[.9, .82], [72, 368], [150, 374], [112, 378], [222, 370], [186, 376]] } }, timers = [], seen = false, running = false;
    var TICKS = [0.06, 0.4, 0.52, 0.64, 0.76, 0.88];   // your pointer rests while you type, then keeps working
    // Each mode: what shows on the board, and when (as a share of the run).
    var PLAN = {
      focus: [{ x: 0.96, show: "back" }],
      listen: [{ x: 0.42, show: "dot" }, { x: 0.54, show: "bubble" }],
      team: [{ x: 0.4, show: "wright" }, { x: 0.5, show: "draft" }, { x: 0.74, show: "dot" }]
    };
    var av = function (c, l) { return '<b class="av" style="--c:' + c + '">' + l + "</b>"; };
    st.innerHTML =
      '<svg class="sc-lines" aria-hidden="true"><path id="scRel" pathLength="1"/></svg>' +
      '<article class="vc sc-card sc-src on" id="scSrc"><div class="k"><svg class="ki" aria-hidden="true"><use href="#i-quote"/></svg><span data-sc="srcK"></span></div><div class="b" data-sc="srcB"></div></article>' +
      // Your sticky note: you type your take on the source, and the crew answers what it says.
      '<article class="vc sc-card sc-note" id="scMine"><p data-sc="note"></p><span class="by"><b class="me" data-sc="me"></b></span></article>' +
      '<span class="sc-dot" id="scDot">' + crewAv("Critic") + "</span>" +
      '<div class="sc-bubble" id="scBubble" style="left:272px;top:44px;max-width:248px">' + crewAv("Critic") + '<p data-sc="critic"></p></div>' +
      '<article class="vc sc-card sc-back" id="scBack" style="left:300px;top:92px;width:222px"><div class="k"><svg class="ki" aria-hidden="true"><use href="#i-tray"/></svg><span data-sc="backK"></span></div><div class="t" data-sc="backT"></div>' +
        '<div class="sc-avs">' + crewAv("Scout") + crewAv("Critic") + crewAv("Wright") + "</div></article>" +
      '<article class="vc sc-card sc-draft" id="scDraft" style="left:304px;top:104px;width:206px"><div class="k"><svg class="ki" aria-hidden="true"><use href="#i-window"/></svg><span data-sc="draftK"></span><span class="by">' + crewAv("Wright", "") + '</span></div>' +
        '<div class="t"><span data-sc="draftT"></span></div><div class="sc-acts"><span data-sc="discard"></span><span class="keep" data-sc="keep"></span></div></article>';
    var mine = $("scMine"), bubble = $("scBubble"), back = $("scBack"), draft = $("scDraft"), dot = $("scDot"), src = $("scSrc"), rel = $("scRel"), relSvg = st.querySelector(".sc-lines");
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { snug(bubble.querySelector("p")); });

    var cur = {};
    function cursorEl(name, color) {
      if (cur[name]) return cur[name];
      var c = document.createElement("div");
      c.className = "cursor" + (name === "you" ? " you" : "");
      c.style.setProperty("--c", color);
      c.innerHTML = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2.5 1.8 15 8.4l-5.6 1.5-2.4 5.4Z"/></svg><span class="who"></span>';
      st.appendChild(c);
      return (cur[name] = c);
    }
    function glide(c, x, y, ms) {
      if (!c.classList.contains("on")) { c.style.setProperty("--mv", "0ms"); c.style.transform = "translate(" + (x + 50) + "px," + (y + 50) + "px)"; void c.offsetWidth; c.classList.add("on"); }
      c.style.setProperty("--mv", (ms || 600) + "ms"); c.style.transform = "translate(" + x + "px," + y + "px)";
    }
    function land(card, ox, oy) {
      var b = { x: card.offsetLeft, y: card.offsetTop, w: card.offsetWidth, h: card.offsetHeight };
      card.style.transition = "none";
      card.style.setProperty("--ox", ((ox - b.x - b.w / 2) * 0.32).toFixed(1) + "px");
      card.style.setProperty("--oy", ((oy - b.y - b.h / 2) * 0.32).toFixed(1) + "px");
      card.style.transformOrigin = (ox - b.x) + "px " + (oy - b.y) + "px";
      void card.offsetWidth; card.style.transition = "";
      card.classList.add("on");
    }
    function relabel() {
      var txt = { me: lang === "zh" ? "你" : "Y" };
      st.querySelectorAll("[data-sc]").forEach(function (e) { var k = e.getAttribute("data-sc"); if (k === "note" && typing) return; setCopy(e, txt[k] != null ? txt[k] : t("sc." + k), k === "critic" || k === "note" || k === "srcB"); });
      requestAnimationFrame(link);
      snug(bubble.querySelector("p"));
      if (cur.you) cur.you.querySelector(".who").textContent = lang === "zh" ? "你" : "You";
      if (cur.wright) cur.wright.querySelector(".who").textContent = "Wright";
    }
    function mbox() { return { x: mine.offsetLeft, y: mine.offsetTop, w: mine.offsetWidth, h: mine.offsetHeight }; }
    // Two layouts: side by side when there's room, stacked on a phone so the cards stay readable.
    function fit() {
      L = LAY[boxEl.clientWidth < 480 ? "narrow" : "wide"];
      W = L.W; H = L.H;
      boxEl.style.aspectRatio = W + " / " + H;
      st.style.width = W + "px"; st.style.height = H + "px";
      var put = function (e, p) { e.style.left = p[0] + "px"; e.style.top = p[1] + "px"; if (p[2]) e.style.width = p[2] + "px"; };
      put(src, L.src); put(mine, L.mine); put(bubble, L.bubble.slice(0, 2)); bubble.style.maxWidth = L.bubble[2] + "px"; snug(bubble.querySelector("p")); put(back, L.back); put(draft, L.draft);
      // The Critic's pin sits exactly where its note's avatar will be, so the note opens out of it.
      put(dot, [L.bubble[0] + 2, L.bubble[1] + 3]); dot.setAttribute("data-tip", L.tip);
      relSvg.setAttribute("viewBox", "0 0 " + W + " " + H); relSvg.setAttribute("width", W); relSvg.setAttribute("height", H);
      st.style.transform = "scale(" + (boxEl.clientWidth / W) + ")";
      link();
    }
    // The line from the source to your sticky: drawn once the sticky is down.
    function link(draw) {
      var a = { x: src.offsetLeft, y: src.offsetTop, w: src.offsetWidth, h: src.offsetHeight }, b = mbox();
      // From under the source to the top of the sticky, a little in from their left edges.
      var x1 = a.x + 44, y1 = a.y + a.h, x2 = b.x + 34, y2 = b.y, k = Math.max(14, (y2 - y1) * 0.55);
      rel.setAttribute("d", "M" + x1 + " " + y1 + " C" + x1 + " " + (y1 + k) + "," + x2 + " " + (y2 - k) + "," + x2 + " " + y2);
      if (draw && !reduced) { rel.classList.remove("draw"); void rel.getBoundingClientRect(); rel.classList.add("draw"); }
    }

    // Typing into the sticky, one character at a time, with a caret; the finished line keeps its clause breaks.
    var typing = false, noteP = mine.querySelector("p");
    function type(startMs) {
      var full = t("sc.note"), chars = Array.from(full), step = lang === "zh" ? 85 : 34;
      typing = true; noteP.textContent = ""; mine.classList.add("typing");
      chars.forEach(function (c, i) { at(startMs + i * step, function () { noteP.textContent = chars.slice(0, i + 1).join(""); }); });
      at(startMs + chars.length * step + 380, function () { typing = false; mine.classList.remove("typing"); setCopy(noteP, full, true); });
    }
    function reset() {
      timers.forEach(clearTimeout); timers = [];
      if (typing) { typing = false; mine.classList.remove("typing"); setCopy(noteP, t("sc.note"), true); }
      [mine, bubble, back, draft, dot].forEach(function (e) { e.classList.remove("on"); });
      relSvg.classList.remove("on");
      Object.keys(cur).forEach(function (n) { cur[n].classList.remove("on"); });
    }
    function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
    function show(what, instant) {
      if (what === "dot") dot.classList.add("on");
      if (what === "bubble") { bubble.classList.add("on"); if (!instant) stream(bubble.querySelector("p"), 180); }
      if (what === "back") instant ? back.classList.add("on") : land(back, W - 30, H - 30);
      if (what === "draft") { var mb = mbox(); if (instant) draft.classList.add("on"); else { land(draft, mb.x + mb.w * L.wr[0], mb.y + mb.h * L.wr[1]); stream(draft.querySelector(".t span"), 260); } }
      if (what === "wright" && !instant) {
        var w = cursorEl("wright", "var(--crew-wright)"), m = mbox(); relabel();
        glide(w, m.x + m.w * L.wr[0], m.y + m.h * L.wr[1], 520);
        at(1250, function () { w.classList.remove("on"); });
      }
    }
    // The end state of a mode, all at once: for reduced motion, and while the board is off screen.
    function still(mode) {
      reset(); mine.classList.add("on"); relSvg.classList.add("on"); rel.classList.remove("draw");
      PLAN[mode].forEach(function (e) { show(e.show, true); });
    }
    function play(mode) {
      if (reduced || !seen) { still(mode); return; }
      reset(); running = true; relabel();
      var you = cursorEl("you", "var(--label)"); relabel();
      var m = mbox(), P = function (fx, fy) { return [m.x + m.w * fx, m.y + m.h * fy]; };
      // You put the card down from its corner, then keep working on the empty board beside it: one small move
      // per tick, in a patch the crew never uses, so name tags never sit on words or on each other.
      var hops = L.hops.map(function (h, i) { return i ? h : P(h[0], h[1]); });
      glide(you, hops[0][0], hops[0][1], 0);
      noteP.textContent = ""; typing = true;
      at(240, function () { land(mine, hops[0][0], hops[0][1]); });
      at(420, function () { relSvg.classList.add("on"); link(true); });
      type(620);
      TICKS.forEach(function (x, i) {
        if (i) at(x * D, function () { glide(you, hops[i][0], hops[i][1], 420); });
      });
      PLAN[mode].forEach(function (e) { at(e.x * D, function () { show(e.show); }); });
      at(D + 300, function () { you.classList.remove("on"); running = false; });
    }

    fit(); relabel(); still("listen");
    window.addEventListener("resize", fit);
    boxEl.addEventListener("click", function () { play(crewMode); });
    if ("IntersectionObserver" in window && !reduced) {
      var sio = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting && !seen) { seen = true; sio.disconnect(); setTimeout(function () { play(crewMode); }, 300); } }); }, { threshold: 0.6 });
      sio.observe(boxEl);
    }
    return { play: play, relabel: relabel, idle: function () { return !running; } };
  })();

  // ---- Crew participation: the switch replays the small board it sits on ------------------------
  var crewMode = "listen", modesEl = $("modes"), modeBtns = Array.prototype.slice.call(modesEl.querySelectorAll("button"));
  function renderMode(focus) {
    modeBtns.forEach(function (b) {
      var on = b.dataset.mode === crewMode;
      b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on ? 0 : -1;
      if (on) { slide(modesEl, b); if (focus) b.focus(); }
    });
    var desc = $("modeDesc"), next = t({ focus: "mode.focusd", listen: "mode.listend", team: "mode.teamd" }[crewMode]);
    if (desc.textContent === next) return;
    if (reduced || !desc.textContent) { desc.textContent = next; return; }
    clearTimeout(desc._swap); desc.classList.add("swap");
    desc._swap = setTimeout(function () { desc.textContent = next; desc.classList.remove("swap"); }, 110);
  }
  modeBtns.forEach(function (b, i) {
    b.addEventListener("click", function () { var was = crewMode; crewMode = b.dataset.mode; renderMode(false); if (was !== crewMode || scene.idle()) scene.play(crewMode); });
    b.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault(); crewMode = modeBtns[(i + d + modeBtns.length) % modeBtns.length].dataset.mode; renderMode(true); scene.play(crewMode);
    });
  });
  window.addEventListener("resize", function () { renderMode(false); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { renderMode(false); });

  // ---- Get the app: one button, then a short form ---------------------------------------------------------
  // "Join the waitlist" opens a small dialog: email, which system (picked for you from the browser; a phone or
  // tablet can't tell, so nothing is picked there) and, in their own words, what it's for. All three are needed.
  // The ×, Esc or a click outside closes it without joining and keeps what was typed. Once a build is live for
  // the visitor's system, the button becomes its download.
  var form = $("waitlist"), email = $("email"), dlGo = $("dlGo"), openBtn = $("joinOpen");
  var dlg = $("more"), moreForm = $("moreForm"), useText = $("useText"), moreMsg = $("moreMsg"), osChips = $("osChips");
  var joinBtn = moreForm.querySelector("button[value=join]");
  if (CONFIG.demo) { $("demoGo").href = CONFIG.demo; $("demoGo").hidden = false; }
  var pick = { os: guessOS() }, sent = null, need = "";
  function guessOS() {
    var ua = navigator.userAgent || "", pf = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
    if (/iPhone|iPad|iPod|Android/i.test(ua) || (/Mac/i.test(pf) && navigator.maxTouchPoints > 1)) return "";
    return /Mac/i.test(pf) ? "mac" : /Win/i.test(pf) ? "win" : "";
  }
  function renderPicks() {
    dlg.querySelectorAll(".pick").forEach(function (b) {
      var on = b.dataset.os === pick.os;
      b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on || !pick.os && b.dataset.os === "mac" ? 0 : -1;
    });
    var url = pick.os && CONFIG.downloads[pick.os];
    form.classList.toggle("live", !!url && !sent);
    dlGo.hidden = !url || !!sent;
    if (url) { dlGo.href = url; dlGo.textContent = t("get.dlfor").replace("{os}", t("get." + pick.os)); }
    if (sent) {
      $("doneText").textContent = t("get.thanksos").replace("{os}", t("get." + sent.os));
      $("doneNote").textContent = t(sent.note).replace("{email}", sent.email);
    }
    $("emailHint").textContent = need === "get.bademail" || need === "get.needemail" ? t(need) : "";
    $("osHint").textContent = need === "get.needos" ? t(need) : "";
    $("useHint").textContent = need === "get.needuse" ? t(need) : "";
    moreMsg.textContent = need === "get.fail" || need === "get.closed" ? t(need) : "";
    moreMsg.classList.toggle("info", need === "get.closed");
    $("moreClose").setAttribute("aria-label", t("get.close"));
    ready();
  }
  function setNeed(key) {
    need = key;
    osChips.toggleAttribute("aria-invalid", key === "get.needos");
    if (key === "get.needuse") useText.setAttribute("aria-invalid", "true"); else useText.removeAttribute("aria-invalid");
    if (key === "get.bademail" || key === "get.needemail") email.setAttribute("aria-invalid", "true"); else email.removeAttribute("aria-invalid");
    renderPicks();
  }
  function post(data) {
    return fetch(CONFIG.waitlistEndpoint, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(data) })
      .then(function (r) { if (!r.ok) throw new Error(r.status === 404 || r.status === 405 || r.status === 501 || r.status === 503 ? "closed" : r.status); });
  }
  var osBtns = Array.prototype.slice.call(dlg.querySelectorAll(".pick"));
  osBtns.forEach(function (b, i) {
    b.addEventListener("click", function () { pick.os = b.dataset.os; if (need === "get.needos") setNeed(""); renderPicks(); });
    b.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault(); var n = osBtns[(i + d + osBtns.length) % osBtns.length]; pick.os = n.dataset.os; if (need === "get.needos") setNeed(""); renderPicks(); n.focus();
    });
  });
  // Join stays off until all three are there: a real-looking email, a system, and what it's for.
  function okEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function ready() { joinBtn.disabled = busy || !(okEmail(email.value.trim()) && pick.os && useText.value.trim()); }
  var busy = false;
  email.addEventListener("input", function () { if ((need === "get.bademail" && okEmail(email.value.trim())) || need === "get.needemail") setNeed(""); ready(); });
  // A typo is pointed out when you leave the field, not while you're still typing.
  email.addEventListener("blur", function () { var v = email.value.trim(); if (v && !okEmail(v)) setNeed("get.bademail"); });
  useText.addEventListener("input", function () { if (need === "get.needuse" && useText.value.trim()) setNeed(""); ready(); });
  $("moreClose").addEventListener("click", function () { dlg.close("back"); });
  openBtn.addEventListener("click", function () {
    if (typeof dlg.showModal !== "function") return;
    setNeed(""); dlg.returnValue = ""; dlg.showModal(); email.focus();
  });
  // Join checks all three answers again, then signs up. The × in the corner, Esc or a click outside just close.
  moreForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (joinBtn.disabled) return;
    var use = useText.value.trim(), v = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setNeed(v ? "get.bademail" : "get.needemail"); email.focus(); return; }
    if (!pick.os) { setNeed("get.needos"); (osBtns[0]).focus(); return; }
    if (!use) { setNeed("get.needuse"); useText.focus(); return; }
    setNeed("");
    function joined(note) { sent = { os: pick.os, email: v, note: note }; dlg.close("join"); form.classList.add("sent"); renderPicks(); }
    if (!CONFIG.waitlistEndpoint) { setNeed("get.closed"); return; }
    busy = true; ready();
    post({ email: v, os: pick.os, use: use, lang: lang })
      .then(function () { joined("get.thanksd"); })
      .catch(function (err) { setNeed(err && err.message === "closed" ? "get.closed" : "get.fail"); })
      .then(function () { busy = false; ready(); });
  });
  dlg.addEventListener("close", function () { if (!sent) setNeed(""); });
  // Enter in a text field means Join, once Join is on.
  [email, useText].forEach(function (f) { f.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); if (!joinBtn.disabled) moreForm.requestSubmit(joinBtn); } }); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close("back"); });

  applyCopy();
})();
