/* @ds-bundle: {"format":4,"namespace":"Vellum","components":[{"name":"Card"},{"name":"LineageChip"},{"name":"EvidenceWeight"},{"name":"CrewMark"},{"name":"Button"},{"name":"ReviewPill"},{"name":"ToolRail"},{"name":"Composer"},{"name":"Toast"},{"name":"DraftBar"},{"name":"TaskIsland"},{"name":"CrewBar"},{"name":"CrewSettings"},{"name":"CardMenu"}]} */
(function(){
  var React = window.React, h = React.createElement;
  function cx(){ return Array.prototype.filter.call(arguments, Boolean).join(' '); }

  // Vellum's own 24px line icons (paths copied from Vellum-Lumen.html)
  var ICONS = {
    select: '<path d="M5 4l12.5 7.2-5.6 1.9-1.9 5.6z"/>',
    lasso: '<path d="M12 4.5c4.7 0 8.5 3.1 8.5 6.9s-3.8 6.9-8.5 6.9-8.5-3.1-8.5-6.9c0-2.6 1.7-4.8 4.3-6"/><circle cx="7.5" cy="17.8" r="1.6"/>',
    hand: '<path d="M8.5 13V6.8a1.3 1.3 0 0 1 2.6 0V11m0-4.2V5.3a1.3 1.3 0 0 1 2.6 0V11m0-3.7a1.3 1.3 0 0 1 2.6 0V12c0 4-2.5 6.8-6.1 6.8-2.3 0-4.1-1.1-5-3l-1.5-3.1a1.3 1.3 0 0 1 2.2-1.3L8.5 13"/>',
    upload: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.4"/><path d="m21 15.5-4.5-4.5-6.5 6.5L7 14.5l-4 4"/>',
    organize: '<rect x="3.5" y="3.5" width="7.2" height="7.2" rx="2"/><rect x="13.3" y="3.5" width="7.2" height="7.2" rx="2"/><rect x="3.5" y="13.3" width="7.2" height="7.2" rx="2"/><rect x="13.3" y="13.3" width="7.2" height="7.2" rx="2"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    enhance: '<path d="M12 3l1.6 4 4 1.6-4 1.6L12 14.2l-1.6-4-4-1.6 4-1.6Z"/><path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z"/><path d="M5.5 15.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6Z"/>',
    command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    x: '<path d="M7 7l10 10M17 7 7 17"/>',
    check: '<path d="m5.5 12.5 4 4 9-9.5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    notepad: '<rect x="5" y="3.5" width="14" height="17" rx="2.2"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4.5"/>',
    video: '<rect x="2.8" y="5.5" width="13.4" height="13" rx="2.4"/><path d="m16.2 10 5-3v10l-5-3z"/>',
    play: '<path d="M8 5.7v12.6a1 1 0 0 0 1.53.85l10.07-6.3a1 1 0 0 0 0-1.7L9.53 4.85A1 1 0 0 0 8 5.7z" fill="currentColor" stroke="none"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    audio: '<path d="M9 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zm11-2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/><path d="M9 17.5V6.5l11-2v11"/>',
    link: '<path d="M10 14 20 4M15 4h5v5M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
    frame: '<path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3"/><circle cx="12" cy="12" r="2.2"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    sliders: '<path d="M4 7h9m4 0h3M4 12h3m4 0h9M4 17h11m4 0h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
    retry: '<path d="M20 12a8 8 0 1 1-2.34-5.66L20 8.7M20 4v4.7h-4.7"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/>',
    archive: '<rect x="3" y="4.5" width="18" height="4" rx="1.2"/><path d="M5 8.5v9.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5M10 13h4"/>',
    trash: '<path d="M4.5 7h15M9.5 7V5.3c0-.7.5-1.3 1.2-1.3h2.6c.7 0 1.2.6 1.2 1.3V7M6.6 7l.8 11.6a1.6 1.6 0 0 0 1.6 1.4h6a1.6 1.6 0 0 0 1.6-1.4L17.4 7"/>',
    ask: '<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4.2 3.3a.5.5 0 0 1-.8-.4V16.5a2 2 0 0 1-.5-1.3z"/>',
    alert: '<path d="M12 4 21 19.5H3Z"/><path d="M12 10v4.2M12 16.9v.1"/>',
    group: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5" stroke-dasharray="3.5 2.5"/><path d="M7.5 8.5h9M7.5 12h6"/>'
  };
  var CREW = {
    scout: { name: 'Scout', ink: 'var(--crew-scout)', svg: '<circle cx="12" cy="12" r="8.2"/><path d="M15.6 8.4 13.2 13.2 8.4 15.6 10.8 10.8Z"/><circle class="f" cx="12" cy="12" r="1.1"/>' },
    strategist: { name: 'Strategist', ink: 'var(--crew-strategist)', svg: '<path d="M12 20.6v-8M12 12.6C12 9.2 8.7 8.1 6.3 5.8M12 12.6c0-3.4 3.3-4.5 5.7-6.8M12 12.6V5"/><circle class="f" cx="6" cy="5.5" r="1.6"/><circle class="f" cx="18" cy="5.5" r="1.6"/><circle class="f" cx="12" cy="4" r="1.6"/>' },
    wright: { name: 'Wright', ink: 'var(--crew-wright)', svg: '<rect x="3.8" y="12.6" width="7.2" height="7.2" rx="1.7"/><rect x="13" y="12.6" width="7.2" height="7.2" rx="1.7"/><rect x="8.4" y="4.2" width="7.2" height="7.2" rx="1.7"/>' },
    critic: { name: 'Critic', ink: 'var(--crew-critic)', svg: '<path d="M12 5v14.6M8.4 19.6h7.2M4.8 7.8h14.4"/><path d="M4.8 7.8 2.7 12.9a2.2 2.2 0 0 0 4.2 0zM19.2 7.8l-2.1 5.1a2.2 2.2 0 0 0 4.2 0z"/><circle class="f" cx="12" cy="4.3" r="1.35"/>' }
  };

  function Icon(p){ return h('svg', { className: cx('vl-ico', p.className), viewBox: '0 0 24 24', 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: ICONS[p.name] || '' } }); }
  function Root(p){ return h('div', { className: cx('vl-root', p.className), style: p.style }, p.children); }

  function LineageChip(p){
    var l = p.lineage || 'A';
    return h('span', { className: cx('vl-chip', p.size === 'lg' && 'is-lg', p.selected && 'is-selected'), style: { '--pg': 'var(--' + l + ')' }, 'aria-label': 'Direction ' + l }, l);
  }

  var WEIGHT = { observed: [3, 'Observed', 'Watched in real use or a test session.'], reported: [2, 'Reported', 'Someone told us. Nobody has watched it happen.'], proposed: [1, 'Proposal', 'Our own idea. It is not evidence of behaviour.'], illustrative: [0, 'Illustration', 'Shows the product. Says nothing about people.'] };
  var ILLU = '<rect x="1.5" y="2.25" width="9" height="7.5" rx="1.75"/><circle cx="4.25" cy="4.9" r=".7" fill="currentColor" stroke="none"/><path d="M2.2 8.75 4.8 6.4l1.9 1.6 1.3-1.2 1.8 1.95"/>';
  function EvidenceWeight(p){
    var key = p.weight || 'observed', w = WEIGHT[key];
    var mark = key === 'illustrative'
      ? h('svg', { className: 'vl-ico vl-illu', viewBox: '0 0 12 12', 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: ILLU } })
      : h('span', { className: 'vl-wbars', 'aria-hidden': 'true' }, [0, 1, 2].map(function(i){ return h('i', { key: i, className: i < w[0] ? 'on' : '' }); }));
    return h('span', { className: cx('vl-weight', 'is-' + key), title: w[2], role: 'img', 'aria-label': w[1] + ': ' + w[2] }, mark, w[1]);
  }

  function CrewMark(p){
    var c = CREW[p.member || 'scout'];
    var state = p.state || (p.working ? 'working' : 'free');
    var label = { free: 'free', working: 'working', waiting: 'waiting for you' }[state] || state;
    return h('span', { className: cx('vl-mk', state !== 'free' && 'is-' + state, p.size === 'sm' && 'is-sm', p.size === 'xs' && 'is-xs', p.size === 'isl' && 'is-isl'), style: { '--crew': c.ink }, title: c.name + ': ' + label, role: 'img', 'aria-label': c.name + ': ' + label },
      h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: c.svg } }));
  }

  function Button(p){
    var v = p.variant || 'secondary', size = p.size || 'md', iconOnly = p.icon && !p.children;
    return h('button', { type: p.type || 'button', className: cx('vl-btn', v !== 'secondary' && 'is-' + v, size !== 'md' && 'is-' + size, iconOnly && 'is-icon', p.loading && 'is-loading', p.className),
        disabled: p.disabled || p.loading, 'aria-busy': p.loading ? 'true' : undefined, onClick: p.onClick, 'aria-label': p['aria-label'], title: iconOnly ? p['aria-label'] : undefined },
      p.loading ? h('span', { className: 'vl-spin', 'aria-hidden': 'true' }) : (p.icon ? h(Icon, { name: p.icon }) : null), p.children);
  }

  function ReviewPill(p){
    var n = p.count == null ? 1 : p.count;
    return h('button', { type: 'button', className: 'vl-review', onClick: p.onClick }, h('i', { 'aria-hidden': 'true' }), p.label || (n + ' waiting'));
  }

  var KIND_LABEL = { source: 'Source', idea: 'Core Thesis', direction: 'Direction', note: 'Sticky', notepad: 'Notepad', recording: 'Recording', image: 'Image', audio: 'Audio', link: 'Link', frame: 'Frame', synthesis: 'Synthesis', proof: 'Proof', question: 'Question', list: 'Action list', snapshot: 'Snapshot', kanban: 'Kanban', group: 'Group' };
  var KIND_ICON = { source: 'doc', notepad: 'notepad', audio: 'audio', group: 'group' };
  var MEDIA_ICON = { recording: 'video', image: 'image', frame: 'frame', link: 'link' };

  function Foot(p){
    var left = [];
    if (p.weight) left.push(h(EvidenceWeight, { key: 'w', weight: p.weight }));
    if (p.footLeft) left.push(h('span', { key: 'l' }, p.footLeft));
    if (!left.length && !p.meta) return null;
    return h('div', { className: 'vl-foot' }, left.length ? h('span', { className: 'vl-foot-l' }, left) : null, h('span', { className: 'vl-sp' }), p.meta ? h('span', null, p.meta) : null);
  }
  function Media(p){
    if (!p.image && !p.children) return null;
    var kind = p.kind;
    return h('div', { className: cx('vl-media', kind === 'link' && 'is-link'), style: p.aspect ? { aspectRatio: p.aspect } : null },
      p.image ? h('img', { src: p.image, alt: p.imageAlt || '' }) : p.children,
      (p.badge || MEDIA_ICON[kind]) ? h('span', { className: 'vl-badge' }, MEDIA_ICON[kind] ? h(Icon, { name: MEDIA_ICON[kind] }) : null, p.badge || KIND_LABEL[kind]) : null,
      kind === 'recording' ? h('button', { type: 'button', className: 'vl-play', 'aria-label': 'Play recording' }, h(Icon, { name: 'play' })) : null,
      p.timecode ? h('span', { className: 'vl-tc' }, p.timecode) : null);
  }

  function Card(p){
    var kind = p.kind || 'source';
    if (kind === 'print') kind = 'snapshot';
    var cls = cx('vl-card', 'is-' + kind, p.adopted && 'is-adopted', p.disliked && 'is-disliked', p.lit && 'is-lit', p.selected && 'is-selected', p.state === 'loading' && 'is-loading', p.state === 'error' && 'is-error');
    var style = p.lineage ? { '--pg': 'var(--' + p.lineage + ')' } : {};
    if (p.width) style.width = p.width;
    var label = p.eyebrow || KIND_LABEL[kind];

    // head (kind line)
    var lead = null;
    if (kind === 'note') lead = h('span', { className: 'vl-tag' }, h('i', { className: 'vl-dot', 'aria-hidden': 'true' }), 'Sticky');
    else {
      var bits = [];
      if (p.by) bits.push(h(CrewMark, { key: 'by', member: p.by, size: 'xs' }));
      if (p.lineage && (kind === 'direction' || kind === 'proof' || kind === 'snapshot')) bits.push(h(LineageChip, { key: 'chip', lineage: p.lineage }));
      if (kind === 'question') bits.push(h('i', { key: 'q', className: 'vl-qdot', 'aria-hidden': 'true' }));
      if (KIND_ICON[kind] && !p.by) bits.push(h(Icon, { key: 'i', name: KIND_ICON[kind] }));
      bits.push(h('span', { key: 't', className: kind === 'direction' ? 'vl-pgname' : null }, kind === 'proof' && p.version ? label + ' · ' + p.version : label));
      lead = bits;
    }
    var head = (kind === 'link') ? null : h('div', { className: 'vl-card-k' }, lead, h('span', { className: 'vl-sp' }), p.headExtra);

    // body by kind
    var body = [];
    if (kind === 'snapshot') body.push(h('div', { key: 'ed', className: 'vl-edition' }, 'No. ' + (p.edition || 1), p.of ? h('sup', null, p.of) : null));
    if (p.title) body.push(h('h4', { key: 'h' }, p.title));
    if (kind === 'link' && p.url) body.push(h('a', { key: 'u', className: 'vl-url', href: 'https://' + p.url.replace(/^https?:\/\//, ''), target: '_blank', rel: 'noopener noreferrer' }, p.url.replace(/^https?:\/\//, '')));
    if (kind === 'notepad') body.push(h('div', { key: 'nb', className: 'vl-notepad' }, p.text || p.children));
    else if (p.children && kind !== 'group') body.push(h('p', { key: 'p' }, p.children));
    if (kind === 'audio') body.push(h('div', { key: 'a', className: 'vl-aud' }, h('button', { type: 'button', className: 'vl-aud-play', 'aria-label': 'Play audio' }, h(Icon, { name: 'play' })), h('span', { className: 'vl-aud-track', role: 'slider', 'aria-label': 'Audio progress', 'aria-valuenow': p.progress || 0 }, h('i', { style: { width: (p.progress || 0) + '%' } })), h('span', { className: 'vl-aud-tc' }, p.duration || '0:00')));
    if (kind === 'synthesis' && p.points) body.push(h('ul', { key: 's', className: 'vl-syn' }, p.points.map(function(pt, i){ return h('li', { key: i }, pt.label ? h('b', null, pt.label + ': ') : null, pt.text); })));
    if (kind === 'proof' && p.sources) {
      var shown = p.sources.slice(0, 3), more = p.sources.length - shown.length;
      body.push(h('div', { key: 'src', className: 'vl-fixed', title: 'The sources this proof was built from, fixed at build time' }, shown.map(function(s, i){ return h('span', { key: i }, s); }), more > 0 ? h('span', { className: 'more' }, '+' + more + ' more') : null));
    }
    if (kind === 'list' && p.items) {
      var done = p.items.filter(function(it){ return it.done; }).length;
      body.push(h('div', { key: 'bar', className: 'vl-todo-bar', 'aria-hidden': 'true' }, h('i', { style: { width: Math.round(done / p.items.length * 100) + '%' } })));
      body.push(h('ul', { key: 'todo', className: 'vl-todo' }, p.items.map(function(it, i){
        return h('li', { key: i, className: it.done ? 'done' : null }, h('button', { type: 'button', className: 'vl-chk', 'aria-label': it.done ? 'Mark not done' : 'Mark done', 'aria-pressed': !!it.done }, it.done ? h(Icon, { name: 'check' }) : null), h('span', null, it.text));
      })));
    }
    if (kind === 'kanban' && p.columns) body.push(h('div', { key: 'kb', className: 'vl-kb' }, p.columns.map(function(col, i){
      return h('div', { key: i, className: 'vl-kb-col', style: { '--kb-c': 'var(--' + (col.lineage || ['A', 'B', 'C'][i % 3]) + ')' } },
        h('div', { className: 'vl-kb-h' }, h('span', null, col.title), h('span', null, col.items.length)),
        h('ul', null, col.items.map(function(it, j){ return h('li', { key: j }, it); })),
        h('div', { className: 'vl-kb-add' }, '+ Add…'));
    })));
    if (p.test) body.push(h('div', { key: 't', className: 'vl-test' }, h('b', null, 'Test: '), p.test));
    if (kind === 'group') body.push(h('div', { key: 'g', className: 'vl-grp-body' }, p.children));

    // footer
    var footLeft = p.footLeft;
    if (p.rating) {
      var r = p.rating, total = (r.observed || 0) + (r.reported || 0) + (r.unrated || 0);
      footLeft = h('span', { className: 'vl-rated' }, h('span', null, ((r.observed || 0) + (r.reported || 0)) + '/' + total + ' rated'),
        h('span', { className: 'vl-scale', role: 'img', 'aria-label': 'Evidence mix: ' + (r.observed || 0) + ' observed · ' + (r.reported || 0) + ' reported · ' + (r.unrated || 0) + ' unrated' },
          r.observed ? h('i', { style: { flex: r.observed } }) : null, r.reported ? h('i', { className: 'r', style: { flex: r.reported } }) : null, r.unrated ? h('i', { className: 'n', style: { flex: r.unrated } }) : null));
    }
    if (kind === 'list' && p.items && !footLeft) footLeft = p.items.filter(function(it){ return it.done; }).length + '/' + p.items.length + ' done';
    if (kind === 'kanban' && p.columns && !footLeft) footLeft = p.columns[p.columns.length - 1].items.length + '/' + p.columns.reduce(function(n, c){ return n + c.items.length; }, 0) + ' done';
    var foot = kind === 'group' ? null : h(Foot, { weight: p.weight, footLeft: footLeft, meta: p.meta });

    var media = (MEDIA_ICON[kind] || kind === 'proof' || p.image) ? h(Media, { kind: kind, image: p.image, imageAlt: p.imageAlt, badge: p.badge, timecode: p.timecode, aspect: p.aspect }) : null;
    var prop = null;
    if (p.proposal) {
      var pr = p.proposal, who = CREW[pr.member || 'scout'].name;
      var what = pr.op === 'delete' ? who + ' suggests deleting this card' : pr.op === 'link' ? who + ' suggests linking \u201c' + (pr.from || 'a card') + '\u201d into this card' : who + ' suggests an edit';
      prop = h('div', { className: cx('vl-prop', pr.op === 'delete' && 'is-del') },
        h('div', { className: 'vl-prop-top' }, h(CrewMark, { member: pr.member || 'scout', size: 'xs' }), h('span', { className: 'vl-prop-what' }, what),
          h('span', { className: 'vl-prop-acts' }, pr.op === 'edit' || !pr.op ? h('button', { type: 'button', className: 'vl-prop-btn' }, pr.open ? 'Hide' : 'Review') : null, h('button', { type: 'button', className: 'vl-prop-btn' }, 'Decline'), h('button', { type: 'button', className: 'vl-prop-btn ok' }, pr.stale ? 'Accept anyway' : 'Accept'))),
        pr.stale ? h('div', { className: 'vl-prop-stale' }, 'The card changed after this was suggested.') : null,
        pr.open && pr.diff ? h('div', { className: 'vl-prop-diff' }, h('div', null, h('span', { className: 'vl-prop-f' }, pr.field || 'text'), h('del', null, pr.diff[0]), ' ', h('ins', null, pr.diff[1]))) : null);
    }
    var err = p.state === 'error' ? h('div', { className: 'vl-card-err', role: 'alert' }, h(Icon, { name: 'alert' }), h('span', null, p.error || 'Couldn\u2019t finish. Your card is unchanged.'), p.onRetry ? h('button', { type: 'button', onClick: p.onRetry }, 'Retry') : null) : null;
    return h('article', { className: cls, style: style, tabIndex: p.tabIndex == null ? 0 : p.tabIndex, 'aria-selected': p.selected ? 'true' : undefined, 'aria-busy': p.state === 'loading' ? 'true' : undefined, onClick: p.onSelect,
        'aria-label': (KIND_LABEL[kind] || kind) + ': ' + (p.title || '') + (p.locked ? ' (locked)' : '') + (p.state === 'loading' ? ' (reading)' : '') },
      media, p.locked ? h('span', { className: 'vl-lock-badge', title: 'Locked: only you can change this card' }, h(Icon, { name: 'lock' })) : null,
      h('div', { className: 'vl-in' }, head, body, foot), err, prop);
  }

  var TOOLS = [['select', 'Select / Pan · V'], ['lasso', 'Lasso select · S'], ['hand', 'Hand / Pan · H'], '|', ['upload', 'Upload file or media · U'], ['organize', 'Organize canvas · T'], ['search', 'Search cards · ⌘F'], '|', ['undo', 'Undo · ⌘Z'], ['redo', 'Redo · ⌘⇧Z']];
  function ToolRail(p){
    var useState = React.useState;
    var st = useState(p.active || 'select'), active = st[0], setActive = st[1];
    var modal = { select: 1, lasso: 1, hand: 1 };
    var items = (p.tools || TOOLS).map(function(t, i){
      if (t === '|') return h('span', { key: 's' + i, className: 'vl-sep', 'aria-hidden': 'true' });
      var isModal = modal[t[0]];
      var dis = (p.disabled || []).indexOf(t[0]) >= 0;
      return h('button', { key: t[0], type: 'button', title: t[1], 'aria-label': t[1].replace(' · ', ' (') + ')', 'aria-pressed': isModal ? String(active === t[0]) : undefined, disabled: dis, onClick: function(){ if (isModal) setActive(t[0]); } }, h(Icon, { name: t[0] }));
    });
    return h('div', { className: cx('vl-rail', p.orientation === 'horizontal' && 'is-row'), role: 'toolbar', 'aria-label': 'Canvas tools', 'aria-orientation': p.orientation || 'vertical' }, items);
  }

  function Composer(p){
    var st = React.useState(p.value || ''), val = st[0], setVal = st[1];
    var ref = React.useRef(null);
    var has = !!val.trim();
    var route = p.route || { member: null, label: 'Canvas AI' };
    React.useLayoutEffect(function(){ var t = ref.current; if (!t) return; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px'; }, [val]);
    return h('form', { className: 'vl-line', onSubmit: function(e){ e.preventDefault(); if (!has) return; if (p.onSend) p.onSend(val); setVal(''); }, 'aria-label': 'Composer' },
      h('div', { className: 'vl-field' },
        h('button', { type: 'button', className: 'vl-sq vl-plus', 'aria-label': 'Add files, a note or a claim', title: 'Add' }, h(Icon, { name: 'plus' })),
        h('textarea', { ref: ref, rows: 1, value: val, placeholder: p.placeholder || 'Write an idea, or / for commands', 'aria-label': 'Ask the crew',
          onChange: function(e){ setVal(e.target.value); },
          onKeyDown: function(e){ if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } } }),
        h('button', { type: 'button', className: cx('vl-route', !has && !p.showRoute && 'is-quiet'), 'aria-haspopup': 'menu', title: route.label + ' \u00b7 click to pick a specialist' },
          route.member ? h(CrewMark, { member: route.member, size: 'xs' }) : h('span', { className: 'vl-route-cp', 'aria-hidden': 'true' }), h('b', null, route.label), h(Icon, { name: 'chevron' })),
        h('button', { type: 'button', className: cx('vl-sq vl-mic', p.recording && 'is-rec'), 'aria-label': p.recording ? 'Stop dictation' : 'Dictate', 'aria-pressed': p.recording ? 'true' : 'false', title: 'Dictate' }, h(Icon, { name: 'mic' })),
        h('button', { type: 'submit', className: 'vl-sq vl-send', 'aria-label': 'Send', disabled: !has }, h(Icon, { name: 'send' }))),
      p.hint ? h('div', { className: 'vl-hint' }, p.hint) : null);
  }

  function Toast(p){
    var acts = p.actions || (p.undo ? [{ label: 'Undo' }] : []);
    var err = p.tone === 'error';
    return h('div', { className: cx('vl-toast', err && 'is-error'), role: err ? 'alert' : 'status' },
      h('span', { className: 'vl-msg' }, err ? h(Icon, { name: 'alert' }) : (p.member ? h(CrewMark, { member: p.member, size: 'sm' }) : null), p.children),
      acts.length ? h('span', { className: 'vl-acts' }, acts.map(function(a){ return h(Button, { key: a.label, size: 'sm', variant: a.variant || 'secondary', icon: a.icon, onClick: a.onClick }, a.label); })) : null);
  }

  function DraftBar(p){
    var c = CREW[p.member || 'strategist'];
    var n = p.count || 1;
    return h('div', { className: 'vl-pbar', role: 'group', 'aria-label': c.name + ' draft' },
      h('div', { className: 'vl-pbar-top' }, h(CrewMark, { member: p.member || 'strategist', size: 'xs', state: 'waiting' }),
        h('span', { className: 'vl-pbar-title' }, h('b', null, c.name), ' · ', p.what || '1 direction'),
        n > 1 ? h('span', { className: 'vl-pbar-nav' }, h('span', null, (p.index || 1) + '/' + n)) : null),
      h('div', { className: 'vl-pbar-acts' },
        h('button', { type: 'button', className: 'sec danger', title: 'Discard (⌘⌫)', 'aria-keyshortcuts': 'Meta+Backspace', onClick: p.onDiscard }, h(Icon, { name: 'x' }), 'Discard'),
        h('button', { type: 'button', className: 'sec', title: 'Retry (R)', 'aria-keyshortcuts': 'R', onClick: p.onRetry }, h(Icon, { name: 'retry' }), 'Retry', h('kbd', null, 'R')),
        h('button', { type: 'button', className: 'primary', title: 'Keep (↵)', 'aria-keyshortcuts': 'Enter', onClick: p.onKeep }, h(Icon, { name: 'check' }), n > 1 ? 'Keep all' : 'Keep', h('kbd', null, '\u21b5'))));
  }

  var LINE = { scout: 'C', strategist: 'B', wright: 'A', critic: 'C' };
  var TINT = { scout: 'var(--crew-scout)', strategist: 'var(--crew-strategist)', wright: 'var(--A)', critic: 'var(--crew-critic)' };
  function IslAv(p){
    var pct = p.state === 'done' ? 100 : (p.pct == null ? 30 : p.pct), r = 12.5, C = 2 * Math.PI * r;
    return h('span', { className: cx('vl-isl-av', p.state && 'is-' + p.state), style: { '--tint': TINT[p.member] || 'var(--label-2)' } },
      h('svg', { className: 'vl-isl-ring', viewBox: '0 0 28 28', 'aria-hidden': 'true' }, h('circle', { cx: 14, cy: 14, r: r, className: 'tr' }), h('circle', { cx: 14, cy: 14, r: r, className: 'pg', strokeDasharray: C, strokeDashoffset: C * (1 - pct / 100) })),
      h(CrewMark, { member: p.member, size: 'isl' }),
      p.state === 'done' || p.state === 'failed' ? h('span', { className: 'vl-isl-end', 'aria-hidden': 'true' }, h(Icon, { name: p.state === 'done' ? 'check' : 'x' })) : null);
  }
  var ISL_STATE = { queued: 'Queued', done: 'Done', failed: 'Failed' };
  function TaskIsland(p){
    var tasks = p.tasks || [];
    var live = tasks.filter(function(x){ return !x.state || x.state === 'running' || x.state === 'queued'; });
    var mode = p.open ? 'open' : (tasks.length ? 'compact' : 'idle');
    if (mode === 'idle') return h('button', { type: 'button', className: 'vl-island is-idle', 'aria-label': 'Background tasks: none running', title: 'No background tasks' });
    if (mode === 'compact') {
      var t = live[0] || tasks[0], ended = !live.length;
      return h('div', { className: cx('vl-island is-compact', ended && (t.state === 'failed' ? 'is-failed' : 'is-done')), role: 'region', 'aria-label': 'Background tasks', 'aria-busy': ended ? 'false' : 'true', 'aria-live': 'polite' },
        h('button', { type: 'button', className: 'vl-isl-pill', 'aria-expanded': 'false', 'aria-label': (ended ? t.title + ': ' + (t.note || ISL_STATE[t.state]) : live.length + ' background task' + (live.length > 1 ? 's' : '') + ' running') + '. Show details' },
          h('span', { className: 'vl-isl-stack' }, (ended ? [t] : live.slice(0, 2)).map(function(x, i){ return h(IslAv, { key: i, member: x.member, pct: x.pct, state: x.state }); })),
          h('span', { className: 'vl-isl-lbl' }, h('b', null, ended ? (t.note || ISL_STATE[t.state]) : t.phase), h('span', null, t.title)),
          !ended && live.length > 1 ? h('span', { className: 'vl-isl-more' }, '+' + (live.length - 1)) : null,
          !ended && t.pct != null ? h('span', { className: 'vl-isl-num' }, t.pct + '%') : null));
    }
    return h('div', { className: 'vl-island is-open', role: 'region', 'aria-label': 'Background tasks' },
      h('div', { className: 'vl-isl-hd' }, h('h3', null, 'Background tasks', h('small', null, ['running', 'queued', 'done', 'failed'].map(function(k){ var n = tasks.filter(function(x){ return (x.state || 'running') === k; }).length; return n ? n + ' ' + k : null; }).filter(Boolean).join(' \u00b7 '))), h('button', { type: 'button', className: 'vl-isl-x', 'aria-label': 'Collapse' }, h(Icon, { name: 'chevron' }))),
      tasks.map(function(x, i){
        var stt = x.state || 'running';
        var sub = stt === 'running' ? x.phase + (x.pct != null ? ' \u00b7 ' + x.pct + '%' : '') : (x.note || ISL_STATE[stt]);
        return h('div', { key: i, className: cx('vl-isl-row', 'is-' + stt) }, h(IslAv, { member: x.member, pct: x.pct, state: stt }),
          h('span', { className: 'vl-isl-tx' }, h('span', { className: 'vl-isl-t' }, x.title), h('span', { className: 'vl-isl-s' }, h('span', null, sub), h('span', { className: 'el' }, x.elapsed || '0:02'))),
          h('span', { className: 'vl-isl-acts' }, stt === 'failed' && x.onRetry ? h(Button, { size: 'sm', variant: 'ghost', icon: 'retry', onClick: x.onRetry }, 'Retry') : null),
          h('span', { className: cx('vl-isl-bar', stt === 'queued' && 'is-queued'), style: { '--tint': stt === 'failed' ? 'var(--danger)' : (TINT[x.member] || 'var(--label-2)'), '--p': (stt === 'done' ? 100 : (x.pct == null ? 34 : x.pct)) + '%' } }, h('i')));
      }));
  }

  function CrewBar(p){
    var seats = p.seats || { scout: 'free', strategist: 'waiting', wright: 'free', critic: 'free' };
    var conn = p.connection || 'none';
    var connLabel = { none: 'No model connected', ok: 'Connected', rules: 'Using built-in rules', error: 'Connection problem' }[conn];
    return h('div', { className: cx('vl-crewbar', p.quiet && 'is-quiet'), role: 'group', 'aria-label': 'Crew' },
      h('div', { className: 'vl-crew', role: 'group', 'aria-label': 'AI Crew' }, Object.keys(seats).map(function(k){ return h('button', { key: k, type: 'button', className: 'vl-seat' }, h(CrewMark, { member: k, state: seats[k] })); })),
      h('button', { type: 'button', className: 'vl-crew-set', 'aria-haspopup': 'dialog', title: 'Crew settings · ' + connLabel, 'aria-label': 'Crew settings · ' + connLabel }, h(Icon, { name: 'sliders' }), h('i', { className: 'vl-conn ' + conn, 'aria-hidden': 'true' })),
      p.mode !== false ? h('button', { type: 'button', className: cx('vl-crew-mode', conn === 'ok' && 'live'), 'aria-haspopup': 'menu' }, h('b', { 'aria-hidden': 'true' }), p.mode || 'Offline', h(Icon, { name: 'chevron' })) : null);
  }

  function Seg(p){
    var st = React.useState(p.value), val = st[0], setVal = st[1];
    function pick(o){ setVal(o); if (p.onChange) p.onChange(o); }
    return h('div', { className: 'vl-seg', role: 'radiogroup', 'aria-label': p.label, style: { gridTemplateColumns: 'repeat(' + p.options.length + ',minmax(0,1fr))' },
        onKeyDown: function(e){ var i = p.options.indexOf(val), d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0; if (!d) return; e.preventDefault(); var n = p.options[(i + d + p.options.length) % p.options.length]; pick(n); var b = e.currentTarget.querySelectorAll('button')[p.options.indexOf(n)]; if (b) b.focus(); } },
      p.options.map(function(o){
        var on = o === val;
        return h('button', { key: o, type: 'button', role: 'radio', 'aria-checked': on, 'aria-pressed': String(on), tabIndex: on ? 0 : -1, onClick: function(){ pick(o); } }, o);
      }));
  }
  function CrewSettings(p){
    var lanes = p.lanes || ['Gather', 'Explore', 'Prototype', 'Snapshot'];
    var sp = React.useState(p.speaks || 'When it matters'), speaks = sp[0], setSpeaks = sp[1];
    var ac = React.useState(p.acts || 'Only drafts'), acts = ac[0], setActs = ac[1];
    var lk = React.useState(p.locked || ['Snapshot']), lockedNow = lk[0], setLocked = lk[1];
    var emitted = React.useRef(false);
    React.useEffect(function(){ if (!emitted.current) { emitted.current = true; return; } if (p.onChange) p.onChange({ speaks: speaks, acts: acts, locked: lockedNow }); }, [speaks, acts, lockedNow]);
    var speakNote = { 'Never': 'The crew only answers when you ask.', 'When it matters': 'One thought at a time; the next comes after you read it.', 'Often': 'The crew speaks up as it notices things.' }[speaks];
    var actNote = acts === 'Only drafts' ? 'Anything it makes arrives as a draft for you to keep or discard. Edits and deletions of your cards are always suggestions.' : 'It can add cards directly. Edits and deletions of your cards are always suggestions.';
    return h('div', { className: 'vl-crewpop', role: 'dialog', 'aria-label': 'Crew settings' },
      h('div', { className: 'vl-cp-head' }, h('b', null, 'Crew'), h('span', null, p.status || 'Using built-in rules · No model connected')),
      h('div', { className: 'vl-axis' }, h('b', null, 'Speaks up'), h(Seg, { label: 'Speaks up', options: ['Never', 'When it matters', 'Often'], value: speaks, onChange: setSpeaks }), h('p', null, speakNote)),
      h('div', { className: 'vl-axis' }, h('b', null, 'Acts on the board'), h(Seg, { label: 'Acts on the board', options: ['Only drafts', 'Can create cards'], value: acts, onChange: setActs }), h('p', null, actNote)),
      h('div', { className: 'vl-sec' }, h('b', null, h(Icon, { name: 'lock' }), 'Locked lanes'),
        h('div', { className: 'vl-locks' }, lanes.map(function(l){ var on = lockedNow.indexOf(l) >= 0; return h('button', { key: l, type: 'button', className: 'vl-lock', 'aria-pressed': String(on), onClick: function(){ setLocked(on ? lockedNow.filter(function(x){ return x !== l; }) : lockedNow.concat([l])); } }, h(Icon, { name: 'lock' }), l); })),
        h('span', null, 'Only you change kept cards in a locked lane. Lock single cards from their menu.')),
      h('div', { className: 'vl-cp-foot' }, h(Button, null, 'Customize…'), h(Button, { icon: 'notepad' }, 'Memory')));
  }

  function CardMenu(p){
    var items = p.items || [
      { label: 'Ask Scout', icon: 'notepad' }, { label: 'Ask Copilot', icon: 'ask' }, { label: 'Open Details', icon: 'arrow', key: '\u21b5' }, '-',
      { label: p.locked ? 'Unlock' : 'Lock', icon: 'lock' }, { label: 'Duplicate', icon: 'copy', key: '\u2318D' }, { label: 'Hide from canvas', icon: 'eyeOff' }, { label: 'Archive', icon: 'archive', key: '\u21e7H' }, { label: 'Delete', icon: 'trash', key: '\u232b', danger: true }];
    function onKey(e){
      var btns = Array.prototype.slice.call(e.currentTarget.querySelectorAll('[role=menuitem]')), i = btns.indexOf(document.activeElement), n = btns.length, t = null;
      if (e.key === 'ArrowDown') t = btns[(i + 1) % n]; else if (e.key === 'ArrowUp') t = btns[(i - 1 + n) % n]; else if (e.key === 'Home') t = btns[0]; else if (e.key === 'End') t = btns[n - 1];
      else if (e.key === 'Escape') { if (p.onClose) p.onClose(); return; } else return;
      e.preventDefault(); t.focus();
    }
    var ref = React.useRef(null);
    React.useEffect(function(){ if (p.autoFocus && ref.current) { var f = ref.current.querySelector('[role=menuitem]'); if (f) f.focus(); } }, []);
    var first = items.findIndex(function(it){ return it !== '-'; });
    return h('div', { ref: ref, className: 'vl-cmenu', role: 'menu', 'aria-label': 'Card actions', onKeyDown: onKey },
      h('div', { className: 'vl-cm-head' }, h('b', null, p.title || 'Untitled'), p.kind ? h('span', { className: 'vl-cm-kind' }, p.kind) : null),
      items.map(function(it, i){
        if (it === '-') return h('div', { key: i, className: 'vl-cm-sep', role: 'separator' });
        return h('button', { key: i, type: 'button', role: 'menuitem', tabIndex: i === first ? 0 : -1, className: it.danger ? 'danger' : null, onClick: it.onClick }, h('span', { className: 'vl-cm-lbl' }, it.icon ? h(Icon, { name: it.icon }) : null, h('span', null, it.label)), it.key ? h('kbd', null, it.key) : null);
      }));
  }

  window.Vellum = { Card: Card, LineageChip: LineageChip, EvidenceWeight: EvidenceWeight, CrewMark: CrewMark, Button: Button, ReviewPill: ReviewPill, ToolRail: ToolRail, Composer: Composer, Toast: Toast, DraftBar: DraftBar, TaskIsland: TaskIsland, CrewBar: CrewBar, CrewSettings: CrewSettings, CardMenu: CardMenu, Icon: Icon, Root: Root, CREW: CREW };
})();
