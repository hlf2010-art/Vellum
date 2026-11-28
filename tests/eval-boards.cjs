/* Boards with a decision already made, shared by the re-check eval and the Critic eval (tests/recheck-eval.cjs,
 * tests/critic-eval.cjs). Each has a claim, two or three directions (one chosen, the others set aside with a reason), the
 * designer's reason for the choice and the evidence it rests on. buildBoard runs inside the page. */
const LANTERN = {
  title: 'Camping lantern', claim: 'Campers need a lantern they can put up hands-free in seconds.',
  dirs: [
    { title: 'Hook-and-strap lantern', text: 'A fabric strap and hook that wraps any branch or pole.', test: '8 of 10 campers hang it in under 10 s.', whyNot: 'Straps tangle in the bag; slower than we hoped in the first try.' },
    { title: 'Magnetic-base lantern', text: 'A strong magnet in the base sticks to car roofs, tailgates and steel tent poles.', test: '8 of 10 campers stick it up in under 5 s.' },
  ], chosen: 1, why: 'Most campers we watched set up beside their car, and steel tent poles are common.',
  rests: [
    { title: 'Campsite visit: car-side setups', text: '11 of 14 groups we watched pitched within 3 m of their car.', weight: 'observed' },
    { title: 'Retailer: steel poles in budget tents', text: 'A shop assistant said most budget tents still use steel poles.', weight: 'reported' },
  ],
};
const FAN = {
  title: 'Desk fan', claim: 'Home workers want cooling at the desk without the noise that ruins calls.',
  dirs: [
    { title: 'Clip-on fan', text: 'A small fan that clamps to the desk edge or a monitor arm.', test: '7 of 10 can clip it within reach in under a minute.', whyNot: 'We assumed most desks have no clamp edge.' },
    { title: 'Quiet bladeless tower', text: 'A bladeless tower under 30 dB at full speed.', test: 'No call participant notices it in 5 test calls.' },
  ], chosen: 1, why: 'Noise on calls was the top complaint we heard.',
  rests: [
    { title: 'Diary study: fan noise on calls', text: '9 of 12 participants turned their fan off during calls.', weight: 'observed' },
    { title: 'Survey: noise is the top complaint', text: 'Noise was the most named complaint about desk fans (41%).', weight: 'reported' },
  ],
};
const NOTES = {
  title: 'Field notes app', claim: 'Field researchers lose notes when the network drops.',
  dirs: [
    { title: 'Cloud-first with retry', text: 'Notes save to the cloud and retry when the network returns.', test: 'No note lost in 20 offline sessions.', whyNot: 'Retry queues failed in two pilot sites.' },
    { title: 'Offline-first sync', text: 'Notes live on the device and sync when a network is available.', test: 'No note lost in 20 offline sessions.' },
  ], chosen: 1, why: 'Researchers are offline for hours at a time.',
  rests: [{ title: 'Pilot logs: offline time', text: 'Median offline stretch was 3.5 hours across 6 sites.', weight: 'observed' }],
};
const LANTERN_ZH = {
  title: '露营灯', claim: '露营的人需要几秒内就能免手持挂好的灯。', zh: true,
  dirs: [
    { title: '挂钩绑带灯', text: '用布带和挂钩缠在树枝或杆子上。', test: '10 人中 8 人能在 10 秒内挂好。', whyNot: '绑带在包里容易缠住，第一次试用比预期慢。' },
    { title: '磁吸底座灯', text: '底座有强磁铁，能吸在车顶、尾门和钢制帐篷杆上。', test: '10 人中 8 人能在 5 秒内吸好。' },
  ], chosen: 1, why: '我们观察到的大多数人都在车旁扎营，钢制帐篷杆也很常见。',
  rests: [{ title: '营地走访：车旁扎营', text: '我们观察的 14 组人里有 11 组在离车 3 米内扎营。', weight: 'observed' }],
};
const FAN_ZH = {
  title: '桌面风扇', claim: '在家办公的人想在桌边降温，又不想噪音毁了视频会议。', zh: true,
  dirs: [
    { title: '夹式小风扇', text: '夹在桌边或显示器支架上的小风扇。', test: '10 人中 7 人能在一分钟内把它夹在手边。', whyNot: '我们以为大多数桌子没有能夹的边。' },
    { title: '静音无叶塔扇', text: '最高档也低于 30 分贝的无叶塔扇。', test: '5 次测试会议里没有参会者注意到它。' },
  ], chosen: 1, why: '我们听到最多的抱怨是开会时的风扇噪音。',
  rests: [
    { title: '日记研究：开会时的风扇噪音', text: '12 名参与者中有 9 人开会时会关掉风扇。', weight: 'observed' },
    { title: '问卷：噪音是头号抱怨', text: '噪音是桌面风扇被提到最多的抱怨（41%）。', weight: 'reported' },
  ],
};

/* runs in the page: builds the board, makes the decision, lets board checks learn it, then keeps the new evidence.
 * Returns the ids and the board check's own note ("before"). */
function buildBoard([B, ev]) {
  abortRecheck(); store.set('.lang', B.zh ? 'zh' : 'en');
  board = blank(B.title); sel = []; setSpeak('matters');
  const claim = node('idea', { title: B.claim, text: B.claim }, { x: 0, y: 0 });
  const dirs = B.dirs.map((d, k) => node('direction', { idea: claim.id, letter: 'ABC'[k], title: d.title, text: d.text, test: d.test }, { x: 460 * k, y: 420 }));
  B.rests.forEach((e, k) => { const n = node('source', { title: e.title, text: e.text, weight: e.weight }, { x: -620, y: k * 320 }); makeRelation(n.id, claim.id, { via: 'wire' }).e.rel = 'supports'; });
  adopt(dirs[B.chosen]); dirs[B.chosen].whyYes = B.why; B.dirs.forEach((d, k) => { if (d.whyNot && k !== B.chosen) dirs[k].whyNot = d.whyNot; });
  board.nodes.forEach(n => { n.created = NOW() - 7200e3; }); dirs[B.chosen].adoptedAt = NOW() - 3600e3;
  renderAll(); runBoardChecks();
  const e = node('source', { title: ev.title, text: ev.text, ...(ev.weight ? { weight: ev.weight } : {}) }, { x: 460 * B.chosen, y: 1100 });
  if (ev.rel) { const r = makeRelation(e.id, dirs[B.chosen].id, { via: 'wire' }); r.e.rel = ev.rel; }
  renderAll();
  const obs = runBoardChecks().filter(o => o.kind === 'revisit'), before = obs.map(o => checkPin(o)?.note || '').join(' ');
  return { dir: dirs[B.chosen].id, claim: claim.id, ev: e.id, before, flagged: obs.length };
}

/* the new evidence each eval adds */
const EV = {
  lanternCounter: { title: 'Field test: aluminium tent poles', text: 'At two campsites, 7 of 10 tents had aluminium poles; the magnet did not stick to any of them.', weight: 'observed', rel: 'conflicts' },
  lanternSupport: { title: 'Field test: stuck to the car in 3 s', text: '9 of 12 campers stuck the lantern to their car roof or tailgate, median 3 seconds.', weight: 'observed', rel: 'supports' },
  lanternUnrelated: { title: 'Supplier quote: USB-C port', text: 'Switching the charging port to USB-C saves $0.40 per unit.', weight: 'reported', rel: 'related' },
  lanternMyth: { title: 'Blog: magnets drain lantern batteries', text: 'A camping blog claims a magnet in the base drains the battery faster. No test or source is given.', weight: 'reported', rel: 'conflicts' },
  fanAside: { title: 'Home office visits: clamp edges', text: 'In 10 home offices, 8 desks had a free edge or a monitor arm a clip-on fan could clamp to.', weight: 'observed', rel: 'related' },
  fanAnecdote: { title: 'One forum post: bladeless fans feel weak', text: 'A forum user said bladeless fans move less air than cheap blade fans.', weight: 'reported', rel: 'conflicts' },
  lanternCounterZh: { title: '实地测试：铝制帐篷杆', text: '两个营地里 10 顶帐篷中有 7 顶是铝杆，磁铁一个都吸不住。', weight: 'observed', rel: 'conflicts' },
  lanternSupportZh: { title: '实地测试：3 秒吸在车上', text: '12 名露营者中 9 人把灯吸在车顶或尾门上，中位用时 3 秒。', weight: 'observed', rel: 'supports' },
  fanAnecdoteZh: { title: '一条论坛帖：无叶风扇风小', text: '一位论坛用户说无叶风扇的风量比便宜的有叶风扇小。', weight: 'reported', rel: 'conflicts' },
  notesSupport: { title: 'Pilot: zero lost notes offline', text: 'Over 24 offline sessions at 3 sites, the offline-first build lost no notes.', weight: 'observed', rel: 'supports' },
};

module.exports = { LANTERN, FAN, NOTES, LANTERN_ZH, FAN_ZH, EV, buildBoard };
