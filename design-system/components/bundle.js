/* @ds-bundle: {"format":4,"namespace":"Vellum","components":[{"name":"Card"},{"name":"LineageChip"},{"name":"EvidenceWeight"},{"name":"CrewMark"},{"name":"Button"},{"name":"ReviewPill"},{"name":"ToolRail"},{"name":"Composer"},{"name":"Toast"},{"name":"DraftBar"},{"name":"TaskIsland"},{"name":"CrewBar"},{"name":"CrewSettings"},{"name":"CardMenu"},{"name":"Sheet"},{"name":"SourceRow"},{"name":"EvidenceBlocks"},{"name":"Overview"},{"name":"Wire"},{"name":"Port"},{"name":"StageHeader"},{"name":"SelectionStrip"},{"name":"CrewCursor"},{"name":"CommandMenu"},{"name":"Dialog"},{"name":"Segmented"},{"name":"Tooltip"},{"name":"Kbd"},{"name":"Tag"},{"name":"TextField"},{"name":"Checkbox"},{"name":"Switch"},{"name":"Tabs"},{"name":"Progress"},{"name":"Skeleton"},{"name":"EmptyState"},{"name":"InlineAlert"},{"name":"ProofCard"},{"name":"SelectionBar"},{"name":"CopilotButton"},{"name":"EvidenceLine"},{"name":"EvidenceCard"},{"name":"Avatar"},{"name":"AvatarGroup"}]} */
(function(){
  var React = window.React, h = React.createElement;
  function cx(){ return Array.prototype.filter.call(arguments, Boolean).join(' '); }

  // Vellum's own 24px line icons (paths copied from Vellum-Lumen.html)
  var ICONS = {
    select: '<path d="M5 4l12.5 7.2-5.6 1.9-1.9 5.6z"/>',
    lasso: '<path d="M14.6 5.4l4 4L9 19H5v-4z"/><path d="M12.6 7.4l4 4"/>',
    pen: '<path d="M14.6 5.4l4 4L9 19H5v-4z"/><path d="M12.6 7.4l4 4"/>',
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
    var label = { free: 'free', working: 'working', waiting: 'waiting for you', thinking: 'thinking' }[state] || state;
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

  var KIND_LABEL = { source: 'Document', idea: 'Idea', direction: 'Direction', note: 'Sticky', notepad: 'Notepad', recording: 'Video', image: 'Image', audio: 'Audio', link: 'Link', frame: 'Frame', synthesis: 'Synthesis', proof: 'Proof', question: 'Question', list: 'Action list', snapshot: 'Snapshot', kanban: 'Kanban', group: 'Group' };
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
      bits.push(h('span', { key: 't', className: kind === 'direction' ? 'vl-pgname' : null, title: p.eyebrowTip }, kind === 'proof' && p.version ? label + ' · ' + p.version : label));
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
      return h('div', { key: i, className: 'vl-kb-col', style: col.lineage ? { '--kb-c': 'var(--' + col.lineage + '-fill)' } : null },
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
        h('span', { className: cx('vl-scale', total <= 16 && 'is-count'), role: 'img', 'aria-label': 'Evidence: ' + (r.observed || 0) + ' observed · ' + (r.reported || 0) + ' reported · ' + (r.unrated || 0) + ' unrated' },
          [['', r.observed], ['r', r.reported], ['n', r.unrated]].reduce(function(out, g){ var n = g[1] || 0; if (!n) return out; if (total <= 16) { for (var k = 0; k < n; k++) out.push(h('i', { key: g[0] + k, className: g[0] || null })); } else out.push(h('i', { key: g[0], className: g[0] || null, style: { flex: n } })); return out; }, [])));
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

  var TOOLS = [['select', 'Select / Pan · V'], ['lasso', 'Pen · P · circle to select'], ['hand', 'Hand / Pan · H'], '|', ['upload', 'Upload file or media · U'], ['organize', 'Organize canvas · T'], ['search', 'Search cards · ⌘F'], '|', ['undo', 'Undo · ⌘Z'], ['redo', 'Redo · ⌘⇧Z']];
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

  /* Composer: the ⌘K command palette. Closed, only a small hint pill stays at the bottom centre (a hint, not an input).
     Open, one field sits in the middle of the screen: three suggestions when empty, every command after "/",
     cards and matching commands for plain words. Esc or a click outside puts it away. */
  var PAL_STARTS = [{ icon: 'note', cmd: 'New sticky', kbd: 'N' }, { icon: 'upload', cmd: 'Add files', kbd: 'U' }, { icon: 'copilot', cmd: 'Ask Copilot', kbd: '⌘.' }];
  var PAL_CMDS = [{ icon: 'fork', cmd: '/fork', hint: '2–4', desc: 'Explore directions from the selected claim', member: 'strategist' }, { icon: 'build', cmd: '/build', desc: 'Build a prototype from the selected direction', member: 'wright' }, { icon: 'gather', cmd: '/gather', desc: 'Read the selection and weigh its evidence', member: 'scout' }, { icon: 'critique', cmd: '/critique', desc: 'Check the selection against its sources', member: 'critic' }, { icon: 'note', cmd: '/note', desc: 'Add a sticky where you’re looking' }, { icon: 'link', cmd: '/link', desc: 'Save a web address as a link card' }];
  var PAL_CARDS = [{ dot: 'B', cmd: 'Isolate one retry', desc: 'Direction B' }, { cmd: 'Creators re-run the whole job when one check fails', desc: 'Idea' }, { cmd: 'Playtest telemetry', desc: 'Document' }];
  function Composer(p){
    var st = React.useState(p.value || ''), val = st[0], setVal = st[1];
    var ref = React.useRef(null);
    if (p.open === false) return h('button', { type: 'button', className: 'vl-palhint', onClick: p.onOpen, 'aria-keyshortcuts': 'Meta+K', 'aria-label': 'Open commands (⌘K)' }, h(Kbd, null, '⌘K'), h('span', null, p.hintLabel || 'Commands'));
    var q = val.trim(), sections, route = null;
    if (!q) sections = [{ title: 'Suggestions', items: p.suggestions || PAL_STARTS }];
    else if (q[0] === '/') { var w = q.slice(1).toLowerCase(); sections = [{ title: 'Commands', items: (p.commands || PAL_CMDS).filter(function(c){ return c.cmd.slice(1).indexOf(w) === 0; }) }]; }
    else if (q.length >= 2) { var lw = q.toLowerCase(); sections = [{ title: 'Cards', items: (p.cards || PAL_CARDS).filter(function(c){ return c.cmd.toLowerCase().indexOf(lw) >= 0; }) }, { title: 'Commands', items: (p.commands || PAL_CMDS).filter(function(c){ return c.cmd.slice(1).indexOf(lw) === 0; }).slice(0, 3) }]; }
    if (q) route = p.route || (q[0] === '/' ? 'Run command' : 'Add as an idea');
    sections = (sections || []).filter(function(s){ return s.items.length; });
    return h('form', { className: 'vl-pal', role: 'dialog', 'aria-label': 'Commands', onSubmit: function(e){ e.preventDefault(); if (!q) return; if (p.onSubmit) p.onSubmit(val); setVal(''); } },
      h('div', { className: 'vl-pal-field' },
        h(Icon, { name: 'search' }),
        h('input', { ref: ref, value: val, autoFocus: p.autoFocus, placeholder: p.placeholder || 'Type a command, or search', 'aria-label': 'Commands and search', spellCheck: false,
          onChange: function(e){ setVal(e.target.value); },
          onKeyDown: function(e){ if (e.key === 'Escape' && p.onClose) { e.preventDefault(); p.onClose(); } } }),
        route ? h('span', { className: 'vl-pal-route', title: 'What ↵ will do' }, route, h(Kbd, null, '↵')) : null),
      sections.length ? h(CommandMenu, { embedded: true, sections: sections, tip: !q && !p.learned ? h(React.Fragment, null, 'Type ', h(Kbd, { size: 'sm' }, '/'), ' to see every command') : null, onPick: p.onPick }) : null);
  }

  /* CommandMenu: the rows inside the palette (and the "/" list above the Copilot input). One row: an icon tile,
     the command, a quiet description, who does it, and its keycap. Sections are separated by a small heading, not rules. */
  function CommandMenu(p){
    var sections = p.sections || [{ title: p.title || 'Commands', items: p.items || PAL_CMDS }];
    var flat = []; sections.forEach(function(s){ s.items.forEach(function(it){ flat.push(it); }); });
    var as = React.useState(p.active || 0), act = as[0], setAct = as[1];
    var uid = React.useRef('vl-cmd-' + Math.random().toString(36).slice(2, 7)).current;
    function onKey(e){ if (!flat.length) return; if (e.key === 'ArrowDown') { e.preventDefault(); setAct((act + 1) % flat.length); } else if (e.key === 'ArrowUp') { e.preventDefault(); setAct((act - 1 + flat.length) % flat.length); } else if (e.key === 'Enter' && p.onPick) { e.preventDefault(); p.onPick(flat[act]); } }
    var n = -1;
    return h('div', { className: cx('vl-cmd', p.embedded && 'is-embedded', p.compact && 'is-compact'), role: 'listbox', 'aria-label': sections[0].title, tabIndex: 0, onKeyDown: onKey, 'aria-activedescendant': uid + '-' + act },
      sections.map(function(s, si){
        return h(React.Fragment, { key: si }, h('div', { className: 'vl-cmd-h', role: 'presentation' }, s.title),
          s.items.map(function(it){ var i = ++n; var c = it.member && CREW[it.member];
            return h('div', { key: i, id: uid + '-' + i, role: 'option', 'aria-selected': String(i === act), className: cx('vl-cmd-i', i === act && 'is-active', !it.desc && 'is-short'), onMouseEnter: function(){ setAct(i); }, onClick: function(){ if (p.onPick) p.onPick(it); } },
              h('span', { className: 'vl-cmd-ic', 'aria-hidden': 'true' }, it.icon ? h(Icon, { name: it.icon }) : h('i', { className: 'vl-cmd-dot', style: it.dot ? { '--c': 'var(--' + it.dot + '-fill)' } : null })),
              h('span', { className: 'vl-cmd-c' }, it.cmd, it.hint ? h('small', null, ' ' + it.hint) : null),
              it.desc ? h('span', { className: 'vl-cmd-d' }, it.desc) : null,
              it.kbd ? h(Kbd, null, it.kbd) : h('span', { className: 'vl-cmd-who' }, c ? c.name : ''));
          }));
      }),
      p.tip ? h('div', { className: 'vl-cmd-tip' }, p.tip) : null);
  }

  /* Kbd: a keycap. Filled, with a hairline edge and a slightly heavier bottom so it reads as a key. */
  function Kbd(p){ return h('kbd', { className: cx('vl-kbd', p.size === 'sm' && 'is-sm') }, p.children); }

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
      h('div', { className: 'vl-cp-foot' }, h(Button, null, 'Customize'), h(Button, { icon: 'notepad' }, 'Memory')));
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


  /* ── P2a: app parts ─────────────────────────────────────────────────────── */
  var MINUS = '<path d="M5 12h14"/>';
  ICONS.minus = MINUS;
  ICONS.lineage = '<circle cx="5" cy="6" r="2.2"/><circle cx="19" cy="18" r="2.2"/><path d="M7.2 6c6.3 0 3.3 12 9.6 12"/>';
  ICONS.thumbUp = '<path d="M7 10v11"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>';
  ICONS.thumbDown = '<path d="M17 14V3"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>';
  var KIND_NAMES = { source: 'Source', recording: 'Recording', image: 'Image', frame: 'Frame', audio: 'Audio', link: 'Link', notepad: 'Notepad', idea: 'Core thesis', synthesis: 'Synthesis', direction: 'Direction', question: 'Question', note: 'Sticky', proof: 'Proof', list: 'Action list', kanban: 'Kanban', snapshot: 'Snapshot', group: 'Group' };

  function useEdges(){
    var ref = React.useRef(null), st = React.useState({ top: false, more: false }), edges = st[0], set = st[1];
    function sync(){ var b = ref.current; if (!b) return; var top = b.scrollTop > 2, more = b.scrollTop + b.clientHeight < b.scrollHeight - 2; if (top !== edges.top || more !== edges.more) set({ top: top, more: more }); }
    React.useLayoutEffect(sync);
    return [ref, edges, sync];
  }

  function SheetSection(p){
    return h('section', { className: 'vl-ssec' },
      p.title ? h('h5', null, h('span', null, p.title), p.meta != null ? h('span', { className: 'vl-ssec-meta' }, p.meta) : null) : null,
      p.children);
  }

  function SheetComposer(p){
    var st = React.useState(''), val = st[0], setVal = st[1], has = val.trim().length > 0;
    return h('form', { className: 'vl-swrite', onSubmit: function(e){ e.preventDefault(); if (has && p.onSend) p.onSend(val); setVal(''); } },
      h('input', { value: val, onChange: function(e){ setVal(e.target.value); }, placeholder: p.placeholder || 'Add a note, or ask @critic', 'aria-label': p.placeholder || 'Add a note' }),
      h('button', { type: 'submit', className: 'vl-send', disabled: !has, 'aria-label': 'Send' }, h(Icon, { name: 'send' })));
  }

  /* Sheet (the Margin): a card opened to read and write in full. */
  function Sheet(p){
    var e = useEdges(), ref = e[0], edges = e[1], sync = e[2];
    var crew = p.by && p.by !== 'you' ? CREW[p.by] : null;
    var parts = [];
    var kind = p.kindLabel || KIND_NAMES[p.kind] || '';
    if (kind) parts.push(h('span', { key: 'k', title: crew && p.engine ? 'Made by ' + crew.name + ' using ' + p.engine : undefined }, kind + (crew ? ' by ' + crew.name : '')));
    if (p.rev > 1) parts.push(h('span', { key: 'v' }, 'v' + p.rev));
    if (p.time) parts.push(h('time', { key: 't', title: p.timeFull }, p.time));
    var sub = [];
    parts.forEach(function(x, i){ if (i) sub.push(h('span', { key: 's' + i, className: 'vl-sdot', 'aria-hidden': 'true' }, '·')); sub.push(x); });
    return h('div', { className: cx('vl-sheet', edges.top && 'is-scrolled', edges.more && 'has-more'), role: 'dialog', 'aria-label': p.title, style: { '--pg': p.lineage ? 'var(--' + p.lineage + ')' : undefined, width: p.width } },
      h('header', { className: 'vl-shead' },
        h('div', { className: 'vl-shead-main' }, h('h2', null, p.title),
          h('div', { className: 'vl-ssub' }, p.lineage ? h(LineageChip, { lineage: p.lineage }) : null, sub)),
        h('div', { className: 'vl-stools' }, p.tools, h(Button, { icon: 'x', 'aria-label': 'Close · Esc', className: 'vl-sx', onClick: p.onClose }))),
      h('div', { className: 'vl-sbody', ref: ref, onScroll: sync, style: { maxHeight: p.bodyHeight } }, p.children),
      p.composer === false ? null : h('footer', { className: 'vl-sfoot' }, h(SheetComposer, p.composer || {})));
  }

  /* SourceRow: one line of "Based on" inside a Sheet. Kind on top, full title, an exception or evidence pill at the right. */
  function SourceRow(p){
    var pill = p.status ? h('span', { className: cx('vl-spill', p.status === 'changed' && 'is-warn', p.status === 'unavailable' && 'is-danger') }, p.statusLabel || { changed: 'Changed', frozen: 'Frozen', unavailable: 'Unavailable', archived: 'Archived', hidden: 'Hidden' }[p.status])
      : p.weight ? h(EvidenceWeight, { weight: p.weight }) : null;
    return h('button', { type: 'button', className: 'vl-srow', onClick: p.onOpen },
      h('span', { className: 'vl-skind' }, p.kind), h('span', { className: 'vl-stitle' }, p.title), pill);
  }

  /* EvidenceBlocks: one block per source behind a card (proportional above 16). */
  function EvidenceBlocks(p){
    var t = { observed: p.observed || 0, reported: p.reported || 0, proposed: p.proposed || 0, unrated: p.unrated || 0 };
    var total = t.observed + t.reported + t.proposed + t.unrated, each = total <= 16;
    var names = { observed: 'observed', reported: 'reported', proposed: 'proposal', unrated: 'unrated' }, cls = { observed: '', reported: 'r', proposed: 'p', unrated: 'n' };
    var summary = Object.keys(t).filter(function(k){ return t[k]; }).map(function(k){ return t[k] + ' ' + names[k]; }).join(' · ');
    var blocks = [];
    Object.keys(t).forEach(function(k){ var n = t[k]; if (!n) return; if (each) for (var i = 0; i < n; i++) blocks.push(h('i', { key: k + i, className: cls[k] || null })); else blocks.push(h('i', { key: k, className: cls[k] || null, style: { flex: n } })); });
    return h('div', { className: 'vl-evb' },
      p.label === false ? null : h('div', { className: 'vl-evb-cap', title: 'Every source this card rests on, including those behind linked directions and questions. One block per source.' }, h('span', null, p.label || 'Evidence behind it'), h('span', null, summary)),
      h('div', { className: cx('vl-scale', each && 'is-count'), role: 'img', 'aria-label': 'Evidence: ' + summary }, blocks));
  }

  /* Overview: the minimap, bottom left. */
  var OV_SAMPLE = [[0,.08,.1,.36,.22,0],[0,.5,.1,.36,.18,0],[0,.08,.4,.36,.2,0],[0,.5,.36,.36,.26,0],[0,.08,.68,.36,.2,0],[1,.06,.1,.36,.16,0],[1,.5,.12,.36,.18,'B'],[1,.06,.36,.36,.2,0],[1,.5,.4,.36,.16,'C'],[1,.06,.62,.36,.12,'note'],[2,.06,.1,.36,.28,0],[2,.5,.1,.36,.26,0],[2,.5,.42,.36,.3,0],[2,.06,.48,.36,.2,0],[3,.06,.1,.36,.24,'B'],[3,.5,.1,.36,.22,0],[3,.06,.42,.36,.16,0],[3,.5,.38,.36,.3,0]];
  function Overview(p){
    var stages = p.stages || ['Gather', 'Explore', 'Prototype', 'Snapshot'], cur = p.stage == null ? 1 : p.stage, pending = p.pending || [];
    var zs = React.useState(p.zoom || 34), zoom = zs[0], setZoom = zs[1];
    var ss = React.useState(cur), at = ss[0], setAt = ss[1];
    var cards = p.cards || OV_SAMPLE;
    return h('div', { className: 'vl-ov', role: 'region', 'aria-label': 'Overview' },
      h('div', { className: 'vl-ov-head' }, h('span', { className: 'vl-ov-title' }, p.title || 'Overview'),
        h('span', { className: 'vl-ov-zoom', role: 'group', 'aria-label': 'Zoom' },
          h('button', { type: 'button', 'aria-label': 'Zoom out · ⌘−', onClick: function(){ setZoom(Math.max(10, zoom - 10)); } }, h(Icon, { name: 'minus' })),
          h('button', { type: 'button', className: 'vl-ov-pct', title: 'Fit board · ⇧1' }, zoom + '%'),
          h('button', { type: 'button', 'aria-label': 'Zoom in · ⌘+', onClick: function(){ setZoom(Math.min(200, zoom + 10)); } }, h(Icon, { name: 'plus' })))),
      h('div', { className: 'vl-ov-map', 'aria-hidden': 'true' },
        stages.map(function(s, i){ return h('div', { key: i, className: cx('vl-ov-bay', i === at && 'is-view') },
          cards.filter(function(c){ return c[0] === i; }).map(function(c, k){ return h('i', { key: k, className: cx(c[5] === 'note' && 'is-note', c[5] && c[5] !== 'note' && 'is-pg'), style: { left: c[1] * 100 + '%', top: c[2] * 100 + '%', width: c[3] * 100 + '%', height: c[4] * 100 + '%', '--pg': c[5] && c[5] !== 'note' ? 'var(--' + c[5] + '-mark)' : undefined } }); })); })),
      h('div', { className: 'vl-ov-stages', role: 'tablist', 'aria-label': 'Stages' },
        stages.map(function(s, i){ return h('button', { key: i, type: 'button', role: 'tab', 'aria-selected': String(i === at), className: cx(i === at && 'is-on'), title: s + ' (' + (i + 1) + ')', onClick: function(){ setAt(i); if (p.onStage) p.onStage(i); } }, s, pending.indexOf(i) >= 0 ? h('i', { className: 'vl-ov-dot', 'aria-label': 'new crew work' }) : null); })));
  }

  /* Wire + Port: how cards connect. A wire is a mark, so lineage wires use the *-fill hue. */
  function Wire(p){
    var a = p.from || [0, 0], b = p.to || [200, 80], dx = Math.max(40, Math.abs(b[0] - a[0]) * .5);
    var d = 'M' + a[0] + ' ' + a[1] + ' C' + (a[0] + dx) + ' ' + a[1] + ' ' + (b[0] - dx) + ' ' + b[1] + ' ' + b[0] + ' ' + b[1];
    var w = Math.max(a[0], b[0]) + 8, ht = Math.max(a[1], b[1]) + 8;
    return h('svg', { className: cx('vl-wire', p.lineage && 'is-pg', p.state && 'is-' + p.state), width: p.width || w, height: p.height || ht, style: { '--pg': p.lineage ? 'var(--' + p.lineage + '-mark)' : undefined, position: p.absolute ? 'absolute' : undefined, left: 0, top: 0 }, 'aria-hidden': 'true' },
      h('path', { d: d }), h('circle', { cx: b[0], cy: b[1], r: 3 }));
  }
  function Port(p){
    return h('span', { className: cx('vl-port', p.kind === 'in' && 'is-in', p.connected && 'is-connected', p.visible && 'is-visible'), 'data-side': p.side || 'right', role: 'button', tabIndex: 0, 'aria-label': p.kind === 'in' ? 'Drop a wire here' : 'Drag to connect' });
  }

  /* StageHeader: the big stage name above each bay. */
  function StageHeader(p){
    var ls = React.useState(!!p.locked), locked = ls[0], setLocked = ls[1];
    return h('div', { className: 'vl-stage' }, h('span', { className: 'vl-stage-n' }, p.step || '01'), h('h2', null, p.name || 'Gather'),
      p.sub ? h('p', null, p.sub) : null,
      h('button', { type: 'button', className: cx('vl-stage-lock', locked && 'is-on'), 'aria-pressed': String(locked), title: locked ? 'Unlock ' + (p.name || 'stage') : 'Lock ' + (p.name || 'stage') + ': only you change its kept cards', onClick: function(){ setLocked(!locked); if (p.onLock) p.onLock(!locked); } }, h(Icon, { name: 'lock' })));
  }

  /* SelectionStrip: actions for the selected card, floating above it. Groups are separated by space, not bars. */
  function SelectionStrip(p){
    var groups = p.groups || [[{ label: 'Explore', icon: 'enhance' }, { label: 'Ask', icon: 'ask' }], [{ icon: 'copy', label: 'Duplicate', iconOnly: true }, { icon: 'lock', label: 'Lock', iconOnly: true }, { icon: 'trash', label: 'Delete', iconOnly: true, danger: true }]];
    return h('div', { className: 'vl-strip', role: 'toolbar', 'aria-label': p.label || 'Actions for the selected card', style: { '--pg': p.lineage ? 'var(--' + p.lineage + ')' : undefined } },
      groups.map(function(g, gi){ return h('div', { key: gi, className: 'vl-strip-g' }, g.map(function(it, i){
        return h('button', { key: i, type: 'button', className: cx(it.iconOnly && 'is-icon', it.danger && 'is-danger', it.lineage && 'is-pg'), title: it.iconOnly ? it.label + (it.key ? ' · ' + it.key : '') : undefined, 'aria-label': it.iconOnly ? it.label : undefined, onClick: it.onClick },
          it.icon ? h(Icon, { name: it.icon }) : null, it.iconOnly ? null : it.label); })); }));
  }

  /* CrewCursor: where a crew member is working on the board, and what it is doing. */
  function CrewCursor(p){
    return h('div', { className: 'vl-ccur', role: 'status', 'aria-live': 'polite' }, h(CrewMark, { member: p.member || 'scout', state: 'working', size: 'sm' }), h('span', { className: 'vl-ccur-lbl' }, p.label || 'Reading 3/7'));
  }

  /* Dialog: a focused task that needs an answer before you go on. Prefer a Sheet or an inline control first. */
  function Dialog(p){
    var panel = h('div', { className: 'vl-dlg', role: 'dialog', 'aria-modal': p.scrim ? 'true' : undefined, 'aria-label': p.title, style: { width: p.width } },
      h('div', { className: 'vl-dlg-head' }, h('h2', null, p.title), h(Button, { variant: 'secondary', icon: 'x', 'aria-label': 'Close · Esc', onClick: p.onClose })),
      h('div', { className: 'vl-dlg-body' }, p.children),
      p.actions ? h('div', { className: 'vl-dlg-acts' }, p.actions) : null);
    return p.scrim ? h('div', { className: 'vl-scrim' }, panel) : panel;
  }


  /* ── P2b: primitives. Fill only (outlines are for focus), labels only when they carry information. ── */
  var uidN = 0; function useId(prefix){ var r = React.useRef(null); if (!r.current) r.current = (prefix || 'vl') + '-' + (++uidN); return r.current; }

  /* Segmented: 2–4 mutually exclusive options. Public version of the control inside CrewSettings. */
  function Segmented(p){ return h(Seg, { label: p.label, options: p.options || ['Board', 'List'], value: p.value || (p.options || ['Board'])[0], onChange: p.onChange }); }

  /* Tooltip: a short label plus its shortcut, joined by a middle dot. Shows on hover and keyboard focus. */
  function Tooltip(p){
    var id = useId('vl-tip'), st = React.useState(!!p.open), open = st[0], setOpen = st[1];
    var child = React.Children.only(p.children);
    var trigger = React.cloneElement(child, { 'aria-describedby': id, onMouseEnter: function(){ setOpen(true); }, onMouseLeave: function(){ if (!p.open) setOpen(false); }, onFocus: function(){ setOpen(true); }, onBlur: function(){ if (!p.open) setOpen(false); } });
    return h('span', { className: cx('vl-tipwrap', 'is-' + (p.side || 'top')) }, trigger,
      h('span', { id: id, role: 'tooltip', className: cx('vl-tip', open && 'is-open') }, p.label, p.shortcut ? h('span', { className: 'vl-tip-k' }, ' · ' + p.shortcut) : null));
  }

  /* Tag: a small filled label for kind or status. Never outlined. */
  function Tag(p){ return h('span', { className: cx('vl-tag', p.tone && 'is-' + p.tone), style: p.lineage ? { '--pg': 'var(--' + p.lineage + ')' } : undefined }, p.icon ? h(Icon, { name: p.icon }) : null, p.children); }

  /* TextField: a filled well. The label sits above; help or error sits below. */
  function TextField(p){
    var id = useId('vl-tf'), err = !!p.error, Tag2 = p.multiline ? 'textarea' : 'input';
    var st = React.useState(p.value || ''), val = st[0], setVal = st[1];
    return h('div', { className: cx('vl-tf', err && 'is-error', p.disabled && 'is-disabled') },
      p.label ? h('label', { htmlFor: id, className: 'vl-tf-l' }, p.label, p.optional ? h('span', null, ' optional') : null) : null,
      h(Tag2, { id: id, className: 'vl-input', value: val, rows: p.multiline ? (p.rows || 3) : undefined, placeholder: p.placeholder, disabled: p.disabled, 'aria-invalid': err ? 'true' : undefined, 'aria-describedby': (p.help || p.error) ? id + '-h' : undefined,
        onChange: function(e){ setVal(e.target.value); if (p.onChange) p.onChange(e.target.value); } }),
      (p.error || p.help) ? h('div', { id: id + '-h', className: 'vl-tf-h' }, err ? h(Icon, { name: 'alert' }) : null, p.error || p.help) : null);
  }

  /* Checkbox and Switch. Checkbox for items in a list you tick off; Switch for a setting that applies at once. */
  function Checkbox(p){
    var st = React.useState(!!p.checked), on = st[0], set = st[1];
    return h('label', { className: cx('vl-check', p.disabled && 'is-disabled') },
      h('input', { type: 'checkbox', checked: on, disabled: p.disabled, onChange: function(e){ set(e.target.checked); if (p.onChange) p.onChange(e.target.checked); } }),
      h('span', { className: 'vl-check-box', 'aria-hidden': 'true' }, h(Icon, { name: 'check' })), p.label ? h('span', { className: 'vl-check-l' }, p.label) : null);
  }
  function Switch(p){
    var st = React.useState(!!p.checked), on = st[0], set = st[1];
    return h('label', { className: cx('vl-switch', p.disabled && 'is-disabled') },
      p.label ? h('span', { className: 'vl-switch-l' }, p.label, p.help ? h('small', null, p.help) : null) : null,
      h('button', { type: 'button', role: 'switch', 'aria-checked': String(on), disabled: p.disabled, className: 'vl-switch-t', onClick: function(){ set(!on); if (p.onChange) p.onChange(!on); } }, h('span', { className: 'vl-switch-k' })));
  }

  /* Tabs: a filled pill marks the current tab; no underline rule. */
  function Tabs(p){
    var tabs = p.tabs || [{ id: 'notes', label: 'Notes', count: 2 }, { id: 'history', label: 'History' }, { id: 'sources', label: 'Sources', count: 5 }];
    var st = React.useState(p.value || tabs[0].id), cur = st[0], set = st[1];
    function pick(id){ set(id); if (p.onChange) p.onChange(id); }
    return h('div', { className: 'vl-tabs', role: 'tablist', 'aria-label': p.label || 'Sections', onKeyDown: function(e){ var i = tabs.findIndex(function(t){ return t.id === cur; }), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; e.preventDefault(); var n = tabs[(i + d + tabs.length) % tabs.length]; pick(n.id); var el = e.currentTarget.querySelector('[data-tab="' + n.id + '"]'); if (el) el.focus(); } },
      tabs.map(function(t){ var on = t.id === cur; return h('button', { key: t.id, type: 'button', role: 'tab', 'data-tab': t.id, 'aria-selected': String(on), tabIndex: on ? 0 : -1, className: cx(on && 'is-on'), onClick: function(){ pick(t.id); } }, t.label, t.count ? h('span', { className: 'vl-tabs-n' }, t.count) : null); }));
  }

  /* Progress: a bar for work with a known end, a ring for compact or crew progress. No percentage when it is unknown. */
  function Progress(p){
    var known = p.value != null, pct = known ? Math.max(0, Math.min(100, p.value)) : null;
    return h('div', { className: 'vl-prog' },
      (p.label || known) ? h('div', { className: 'vl-prog-cap' }, h('span', null, p.label), known && p.showValue !== false ? h('span', null, Math.round(pct) + '%') : null) : null,
      h('div', { className: cx('vl-prog-t', !known && 'is-indeterminate'), role: 'progressbar', 'aria-label': p.label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': known ? Math.round(pct) : undefined, style: p.member ? { '--crew': CREW[p.member].ink } : undefined },
        h('i', { style: known ? { width: pct + '%' } : undefined })));
  }
  function ProgressRing(p){
    var size = p.size || 28, r = (size - 4) / 2, c = 2 * Math.PI * r, known = p.value != null, pct = known ? Math.max(0, Math.min(100, p.value)) : 30;
    return h('svg', { className: cx('vl-ring', !known && 'is-indeterminate'), width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, role: 'progressbar', 'aria-label': p.label || 'Progress', 'aria-valuenow': known ? Math.round(pct) : undefined, style: p.member ? { '--crew': CREW[p.member].ink } : undefined },
      h('circle', { cx: size / 2, cy: size / 2, r: r, className: 'tr' }),
      h('circle', { cx: size / 2, cy: size / 2, r: r, className: 'pg', strokeDasharray: c, strokeDashoffset: c * (1 - pct / 100), transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')' }));
  }

  /* Skeleton: the shape of content that is on its way. Static under reduced motion. */
  function Skeleton(p){
    if (p.card) return h('div', { className: 'vl-skel-card', 'aria-busy': 'true', 'aria-label': 'Loading' }, h('i', { className: 'vl-skel', style: { width: '40%', height: 10 } }), h('i', { className: 'vl-skel', style: { width: '86%', height: 16, marginTop: 12 } }), h('i', { className: 'vl-skel', style: { width: '64%', height: 16, marginTop: 6 } }), h('i', { className: 'vl-skel', style: { width: '100%', height: 10, marginTop: 18 } }), h('i', { className: 'vl-skel', style: { width: '92%', height: 10, marginTop: 6 } }));
    return h('i', { className: 'vl-skel', 'aria-hidden': 'true', style: { width: p.width || '100%', height: p.height || 12, borderRadius: p.round ? '50%' : undefined } });
  }

  /* EmptyState: what goes here, and the one thing to do next. */
  function EmptyState(p){
    return h('div', { className: 'vl-empty' }, p.icon ? h('span', { className: 'vl-empty-i' }, h(Icon, { name: p.icon })) : null,
      h('h3', null, p.title || 'No evidence yet'), p.children ? h('p', null, p.children) : null,
      p.action ? h('div', { className: 'vl-empty-a' }, p.action) : null);
  }

  /* InlineAlert: a message that belongs to one place on the page. Tinted fill, never a border box. */
  function InlineAlert(p){
    var tone = p.tone || 'info', ico = { info: 'alert', warn: 'alert', danger: 'alert', ok: 'check' }[tone];
    return h('div', { className: cx('vl-alert', 'is-' + tone), role: tone === 'danger' ? 'alert' : 'status' },
      h(Icon, { name: ico }), h('div', { className: 'vl-alert-m' }, p.title ? h('b', null, p.title) : null, p.children),
      p.action ? h('div', { className: 'vl-alert-a' }, p.action) : null);
  }


  /* ── ProofCard: an experiment that tests a direction. Results first, thumbnail second. ── */
  var FORMAT = { page: 'Page', tour: 'Guided tour', deck: 'Slide deck' };
  function ProofCard(p){
    var versions = p.versions && p.versions.length ? p.versions : [{ ver: p.ver || 1, results: p.results, failed: p.failed, image: p.image, changed: p.changed }];
    var latest = versions.length - 1;
    var vs = React.useState(p.viewing != null ? p.viewing : latest), at = vs[0], setAt = vs[1];
    var is = React.useState(!!p.iterating), iter = is[0], setIter = is[1];
    var ts = React.useState(''), txt = ts[0], setTxt = ts[1];
    var v = versions[at], old = at !== latest, building = p.state === 'building' && !old;
    var r = v.results || null, fails = v.failed || [];
    var drift = !old && p.sourcesChanged ? p.sourcesChanged : 0;
    var nextVer = versions[latest].ver + 1;

    // One next step, chosen by state.
    var primary = null;
    if (building) primary = h(Button, { size: 'sm', variant: 'primary', loading: true }, 'Building v' + nextVer);
    else if (old) primary = h(Button, { size: 'sm', onClick: function(){ setAt(latest); } }, 'Back to v' + versions[latest].ver);
    else if (r && r.failed) primary = h(Button, { size: 'sm', variant: 'primary', onClick: p.onFix }, 'Fix ' + r.failed + ' failed');
    else if (drift) primary = h(Button, { size: 'sm', variant: 'primary', onClick: p.onRebuild }, 'Rebuild with ' + drift + ' change' + (drift > 1 ? 's' : ''));
    else if (!r) primary = h(Button, { size: 'sm', variant: 'primary', icon: 'ask', onClick: p.onTest }, 'Ask Critic to test');
    else if (r.waiting) primary = h(Button, { size: 'sm', variant: 'primary', icon: 'ask', onClick: p.onTest }, 'Test ' + r.waiting + ' waiting');
    else primary = h(Button, { size: 'sm', variant: 'primary', icon: 'check', onClick: p.onSnapshot }, 'Snapshot');

    var blocks = [];
    if (r) [['passed', 'ok'], ['failed', 'bad'], ['waiting', 'wait']].forEach(function(k){ for (var i = 0; i < (r[k[0]] || 0); i++) blocks.push(h('i', { key: k[0] + i, className: 'is-' + k[1] })); });
    var summary = r ? [['passed', 'passed'], ['failed', 'failed'], ['waiting', 'waiting']].filter(function(k){ return r[k[0]]; }).map(function(k){ return r[k[0]] + ' ' + k[1]; }).join(' · ') : '';

    return h('article', { className: cx('vl-pc', old && 'is-old', building && 'is-building'), style: { '--pg': p.lineage ? 'var(--' + p.lineage + ')' : undefined }, 'aria-label': 'Proof ' + (p.lineage || '') + ' v' + v.ver + ': ' + p.title },
      h('button', { type: 'button', className: 'vl-pc-thumb', onClick: p.onOpen, 'aria-label': 'Open ' + p.title },
        v.image ? h('img', { src: v.image, alt: '' }) : h('span', { className: 'vl-pc-ph' }),
        h('span', { className: 'vl-pc-fmt' }, FORMAT[p.format] || 'Page'),
        building ? h('span', { className: 'vl-pc-sweep', 'aria-hidden': 'true' }) : null),
      h('div', { className: 'vl-pc-in' },
        h('div', { className: 'vl-pc-k' },
          p.lineage ? h(LineageChip, { lineage: p.lineage }) : null,
          h('span', null, 'Proof'),
          h('span', { className: 'vl-sp' }),
          versions.length > 1 ? h('span', { className: 'vl-pc-ver', role: 'group', 'aria-label': 'Version' },
            h('button', { type: 'button', 'aria-label': 'Previous version', disabled: at === 0, onClick: function(){ setAt(at - 1); } }, h(Icon, { name: 'chevron' })),
            h('span', null, 'v' + v.ver),
            h('button', { type: 'button', 'aria-label': 'Next version', disabled: at === latest, onClick: function(){ setAt(at + 1); } }, h(Icon, { name: 'chevron' })))
          : h('span', { className: 'vl-pc-ver1' }, 'v' + v.ver)),
        h('h4', null, p.title),
        building ? h('div', { className: 'vl-pc-res' }, h('div', { className: 'vl-pc-cap' }, h('span', null, 'Wright is building v' + nextVer + (p.buildNote ? ': ' + p.buildNote : '')))) :
        r ? h('div', { className: 'vl-pc-res', title: fails.length ? 'Failed: ' + fails.join('; ') : undefined },
            h('div', { className: 'vl-pc-blocks', role: 'img', 'aria-label': summary }, blocks),
            h('div', { className: 'vl-pc-cap' }, h('span', null, summary), r.failed === 0 && r.waiting === 0 ? h('span', { className: 'vl-pc-pass' }, h(Icon, { name: 'check' }), 'Passes its test') : null),
            null)
          : h('div', { className: 'vl-pc-res is-empty' }, h('div', { className: 'vl-pc-cap' }, h('span', null, 'Not tested yet. Critic can check it against the test above.'))),
        old && v.changed ? h('p', { className: 'vl-pc-note' }, 'v' + versions[latest].ver + ' changed: ' + v.changed) : null,
        drift ? h('p', { className: 'vl-pc-drift' }, h(Icon, { name: 'alert' }), drift + ' source' + (drift > 1 ? 's' : '') + ' changed since v' + v.ver) : null,
        iter && !old && !building ? h('form', { className: 'vl-pc-iter', onSubmit: function(e){ e.preventDefault(); if (txt.trim() && p.onIterate) p.onIterate(txt); setTxt(''); setIter(false); } },
            h('input', { autoFocus: true, value: txt, onChange: function(e){ setTxt(e.target.value); }, onKeyDown: function(e){ if (e.key === 'Escape') setIter(false); }, placeholder: 'What should v' + nextVer + ' change?', 'aria-label': 'What should v' + nextVer + ' change?' }),
            h('button', { type: 'submit', className: 'vl-send', disabled: !txt.trim(), 'aria-label': 'Build v' + nextVer }, h(Icon, { name: 'send' }))) : null,
        h('div', { className: 'vl-pc-meta' }, h('span', { className: 'vl-from', title: 'Built from Direction ' + (p.lineage || '') + ' and ' + (p.sources || 0) + ' sources' }, h(Icon, { name: 'lineage' }), (p.lineage || '') + ' \u00b7 ' + (p.sources || 0) + ' sources'), h('span', { className: 'vl-sp' }), h('span', null, p.time || '')),
        h('div', { className: 'vl-pc-acts' },
          !old && !building ? h(Button, { size: 'sm', variant: 'ghost', onClick: p.onChange }, 'Change') : null,
          h(Button, { size: 'sm', onClick: p.onOpen }, 'Open'), primary)));
  }

  /* ── 27 Nov: the pieces the app gained after the design pass ── */
  ICONS.copilot = '<path d="M12 4.6 19.2 17.6H4.8Z"/><path d="M2.8 13.6 8.8 11.4"/><path d="M16 11.4 21.2 9.4"/>';
  ICONS.relate = '<path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1"/><path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1"/>';
  ICONS.more = '<circle cx="5" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.8" fill="currentColor" stroke="none"/>';
  ICONS.fork = '<circle cx="6" cy="5.5" r="2"/><circle cx="18" cy="5.5" r="2"/><circle cx="12" cy="18.5" r="2"/><path d="M6 7.5V9a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7.5M12 12v4.5"/>';
  ICONS.build = '<path d="M12 3.5 19.5 7.8v8.4L12 20.5l-7.5-4.3V7.8z"/><path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12.1v8.4"/>';
  ICONS.gather = '<circle cx="12" cy="12" r="8.5"/><path d="m15.6 8.4-2.4 4.8-4.8 2.4 2.4-4.8z"/>';
  ICONS.critique = '<path d="M12 5v14.6M8.4 19.6h7.2M4.8 7.8h14.4"/><path d="M4.8 7.8 2.7 12.9a2.2 2.2 0 0 0 4.2 0zM19.2 7.8l-2.1 5.1a2.2 2.2 0 0 0 4.2 0z"/>';
  ICONS.note = '<path d="M5.5 5.5h13v8.6l-4.4 4.4H5.5z"/><path d="M14.1 18.5v-4.4h4.4"/>';
  ICONS.synth = '<path d="M5 4.5v3.2a7 7 0 0 0 7 7 7 7 0 0 0 7-7V4.5M12 14.7v4.8"/><circle cx="12" cy="20" r=".9" fill="currentColor" stroke="none"/>';
  ICONS.list = '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="5" cy="6.5" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="17.5" r="1"/>';
  ICONS.kanban = '<rect x="3.5" y="4.5" width="4.5" height="15" rx="1.2"/><rect x="9.75" y="4.5" width="4.5" height="11" rx="1.2"/><rect x="16" y="4.5" width="4.5" height="13" rx="1.2"/>';
  ICONS.treemap = '<rect x="3" y="9" width="6" height="6" rx="1.5"/><rect x="15" y="4" width="6" height="4.5" rx="1.2"/><rect x="15" y="15.5" width="6" height="4.5" rx="1.2"/><path d="M9 12h2.5c1.5 0 1.5-5.75 3.5-5.75M9 12h2.5c1.5 0 1.5 5.75 3.5 5.75"/>';

  /* SelectionBar: two or more cards selected. One small solid bar 8–12px above them that follows them.
     [Ask Copilot | ▾] first, then Relate, Group, Hide, Delete and ⋯. No "2 selected": the rings already say it. */
  var SB_MAKE = [{ icon: 'synth', label: 'Synthesize' }, { icon: 'list', label: 'Action list' }, { icon: 'kanban', label: 'Kanban' }, { icon: 'treemap', label: 'Tree map' }, { icon: 'critique', label: 'Critique' }];
  var SB_MORE = [{ label: 'Align left edges' }, { label: 'Align tops' }, { label: 'Distribute horizontally' }, { label: 'Duplicate', kbd: '⌘D' }];
  function SelectionBar(p){
    var ms = React.useState(p.menu || null), menu = ms[0], setMenu = ms[1];
    function tog(m){ setMenu(menu === m ? null : m); }
    function item(it, i){ return h('button', { key: i, type: 'button', role: 'menuitem', onClick: it.onClick }, it.icon ? h(Icon, { name: it.icon }) : null, h('span', null, it.label), it.kbd ? h(Kbd, null, it.kbd) : null); }
    var make = (p.make || SB_MAKE).slice(), more = p.more || SB_MORE;
    var ic = function(k, icon, label, tip, extra){ return h('button', Object.assign({ type: 'button', className: cx('vl-sb-ic', k === 'delete' && 'is-del'), 'aria-label': label, title: tip || label, onClick: p['on' + k[0].toUpperCase() + k.slice(1)] }, extra || {}), h(Icon, { name: icon })); };
    return h('div', { className: 'vl-sb', role: 'toolbar', 'aria-label': 'Selected cards' },
      h('div', { className: 'vl-sb-split' },
        h('button', { type: 'button', className: 'vl-sb-main', title: 'Chat about these cards · ⌘↵', 'aria-keyshortcuts': 'Meta+Enter', onClick: p.onAsk }, h(Icon, { name: 'copilot' }), h('span', null, 'Ask Copilot')),
        h('button', { type: 'button', className: 'vl-sb-caret', 'aria-haspopup': 'menu', 'aria-expanded': String(menu === 'make'), 'aria-label': 'Make something from these cards', title: 'Make from these', onClick: function(){ tog('make'); } }, h(Icon, { name: 'chevron' }))),
      ic('relate', 'relate', 'Relate'), ic('group', 'group', 'Group'), ic('hide', 'eyeOff', 'Hide', 'Hide · ⇧H'), ic('delete', 'trash', 'Delete', 'Delete · ⌫'),
      ic('more', 'more', 'More', 'Arrange', { 'aria-haspopup': 'menu', 'aria-expanded': String(menu === 'more'), onClick: function(){ tog('more'); } }),
      menu === 'make' ? h('div', { className: 'vl-sb-menu is-make', role: 'menu' }, make.map(item), p.hasPictures ? [h('span', { key: 'sep', className: 'vl-sb-sep', role: 'separator' }), item({ icon: 'image', label: 'GIF' }, 'g'), item({ icon: 'video', label: 'Video' }, 'v')] : null) : null,
      menu === 'more' ? h('div', { className: 'vl-sb-menu is-more', role: 'menu' }, more.map(item)) : null);
  }

  /* CopilotButton: Copilot's door, in the top bar at the end, right above the panel it opens. Monochrome mark, no label. */
  function CopilotButton(p){
    return h('button', { type: 'button', className: cx('vl-cpbtn', p.open && 'is-open'), 'aria-expanded': String(!!p.open), 'aria-label': (p.open ? 'Close' : 'Open') + ' Copilot (⌘.)', title: 'Copilot · ⌘.', 'aria-keyshortcuts': 'Meta+.', onClick: p.onClick }, h(Icon, { name: 'copilot' }));
  }

  /* EvidenceLine: one plain verdict on a judgment card (idea, synthesis, direction, question) instead of "x/y rated".
     The mark is the weight's own glyph; hovering or focusing it opens the breakdown (EvidenceCard). */
  var EV_GLYPH = { observed: '<path d="M1.1 6S3.1 2.5 6 2.5 10.9 6 10.9 6 8.9 9.5 6 9.5 1.1 6 1.1 6Z"/><circle cx="6" cy="6" r="1.55"/>', reported: '<path d="M2.6 2.2h6.8a1.2 1.2 0 0 1 1.2 1.2v3.9a1.2 1.2 0 0 1-1.2 1.2H5.4L3.2 10.1V8.5h-.6a1.2 1.2 0 0 1-1.2-1.2V3.4a1.2 1.2 0 0 1 1.2-1.2Z"/>', proposed: '<path d="M4.4 8.1A3.4 3.4 0 1 1 7.6 8.1v.8H4.4Z"/><path d="M4.7 10.6h2.6"/>', none: '<circle cx="6" cy="6" r="4.2" stroke-dasharray="2 1.6"/>' };
  var EV_VERDICT = { mostly: ['observed', 'Mostly observed'], partly: ['observed', 'Partly observed'], secondhand: ['reported', 'Mostly second-hand'], hearsay: ['reported', 'Second-hand only'], thin: ['proposed', 'No evidence yet'], unrated: ['none', 'Not rated yet'] };
  function EvGlyph(p){ return h('svg', { className: cx('vl-ev-ico', 'is-' + p.k), viewBox: '0 0 12 12', 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: EV_GLYPH[p.k] } }); }
  function EvidenceLine(p){
    var v = EV_VERDICT[p.verdict || 'mostly'], n = p.sources == null ? 3 : p.sources;
    var os = React.useState(!!p.open), open = os[0], setOpen = os[1];
    return h('span', { className: 'vl-evl-wrap' },
      h('span', { className: cx('vl-evl', open && 'is-open', p.verdict === 'unrated' && 'is-empty'), tabIndex: 0, role: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': String(open), 'aria-label': 'Evidence: ' + v[1] + ', ' + n + ' source' + (n === 1 ? '' : 's'),
        onMouseEnter: function(){ setOpen(true); }, onMouseLeave: function(){ if (!p.open) setOpen(false); }, onFocus: function(){ setOpen(true); }, onBlur: function(){ if (!p.open) setOpen(false); } },
        h(EvGlyph, { k: v[0] }), h('span', null, v[1])),
      open ? h(EvidenceCard, { verdict: p.verdict, counts: p.counts, sentence: p.sentence }) : null);
  }
  function EvidenceCard(p){
    var v = EV_VERDICT[p.verdict || 'mostly'], c = p.counts || { observed: 2, reported: 1, proposed: 0 };
    var rows = [['observed', 'Observed', 'Watched in real use or a test'], ['reported', 'Reported', 'Someone told us'], ['proposed', 'Proposal', 'Our own idea, not evidence']].filter(function(r){ return c[r[0]]; });
    var total = rows.reduce(function(s, r){ return s + c[r[0]]; }, 0) + (c.none || 0);
    return h('div', { className: 'vl-evc', role: 'dialog', 'aria-label': 'Evidence' },
      h('div', { className: 'vl-evc-head' }, h(EvGlyph, { k: v[0] }), h('b', null, v[1])),
      h('p', null, p.sentence || ((c.observed || 0) + ' of ' + total + ' sources ' + ((c.observed || 0) === 1 ? 'was' : 'were') + ' watched first-hand.')),
      h('ul', null, rows.map(function(r){ return h('li', { key: r[0] }, h('span', { className: 'vl-evc-g' }, h(EvGlyph, { k: r[0] })), h('span', { className: 'vl-evc-t' }, h('b', null, r[1]), h('small', null, r[2])), h('span', { className: 'vl-evc-n' }, c[r[0]])); })),
      h('div', { className: 'vl-evc-acts' }, c.none ? h('button', { type: 'button' }, 'Rate the rest') : null, h('button', { type: 'button', className: 'is-primary' }, 'Show sources')));
  }

  /* AvatarGroup: who worked on a card, beside its time. One avatar alone; up to three stacked; more than three shows two and "+N".
     On hover or focus the avatars ease apart and a card lists who did what. A check on an avatar: drafted by the crew, confirmed by you. */
  function Avatar(p){
    var c = p.member && CREW[p.member];
    var inner = c ? h('span', { className: 'vl-av-mk' }, h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: c.svg } }))
      : h('span', { className: cx('vl-av-mk', 'is-person', !p.initials && 'is-anon') }, p.initials || '?');
    var st = Object.assign({}, p.style, p.color && !c ? { '--person': p.color, '--person-ink': '#fff' } : null);
    return h('span', { className: cx('vl-av', p.size === 'md' && 'is-md'), style: st }, inner,
      p.confirmed ? h('span', { className: 'vl-av-ok', 'aria-hidden': 'true' }, h('svg', { viewBox: '0 0 12 12', dangerouslySetInnerHTML: { __html: '<path d="m3.2 6.2 1.9 1.9 3.8-4"/>' } })) : null);
  }
  var AV_SAMPLE = [{ initials: 'M', name: 'You', role: 'Wrote the claim', when: '9:02 AM' }, { member: 'strategist', role: 'Forked it into 3 directions', when: '9:10 AM', confirmed: true }, { member: 'critic', role: 'Asked about the test', when: '9:14 AM' }];
  function AvatarGroup(p){
    var ppl = p.people || AV_SAMPLE, os = React.useState(!!p.open), open = os[0], setOpen = os[1];
    var shown = ppl.length > 3 ? ppl.slice(0, 2) : ppl, more = ppl.length - shown.length;
    var name = function(x){ return x.name || (x.member && CREW[x.member].name) || 'Someone'; };
    return h('span', { className: 'vl-avg-wrap' },
      h('span', { className: cx('vl-avg', open && 'is-open'), tabIndex: 0, role: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': String(open), 'aria-label': ppl.length + ' contributor' + (ppl.length === 1 ? '' : 's') + ': ' + ppl.map(name).join(', '),
        onMouseEnter: function(){ setOpen(true); }, onMouseLeave: function(){ if (!p.open) setOpen(false); }, onFocus: function(){ setOpen(true); }, onBlur: function(){ if (!p.open) setOpen(false); } },
        shown.map(function(x, i){ return h(Avatar, Object.assign({ key: i, style: { '--i': i } }, x)); }),
        more ? h('span', { className: 'vl-av-more', style: { '--i': shown.length } }, '+' + more) : null),
      open ? h('div', { className: 'vl-avc', role: 'dialog', 'aria-label': 'Who worked on this' },
        h('header', null, 'Worked on this'),
        h('ul', null, ppl.map(function(x, i){ return h('li', { key: i, style: { '--i': i } }, h(Avatar, Object.assign({ size: 'md' }, x)), h('span', { className: 'vl-avc-t' }, h('b', null, name(x)), h('small', null, x.role)), x.when ? h('time', null, x.when) : null); }))) : null);
  }

  window.Vellum = { SelectionBar: SelectionBar, CopilotButton: CopilotButton, EvidenceLine: EvidenceLine, EvidenceCard: EvidenceCard, Avatar: Avatar, AvatarGroup: AvatarGroup, ProofCard: ProofCard, Segmented: Segmented, Tooltip: Tooltip, Kbd: Kbd, Tag: Tag, TextField: TextField, Checkbox: Checkbox, Switch: Switch, Tabs: Tabs, Progress: Progress, ProgressRing: ProgressRing, Skeleton: Skeleton, EmptyState: EmptyState, InlineAlert: InlineAlert, Sheet: Sheet, SheetSection: SheetSection, SourceRow: SourceRow, EvidenceBlocks: EvidenceBlocks, Overview: Overview, Wire: Wire, Port: Port, StageHeader: StageHeader, SelectionStrip: SelectionStrip, CrewCursor: CrewCursor, CommandMenu: CommandMenu, Dialog: Dialog, Card: Card, LineageChip: LineageChip, EvidenceWeight: EvidenceWeight, CrewMark: CrewMark, Button: Button, ReviewPill: ReviewPill, ToolRail: ToolRail, Composer: Composer, Toast: Toast, DraftBar: DraftBar, TaskIsland: TaskIsland, CrewBar: CrewBar, CrewSettings: CrewSettings, CardMenu: CardMenu, Icon: Icon, Root: Root, CREW: CREW };
})();
