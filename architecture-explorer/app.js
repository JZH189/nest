/* =========================================================================
 * NestJS 源码架构探索 · 渲染引擎与交互（零依赖）
 * 数据来自 data.js 的 window.__NEST_ARCH_DATA__，本文件不硬编码任何业务内容。
 * ========================================================================= */
(() => {
  'use strict';

  const DATA = window.__NEST_ARCH_DATA__;
  const $ = sel => document.querySelector(sel);
  const svgNS = 'http://www.w3.org/2000/svg';

  /* ---------- 常量：布局 / 配色 ---------- */
  const LANE_W = 264, ROW_H = 98, PAD_X = 44, TITLE_H = 56;
  const FONT = 'Consolas, ui-monospace, monospace';

  const CATS = {
    bootstrap:  { label: '启动',      color: '#2563eb' },
    scan:       { label: '扫描',      color: '#0891b2' },
    container:  { label: '容器/DI',   color: '#7c3aed' },
    route:      { label: '路由',      color: '#ea580c' },
    enhancer:   { label: '增强器',    color: '#16a34a' },
    exception:  { label: '异常',      color: '#dc2626' },
    contract:   { label: '契约',      color: '#64748b' },
    platform:   { label: '平台适配',  color: '#b45309' },
    business:   { label: 'cats-app',  color: '#ca8a04' },
    decorator:  { label: '装饰器',    color: '#db2777' },
    test:       { label: '测试',      color: '#0d9488' },
    eco:        { label: '生态',      color: '#475569' },
    util:       { label: '工具',      color: '#6b7280' },
  };

  const EDGE_STYLES = {
    creates:    { color: '#2563eb', dash: null,      w: 1.7 },
    calls:      { color: '#0284c7', dash: null,      w: 1.4 },
    extends:    { color: '#7c3aed', dash: null,      w: 2.6 },
    implements: { color: '#7c3aed', dash: '7 4',     w: 1.8 },
    registers:  { color: '#0891b2', dash: '6 4',     w: 1.5 },
    scans:      { color: '#0891b2', dash: '6 4',     w: 1.5 },
    resolves:   { color: '#059669', dash: null,      w: 1.4 },
    uses:       { color: '#059669', dash: '5 4',     w: 1.3 },
    provides:   { color: '#059669', dash: null,      w: 1.4 },
    annotates:  { color: '#db2777', dash: '4 4',     w: 1.4 },
    reads:      { color: '#db2777', dash: '2 3',     w: 1.3 },
    'throws-to':{ color: '#dc2626', dash: '8 4',     w: 1.7 },
    depends:    { color: '#64748b', dash: '2 5',     w: 1.3 },
    feeds:      { color: '#475569', dash: '5 4',     w: 1.3 },
  };
  const TYPE_LABEL = {
    creates: '创建', calls: '调用', extends: '继承', implements: '实现',
    registers: '注册', scans: '扫描', resolves: '解析/注入', uses: '使用',
    provides: '提供', annotates: '标注', reads: '读取', 'throws-to': '抛往',
    depends: '依赖', feeds: '供给',
  };

  const KIND_BADGE = {
    class: '', interface: 'I', decoratorGroup: '@', functionGroup: 'ƒ',
    constants: '#', package: '▣', file: '▤',
  };
  const KIND_LABEL = {
    class: 'class', interface: 'interface（契约）', decoratorGroup: '装饰器组',
    functionGroup: '函数组', constants: '常量表', package: 'npm 包', file: '业务文件',
  };
  const PKG_SHORT = {
    '@nestjs/core': 'core', '@nestjs/common': 'common',
    '@nestjs/platform-express': 'express', '@nestjs/testing': 'testing',
    '@nestjs/websockets': 'ws', '@nestjs/microservices': 'ms',
    'sample/01-cats-app': 'cats-app',
  };

  /* ---------- 全局索引 ---------- */
  const nodeById = new Map(DATA.nodes.map(n => [n.id, n]));
  const stagesOfNode = new Map();
  DATA.stages.forEach(st => st.nodes.forEach(id => {
    if (!stagesOfNode.has(id)) stagesOfNode.set(id, []);
    stagesOfNode.get(id).push(st.id);
  }));

  /* ---------- 状态 ---------- */
  const state = {
    mode: 'home',            // home | journey | map
    journey: null,           // { id, step }
    stageId: DATA.stages[0].id,
    selected: null,          // { kind:'node'|'edge', id }
    zoom: { k: 1, x: 0, y: 0 },
    userMovedView: false,
    anim: null,              // { raf, cancel }
    layoutCache: new Map(),  // nodeId -> {cx,cy,w,h}
    adjacency: null,         // hover 用
  };
  let stageEdges = [];

  /* ---------- 工具 ---------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const catOf = n => CATS[n.cat[0]] || CATS.contract;

  function wrapName(name) {
    if (name.length <= 20) return [name];
    // 找接近中点的大写字母处断行
    const mid = Math.ceil(name.length / 2);
    let best = -1;
    for (let i = 4; i < name.length - 4; i++) {
      if (/[A-Z/]/.test(name[i]) && Math.abs(i - mid) < Math.abs(best - mid)) best = i;
    }
    if (best < 0) best = mid;
    return [name.slice(0, best), name.slice(best)];
  }

  function measure(n) {
    const lines = wrapName(n.name);
    const maxLen = Math.max(...lines.map(l => l.length));
    const w = clamp(maxLen * 7.6 + 34, 118, 232);
    const h = lines.length > 1 ? 62 : 46;
    return { lines, w, h };
  }

  function nodePos(stage, id) {
    const p = (stage.pos && stage.pos[id]) || { col: 1, row: 1 };
    return {
      cx: PAD_X + (p.col - 1) * LANE_W + LANE_W / 2,
      cy: TITLE_H + (p.row - 1) * ROW_H + 28,
    };
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    t.style.opacity = '1';
    clearTimeout(toast._h);
    toast._h = setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.classList.add('hidden'), 260); }, 2300);
  }

  function copyText(text) {
    const done = () => toast('已复制：' + text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动选择'); }
    document.body.removeChild(ta);
  }

  /* ---------- SVG 构建 ---------- */
  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS(svgNS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  function buildDefs() {
    const svg = $('#canvas');
    let defs = svg.querySelector('defs');
    if (defs) defs.remove();
    defs = svgEl('defs', {}, svg);
    svg.insertBefore(defs, svg.firstChild);
    for (const type in EDGE_STYLES) {
      const st = EDGE_STYLES[type];
      const m = svgEl('marker', {
        id: 'ah-' + type, viewBox: '0 0 10 10', refX: 9, refY: 5,
        markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse',
      }, defs);
      svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: st.color }, m);
    }
  }

  /* ---------- 阶段渲染 ---------- */
  function currentStage() { return DATA.stages.find(s => s.id === state.stageId); }

  function buildAdjacency(edges) {
    const adj = new Map();
    const addAdj = (a, b, edge) => {
      if (!adj.has(a)) adj.set(a, { nodes: new Set(), edges: new Set() });
      adj.get(a).nodes.add(b); adj.get(a).edges.add(edge);
    };
    edges.forEach(e => { addAdj(e.from, e.to, e); addAdj(e.to, e.from, e); });
    return adj;
  }

  function renderStage(keepSelection) {
    const stage = currentStage();
    stopAnim();
    if (!keepSelection) { state.selected = null; }

    const gEdges = $('#edges'), gNodes = $('#nodes');
    gEdges.innerHTML = ''; gNodes.innerHTML = '';
    $('#anim').innerHTML = '';
    state.layoutCache.clear();

    // 泳道标题
    (stage.lanes || []).forEach((lane, i) => {
      const cx = PAD_X + i * LANE_W + LANE_W / 2;
      const t = svgEl('text', { x: cx, y: 24, class: 'edge-label', style: 'font-size:12px;font-weight:600' }, gEdges);
      t.textContent = lane;
      const ln = svgEl('line', {
        x1: cx - LANE_W / 2 + 8, y1: 36, x2: cx + LANE_W / 2 - 8, y2: 36,
        stroke: 'var(--border)', 'stroke-dasharray': '3 5', 'stroke-width': 1,
      }, gEdges);
      void ln;
    });

    // 阶段内的节点 / 边
    const nodes = stage.nodes.map(id => nodeById.get(id)).filter(Boolean);
    const idSet = new Set(stage.nodes);
    stageEdges = DATA.edges.filter(e =>
      e.stages.includes(stage.id) && idSet.has(e.from) && idSet.has(e.to));

    // 邻接表（hover 淡化用，旅程/地图共用）
    state.adjacency = buildAdjacency(stageEdges);

    // 先画边（在节点下层）：v2 路由 = 扇形锚点 + 同列绕行/跨列通道 + 标签防碰撞
    const routes = buildRoutes(stage, stageEdges);
    stageEdges.forEach((e, i) => drawRoutedEdge(e, routes[i], gEdges));
    // 再画节点
    nodes.forEach(n => drawNode(n, gNodes, stage));

    // 头部信息
    $('#stage-title').textContent = `Stage ${stage.id} · ${stage.title}`;
    $('#stage-question').textContent = stage.question || '';
    $('#stage-narrative').textContent = stage.narrative || '';
    const hint = $('#stage-catshint');
    if (stage.catsAppHint) { hint.textContent = '🐱 ' + stage.catsAppHint; hint.classList.remove('hidden'); }
    else hint.classList.add('hidden');
    renderLegend(stage);
    const playBtn = $('#play-btn');
    if (stage.play) { playBtn.classList.remove('hidden'); playBtn.textContent = '▶ 播放一次 GET /cats/1'; playBtn.classList.remove('playing'); }
    else playBtn.classList.add('hidden');

    // 底部叙事条
    $('#prev-stage').disabled = stage.id <= DATA.stages[0].id;
    $('#next-stage').disabled = stage.id >= DATA.stages[DATA.stages.length - 1].id;
    const total = DATA.stages.length;
    $('#narrative-text').textContent = `引导模式 ${stage.id + 1}/${total} —— ${stage.title}：${stage.question || ''}`;

    // tab 高亮
    document.querySelectorAll('.stage-tab').forEach(b =>
      b.classList.toggle('active', +b.dataset.stage === stage.id));

    state.userMovedView = false;
    fitView();
    if (state.selected && state.selected.kind === 'node' && idSet.has(state.selected.id)) {
      renderNodeSelection();
    } else if (state.selected && state.selected.kind === 'edge') {
      renderDetailPlaceholder();
    } else {
      renderDetailPlaceholder();
    }
    syncTreeActive();
  }

  function renderLegend(stage) {
    const box = $('#legend'); box.innerHTML = '';
    const present = new Set(), counts = {};
    stage.nodes.forEach(id => {
      const n = nodeById.get(id); if (!n) return;
      n.cat.forEach(c => { present.add(c); counts[c] = (counts[c] || 0) + 1; });
    });
    // 边类型图例
    const edgeTypes = new Set(stageEdges.map(e => e.type));
    present.forEach(c => {
      const chip = document.createElement('span');
      chip.className = 'legend-chip';
      chip.innerHTML = `<span class="sw" style="background:${CATS[c].color}"></span>${CATS[c].label} ×${counts[c]}`;
      box.appendChild(chip);
    });
    const et = document.createElement('span');
    et.className = 'legend-chip';
    et.innerHTML = '线型：实线=创建/调用 · 粗线=继承 · 虚线=注册/扫描 · 点线=依赖/读取' + (edgeTypes.has('throws-to') ? ' · 红=异常流' : '');
    et.style.opacity = '.8';
    box.appendChild(et);
  }

  function drawNode(n, parent, stageOverride) {
    const stage = stageOverride || currentStage();
    const { cx, cy } = nodePos(stage, n.id);
    const { lines, w, h } = measure(n);
    state.layoutCache.set(n.id, { cx, cy, w, h });

    const g = svgEl('g', { class: 'node', 'data-id': n.id, tabindex: 0, role: 'button' }, parent);
    const color = catOf(n).color;
    const isContract = n.kind === 'interface' || n.kind === 'constants';
    svgEl('rect', {
      class: 'node-box', x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 9,
      fill: isContract ? 'transparent' : hexA(color, isDark() ? 0.20 : 0.10),
      stroke: color, 'stroke-width': 1.8, 'stroke-dasharray': isContract ? '6 4' : null,
    }, g);

    const nameY = lines.length > 1 ? cy - 8 : cy - 4;
    lines.forEach((ln, i) => {
      const t = svgEl('text', {
        x: cx, y: nameY + i * 15, class: 'node-name' + (i > 0 ? ' second-line' : ''),
      }, g);
      t.textContent = ln;
    });
    const pkgT = svgEl('text', { x: cx, y: cy + h / 2 - 8, class: 'node-pkg' }, g);
    pkgT.textContent = PKG_SHORT[n.pkg] || n.pkg;
    const badge = KIND_BADGE[n.kind];
    if (badge) {
      const b = svgEl('text', {
        x: cx + w / 2 - 11, y: cy - h / 2 + 14, class: 'node-kind', fill: color,
      }, g);
      b.textContent = badge;
    }

    g.addEventListener('click', ev => { ev.stopPropagation(); openNodeByMode(n.id); });
    g.addEventListener('keydown', ev => { if (ev.key === 'Enter') openNodeByMode(n.id); });
    g.addEventListener('mouseenter', () => hoverNode(n.id, true));
    g.addEventListener('mouseleave', () => hoverNode(n.id, false));
    return g;
  }

  /* ---------- 边路由 v2：扇形锚点 + 同列绕行/跨列通道 + 标签防碰撞 ---------- */

  function nodeBoxOf(stage, id) {
    const n = nodeById.get(id);
    const p = (stage.pos && stage.pos[id]) || { col: 1, row: 1 };
    const { cx, cy } = nodePos(stage, id);
    const { w, h } = measure(n);
    return {
      id, col: p.col, row: p.row, cx, cy, w, h,
      left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2,
    };
  }

  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // 折线转圆角 path
  function orthoPathD(pts, r) {
    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1], p = pts[i], next = pts[i + 1];
      const d1 = Math.max(1, dist2(prev, p)), d2 = Math.max(1, dist2(p, next));
      const rr = Math.min(r, d1 / 2, d2 / 2);
      const ax = p.x + (prev.x - p.x) * (rr / d1), ay = p.y + (prev.y - p.y) * (rr / d1);
      const bx = p.x + (next.x - p.x) * (rr / d2), by = p.y + (next.y - p.y) * (rr / d2);
      d += ` L${ax.toFixed(1)},${ay.toFixed(1)} Q${p.x},${p.y} ${bx.toFixed(1)},${by.toFixed(1)}`;
    }
    const last = pts[pts.length - 1];
    d += ` L${last.x.toFixed(1)},${last.y.toFixed(1)}`;
    return d;
  }

  function cubicPoint(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    };
  }

  // 沿路径均匀采样（供标签选址）
  function sampleSpec(spec, n) {
    const pts = [];
    if (spec.kind === 'cubic') {
      for (let i = 0; i < n; i++) pts.push(cubicPoint(spec.p0, spec.p1, spec.p2, spec.p3, i / (n - 1)));
    } else {
      const seg = spec.pts;
      const lens = [0];
      for (let i = 1; i < seg.length; i++) lens.push(lens[i - 1] + dist2(seg[i - 1], seg[i]));
      const total = lens[lens.length - 1] || 1;
      let j = 0;
      for (let i = 0; i < n; i++) {
        const target = (i / (n - 1)) * total;
        while (j < seg.length - 2 && lens[j + 1] < target) j++;
        const t = (target - lens[j]) / Math.max(1e-6, lens[j + 1] - lens[j]);
        pts.push({ x: seg[j].x + (seg[j + 1].x - seg[j].x) * t, y: seg[j].y + (seg[j + 1].y - seg[j].y) * t });
      }
    }
    return pts;
  }

  const labelW = s => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 10 : 5.8), 0) + 8;

  function placeLabel(spec, text, nodeBoxes, placed) {
    const pts = sampleSpec(spec, 64);
    const w = labelW(text), h = 17;
    const candT = [0.5, 0.34, 0.66, 0.24, 0.76, 0.16, 0.84, 0.42, 0.58];
    for (const t of candT) {
      const p = pts[Math.round(t * (pts.length - 1))];
      for (const dy of [0, -19, 19, -36, 36]) {
        const box = { x: p.x - w / 2 - 3, y: p.y - h / 2 - 1 + dy, w: w + 6, h: h + 2 };
        const hitNode = nodeBoxes.some(nb =>
          box.x < nb.right + 5 && box.x + box.w > nb.left - 5 &&
          box.y < nb.bottom + 5 && box.y + box.h > nb.top - 5);
        const hitLabel = placed.some(lb =>
          box.x < lb.x + lb.w && box.x + box.w > lb.x &&
          box.y < lb.y + lb.h && box.y + box.h > lb.y);
        if (!hitNode && !hitLabel) return { x: p.x, y: p.y + dy - 5 };
      }
    }
    return null; // 实在放不下就不显示（悬停/点边仍可看到）
  }

  function buildRoutes(stage, edges) {
    const boxes = new Map();
    const boxOf = id => {
      if (!boxes.has(id)) boxes.set(id, nodeBoxOf(stage, id));
      return boxes.get(id);
    };
    // 先装入本 Stage 全部节点：遮挡判断必须考虑所有节点，而不只是已处理过的边的端点
    stage.nodes.forEach(boxOf);
    const allBoxes = () => [...boxes.values()];

    // 1) 路由类型与出入侧
    const plans = edges.map(e => {
      const a = boxOf(e.from), b = boxOf(e.to);
      const colDiff = b.col - a.col;
      let kind, srcSide, dstSide;
      if (colDiff === 0) {
        const blocked = allBoxes().some(x => x.col === a.col && x.id !== a.id && x.id !== b.id &&
          x.row > Math.min(a.row, b.row) && x.row < Math.max(a.row, b.row));
        if (Math.abs(b.row - a.row) === 1 || !blocked) {
          kind = 'direct-v'; srcSide = b.row > a.row ? 'bottom' : 'top'; dstSide = b.row > a.row ? 'top' : 'bottom';
        } else { kind = 'side-v'; srcSide = 'right'; dstSide = 'right'; }
      } else if (Math.abs(colDiff) === 1) {
        kind = 'direct-h'; srcSide = colDiff > 0 ? 'right' : 'left'; dstSide = colDiff > 0 ? 'left' : 'right';
      } else {
        kind = 'channel'; srcSide = colDiff > 0 ? 'right' : 'left'; dstSide = colDiff > 0 ? 'left' : 'right';
      }
      return { e, a, b, kind, srcSide, dstSide, out: 0, inn: 0 };
    });

    // 2) 扇形锚点：同节点同侧的边按对端坐标排序后均布，避免同点叠出
    const groups = new Map();
    const addTo = (key, entry) => { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(entry); };
    plans.forEach(p => {
      addTo(`${p.e.from}|${p.srcSide}`, { p, role: 'src', side: p.srcSide });
      addTo(`${p.e.to}|${p.dstSide}`, { p, role: 'dst', side: p.dstSide });
    });
    groups.forEach(list => {
      list.sort((x, y) => {
        const ox = boxOf(x.role === 'src' ? x.p.e.to : x.p.e.from);
        const oy = boxOf(y.role === 'src' ? y.p.e.to : y.p.e.from);
        const alongX = x.side === 'top' || x.side === 'bottom';
        return alongX ? ox.cx - oy.cx : ox.cy - oy.cy;
      });
      const n = list.length;
      list.forEach((entry, i) => {
        const node = boxOf(entry.role === 'src' ? entry.p.e.from : entry.p.e.to);
        const alongX = entry.side === 'top' || entry.side === 'bottom';
        const span = alongX ? Math.max(20, node.w - 28) : Math.max(16, node.h - 16);
        const spacing = n > 1 ? Math.min(22, span / (n - 1)) : 0;
        const off = (i - (n - 1) / 2) * spacing;
        if (entry.role === 'src') entry.p.out = off; else entry.p.inn = off;
      });
    });

    // 3) 生成路径
    const usedChannels = [];
    const sideStack = new Map();
    function pickChannel(lo, hi, preferY, a, b) {
      const L = Math.min(lo, hi) - 6, R = Math.max(lo, hi) + 6;
      const maxRow = Math.max(...allBoxes().map(x => x.row));
      const cands = [];
      for (let r = 1; r < maxRow; r++) cands.push(TITLE_H + (r - 1) * ROW_H + 28 + ROW_H / 2); // 行间通道
      cands.push(TITLE_H + (maxRow - 1) * ROW_H + 28 + ROW_H / 2);                              // 末行下方
      const clear = y => !allBoxes().some(x =>
        x.id !== a.id && x.id !== b.id &&
        y > x.top - 10 && y < x.bottom + 10 && x.right > L && x.left < R);
      const ok = cands.filter(clear).sort((p, q) => Math.abs(p - preferY) - Math.abs(q - preferY));
      for (const y of ok)
        if (!usedChannels.some(u => Math.abs(u - y) < 14)) { usedChannels.push(y); return y; }
      for (const y of ok)
        for (const dy of [12, -12, 24, -24]) {
          const yy = y + dy;
          if (clear(yy) && !usedChannels.some(u => Math.abs(u - yy) < 14)) { usedChannels.push(yy); return yy; }
        }
      return ok[0] !== undefined ? ok[0] : preferY;
    }

    // 起降段竖直短线避让：同列若有更宽的节点，把 jog x 推到其外侧
    function clearJogX(x, dir, yLo, yHi, a, b) {
      for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        for (const box of allBoxes()) {
          if (box.id === a.id || box.id === b.id) continue;
          if (box.bottom < yLo - 4 || box.top > yHi + 4) continue; // 纵向不相遇
          if (x > box.left - 9 && x < box.right + 9) {
            x = dir > 0 ? box.right + 11 : box.left - 11;
            moved = true;
          }
        }
        if (!moved) break;
      }
      return x;
    }

    const specs = plans.map(p => {
      const { a, b, kind } = p;
      if (kind === 'direct-h') {
        const sx = p.srcSide === 'right' ? a.right : a.left;
        const tx = p.dstSide === 'left' ? b.left : b.right;
        const sy = a.cy + p.out, ty = b.cy + p.inn;
        const mx = (sx + tx) / 2;
        const p0 = { x: sx, y: sy }, p1 = { x: mx, y: sy }, p2 = { x: mx, y: ty }, p3 = { x: tx, y: ty };
        return { kind: 'cubic', p0, p1, p2, p3,
          d: `M${p0.x},${p0.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}` };
      }
      if (kind === 'direct-v') {
        const down = b.row > a.row;
        const sy = down ? a.bottom : a.top, ty = down ? b.top : b.bottom;
        const sx = a.cx + p.out, tx = b.cx + p.inn;
        const my = (sy + ty) / 2;
        const p0 = { x: sx, y: sy }, p1 = { x: sx, y: my }, p2 = { x: tx, y: my }, p3 = { x: tx, y: ty };
        return { kind: 'cubic', p0, p1, p2, p3,
          d: `M${p0.x},${p0.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}` };
      }
      if (kind === 'side-v') {
        const key = String(a.col);
        const idx = sideStack.get(key) || 0; sideStack.set(key, idx + 1);
        const useRight = idx % 2 === 0;
        const off = 8 + Math.floor(idx / 2) * 11;
        const bx = useRight ? a.cx + LANE_W / 2 + off : a.cx - LANE_W / 2 - off;
        const sEdge = useRight ? a.right : a.left;
        const tEdge = useRight ? b.right : b.left;
        const pts = [{ x: sEdge, y: a.cy }, { x: bx, y: a.cy }, { x: bx, y: b.cy }, { x: tEdge, y: b.cy }];
        return { kind: 'ortho', pts, d: orthoPathD(pts, 12) };
      }
      // channel：跨多列，先走到无遮挡的行间通道再横穿
      const sx = p.srcSide === 'right' ? a.right : a.left;
      const tx = p.dstSide === 'left' ? b.left : b.right;
      const sy = a.cy + p.out, ty = b.cy + p.inn;
      const x1 = sx + (p.srcSide === 'right' ? 24 : -24);
      const x2 = tx + (p.dstSide === 'left' ? -24 : 24);
      const channelY = pickChannel(x1, x2, (sy + ty) / 2, a, b);
      const X1 = clearJogX(x1, p.srcSide === 'right' ? 1 : -1, Math.min(sy, channelY), Math.max(sy, channelY), a, b);
      const X2 = clearJogX(x2, p.dstSide === 'left' ? -1 : 1, Math.min(ty, channelY), Math.max(ty, channelY), a, b);
      const pts = [{ x: sx, y: sy }, { x: X1, y: sy }, { x: X1, y: channelY }, { x: X2, y: channelY }, { x: X2, y: ty }, { x: tx, y: ty }];
      return { kind: 'ortho', pts, d: orthoPathD(pts, 14) };
    });

    // 4) 标签防碰撞
    const placedLabels = [];
    const nodeBoxesArr = allBoxes();
    specs.forEach((spec, i) => {
      const e = edges[i];
      if (!e.label) return;
      const pos = placeLabel(spec, e.label, nodeBoxesArr, placedLabels);
      if (pos) {
        spec.label = pos;
        placedLabels.push({ x: pos.x - labelW(e.label) / 2, y: pos.y - 8, w: labelW(e.label), h: 16 });
      }
    });

    window.__ARCH_DEBUG__ = {
      routes: specs.map((s, i) => ({ from: edges[i].from, to: edges[i].to, samples: sampleSpec(s, 48) })),
      boxes: nodeBoxesArr,
    };
    return specs;
  }

  function drawRoutedEdge(e, spec, parent) {
    if (!spec) return;
    const st = EDGE_STYLES[e.type] || EDGE_STYLES.calls;
    const g = svgEl('g', { class: 'edge', 'data-edge': `${e.from}>${e.to}` }, parent);
    const path = svgEl('path', {
      d: spec.d, stroke: st.color, 'stroke-width': st.w,
      'stroke-dasharray': st.dash || null, 'marker-end': `url(#ah-${e.type})`,
    }, g);
    const hit = svgEl('path', { d: spec.d, class: 'edge-hit' }, g);
    if (e.label && spec.label) {
      const t = svgEl('text', { x: spec.label.x, y: spec.label.y, class: 'edge-label' }, g);
      t.textContent = e.label;
    }
    hit.addEventListener('click', ev => { ev.stopPropagation(); selectEdge(e, path); });
    hit.addEventListener('mouseenter', () => path.setAttribute('stroke-width', st.w + 1.4));
    hit.addEventListener('mouseleave', () => path.setAttribute('stroke-width', st.w));
  }

  /* ---------- hover 淡化 ---------- */
  function hoverNode(id, on) {
    const svg = $('#canvas');
    if (!on) {
      svg.classList.remove('dimmed');
      document.querySelectorAll('#canvas .related').forEach(el => el.classList.remove('related'));
      return;
    }
    const adj = state.adjacency && state.adjacency.get(id);
    svg.classList.add('dimmed');
    document.querySelectorAll('#canvas .related').forEach(el => el.classList.remove('related'));
    const nodeEl = document.querySelector(`#canvas .node[data-id="${CSS.escape(id)}"]`);
    if (nodeEl) nodeEl.classList.add('related');
    if (adj) {
      adj.nodes.forEach(nid => {
        const el = document.querySelector(`#canvas .node[data-id="${CSS.escape(nid)}"]`);
        if (el) el.classList.add('related');
      });
      adj.edges.forEach(e => {
        const el = document.querySelector(`#canvas .edge[data-edge="${CSS.escape(e.from)}>${CSS.escape(e.to)}"]`);
        if (el) el.classList.add('related');
      });
    }
  }

  /* ---------- 选中 / 详情面板 ---------- */
  function selectNode(id, opts) {
    stopAnim();
    const inStage = currentStage().nodes.includes(id);
    if (!inStage) {
      const target = stagesOfNode.get(id);
      if (target && target.length) {
        state.stageId = target[0];
        state.selected = { kind: 'node', id };
        renderStage(true);
        toast(`已跳转：该类属于 ${stageTitle(target[0])}`);
        return;
      }
      return;
    }
    state.selected = { kind: 'node', id };
    renderNodeSelection();
    ensureNodeVisible(id);
    syncTreeActive(id);
    if (opts && opts.fromTree) closeSearch();
  }

  function renderNodeSelection() {
    const id = state.selected.id;
    document.querySelectorAll('#canvas .node.selected').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('#canvas .edge.selected-edge').forEach(el => el.classList.remove('selected-edge'));
    const el = document.querySelector(`#canvas .node[data-id="${CSS.escape(id)}"]`);
    if (el) el.classList.add('selected');
    renderNodeDetail(nodeById.get(id));
  }

  function selectEdge(e, pathEl) {
    if (state.mode === 'journey') { toast(e.label || `${e.from} → ${e.to}`); return; }
    stopAnim();
    state.selected = { kind: 'edge', id: `${e.from}>${e.to}` };
    document.querySelectorAll('#canvas .node.selected').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('#canvas .edge.selected-edge').forEach(el => el.classList.remove('selected-edge'));
    if (pathEl) pathEl.classList.add('selected-edge');
    renderEdgeDetail(e);
  }

  function stageTitle(id) {
    const st = DATA.stages.find(s => s.id === id);
    return st ? `Stage ${st.id} · ${st.title}` : '';
  }

  function chipHtml(cls, text, style) {
    return `<span class="chip ${cls || ''}" ${style ? `style="${style}"` : ''}>${text}</span>`;
  }

  function renderNodeDetail(n, container) {
    if (!n) return;
    const box = container || $('#detail-inner');
    const color = catOf(n).color;
    const catChips = n.cat.map(c => chipHtml('cat-chip', CATS[c].label, `border-color:${CATS[c].color};color:${CATS[c].color}`)).join('');
    const stageChips = (stagesOfNode.get(n.id) || [])
      .map(sid => `<span class="chip node-link" data-id-stage="${sid}" style="cursor:pointer">${stageTitle(sid)}</span>`).join('');

    const relationsOut = DATA.edges.filter(e => e.from === n.id);
    const relationsIn = DATA.edges.filter(e => e.to === n.id);
    const relRows = [];
    relationsOut.forEach(e => relRows.push(relRowHtml(e, 'out')));
    relationsIn.forEach(e => relRows.push(relRowHtml(e, 'in')));

    const members = (n.members || []).map(m =>
      `<tr><td class="m-name">${esc(m[0])}</td><td class="m-desc">${esc(m[1])}</td></tr>`).join('');

    const design = (n.design || []).map(p => `<p>${esc(p)}</p>`).join('');
    const snippet = n.snippet
      ? `<div class="d-snippet"><pre>${esc(n.snippet.code)}</pre></div>` : '';

    const seeAlso = (n.seeAlso || []).map(id =>
      `<span class="chip node-link" data-id="${esc(id)}" title="点击查看">↗ ${esc(id)}</span>`).join('');

    box.innerHTML = `
      <div class="d-head"><span class="d-name" style="color:${color}">${esc(n.name)}</span></div>
      <div class="d-chips">
        ${chipHtml('', KIND_LABEL[n.kind] || n.kind)}
        ${chipHtml('', PKG_SHORT[n.pkg] || n.pkg, `border-color:${color};color:${color}`)}
        ${catChips}
      </div>
      ${n.summary ? `<p class="d-summary">${esc(n.summary)}</p>` : ''}
      ${(stagesOfNode.get(n.id) || []).length ? `<div class="d-chips">活跃于：${stageChips}</div>` : ''}
      <div class="d-section d-design"><h3>设计理念</h3>${design}${snippet}</div>
      ${members ? `<div class="d-section"><h3>关键成员</h3><table class="d-members">${members}</table></div>` : ''}
      ${relRows.length ? `<div class="d-section"><h3>协作关系</h3>${relRows.join('')}</div>` : ''}
      <div class="d-section"><h3>源码位置</h3>
        <div class="d-path"><code>${esc(n.path)}</code><button class="copy-btn" data-copy="${esc(n.path)}">复制</button></div>
      </div>
      ${n.catsApp ? `<div class="d-section"><h3>在 cats-app 中</h3><div class="d-catshint">${esc(n.catsApp)}</div></div>` : ''}
      ${seeAlso ? `<div class="d-section"><h3>参见</h3><div class="see-also-wrap">${seeAlso}</div></div>` : ''}
    `;
    if (container) container.scrollTop = 0;
    else $('#detail').scrollTop = 0;
  }

  function relRowHtml(e, dir) {
    const st = EDGE_STYLES[e.type] || EDGE_STYLES.calls;
    const other = dir === 'out' ? e.to : e.from;
    const arrow = dir === 'out' ? `本类 <b>─${TYPE_LABEL[e.type] || e.type}→</b>` : `<b>←${TYPE_LABEL[e.type] || e.type}─</b> 对方`;
    return `<div class="rel-row">
      <span class="rel-type" style="background:${st.color}">${TYPE_LABEL[e.type] || e.type}</span>
      <span class="node-link" data-id="${esc(other)}">${esc(other)}</span>
      <span class="rel-label">${dir === 'out' ? '（出）' : '（入）'} ${esc(e.label || '')}</span>
    </div>`;
  }

  function renderEdgeDetail(e) {
    const st = EDGE_STYLES[e.type] || EDGE_STYLES.calls;
    const stageChips = e.stages.map(sid => chipHtml('', stageTitle(sid))).join(' ');
    $('#detail-inner').innerHTML = `
      <div class="d-head"><span class="d-name" style="color:${st.color}">${esc(e.from)} → ${esc(e.to)}</span></div>
      <div class="d-chips">${chipHtml('', TYPE_LABEL[e.type] || e.type, `border-color:${st.color};color:${st.color}`)}${stageChips}</div>
      ${e.label ? `<p class="d-summary">${esc(e.label)}</p>` : ''}
      <div class="d-section"><h3>两端</h3>
        <div class="rel-row"><span class="node-link" data-id="${esc(e.from)}">${esc(e.from)}</span>
        <span class="rel-type" style="background:${st.color}">${TYPE_LABEL[e.type] || e.type}</span>
        <span class="node-link" data-id="${esc(e.to)}">${esc(e.to)}</span></div>
      </div>
      <div class="d-section d-design"><h3>说明</h3><p>${esc(e.desc || '点击图中两端的类名可以查看各自的设计理念与完整协作清单。')}</p></div>
    `;
    $('#detail').scrollTop = 0;
  }

  function renderDetailPlaceholder() {
    const stage = currentStage();
    $('#detail-inner').innerHTML = `
      <div class="placeholder">
        <div style="font-size:30px;margin-bottom:12px">⬡</div>
        <b>${esc(stage.title)}</b><br><br>
        点击图中任意<b>类节点</b>查看：设计理念 · 关键成员 · 协作关系 · 源码位置 · 在 cats-app 中的对应。<br><br>
        悬停节点可高亮其一跳邻居；点击连线可查看协作说明。
      </div>`;
  }

  // 面板/modal 内跳转（委托，两处共用）
  const detailClickHandler = ev => {
    const t = ev.target.closest('.node-link, .copy-btn');
    if (!t) return;
    if (t.dataset.copy) { copyText(t.dataset.copy); return; }
    if (t.dataset.idStage !== undefined && t.dataset.idStage !== '') {
      state.stageId = +t.dataset.idStage;
      setMode('map');
      return;
    }
    if (t.dataset.id) openNodeByMode(t.dataset.id);
  };
  $('#detail').addEventListener('click', detailClickHandler);
  $('#journey-modal').addEventListener('click', detailClickHandler);

  /* ---------- 视图：缩放 / 平移 / 复位 ---------- */
  function applyZoom() {
    $('#viewport').setAttribute('transform',
      `translate(${state.zoom.x},${state.zoom.y}) scale(${state.zoom.k})`);
  }
  function contentBBox() {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    state.layoutCache.forEach(b => {
      minX = Math.min(minX, b.cx - b.w / 2); maxX = Math.max(maxX, b.cx + b.w / 2);
      minY = Math.min(minY, b.cy - b.h / 2); maxY = Math.max(maxY, b.cy + b.h / 2);
    });
    if (minX > maxX) return null;
    return { minX, minY, maxX, maxY };
  }
  function fitView(insets) {
    const svg = $('#canvas');
    const box = contentBBox();
    if (!box) return;
    const ins = insets || { top: 48, bottom: 56, left: 48, right: 48 };
    const cw = svg.clientWidth - ins.left - ins.right;
    const ch = svg.clientHeight - ins.top - ins.bottom;
    if (cw <= 0 || ch <= 0) return;
    const bw = box.maxX - box.minX + 90, bh = box.maxY - box.minY + 70;
    const k = clamp(Math.min(cw / bw, ch / bh), 0.3, 1.2);
    state.zoom.k = k;
    state.zoom.x = ins.left + cw / 2 - (box.minX + box.maxX) / 2 * k;
    state.zoom.y = ins.top + ch / 2 - (box.minY + box.maxY) / 2 * k;
    applyZoom();
  }
  function zoomAt(px, py, factor) {
    const z = state.zoom;
    const k2 = clamp(z.k * factor, 0.3, 2.6);
    z.x = px - (px - z.x) * (k2 / z.k);
    z.y = py - (py - z.y) * (k2 / z.k);
    z.k = k2;
    state.userMovedView = true;
    applyZoom();
  }
  function ensureNodeVisible(id) {
    const b = state.layoutCache.get(id);
    if (!b) return;
    const svg = $('#canvas');
    const sx = b.cx * state.zoom.k + state.zoom.x;
    const sy = b.cy * state.zoom.k + state.zoom.y;
    const m = 90;
    let { x, y } = state.zoom;
    if (sx < m || sx > svg.clientWidth - m) x += svg.clientWidth / 2 - sx;
    if (sy < m || sy > svg.clientHeight - m) y += svg.clientHeight / 2 - sy;
    state.zoom.x = x; state.zoom.y = y;
    applyZoom();
  }

  function bindCanvasEvents() {
    const svg = $('#canvas');

    svg.addEventListener('wheel', ev => {
      ev.preventDefault();
      const r = svg.getBoundingClientRect();
      zoomAt(ev.clientX - r.left, ev.clientY - r.top, Math.exp(-ev.deltaY * 0.0012));
    }, { passive: false });

    let panning = null;
    svg.addEventListener('pointerdown', ev => {
      if (ev.target.closest('.node, .edge-hit')) return;
      panning = { x: ev.clientX, y: ev.clientY, zx: state.zoom.x, zy: state.zoom.y, moved: false };
      svg.setPointerCapture(ev.pointerId);
      svg.classList.add('panning');
      state.userMovedView = true;
    });
    svg.addEventListener('pointermove', ev => {
      if (!panning) return;
      const dx = ev.clientX - panning.x, dy = ev.clientY - panning.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) panning.moved = true;
      state.zoom.x = panning.zx + dx;
      state.zoom.y = panning.zy + dy;
      applyZoom();
    });
    const endPan = () => { panning = null; svg.classList.remove('panning'); };
    svg.addEventListener('pointerup', endPan);
    svg.addEventListener('pointercancel', endPan);

    svg.addEventListener('dblclick', ev => {
      if (ev.target.closest('.node, .edge-hit')) return;
      fitView(); state.userMovedView = false;
    });
    svg.addEventListener('click', ev => {
      if (ev.target.closest('.node, .edge-hit')) return;
      if (state.mode === 'journey') return;
      state.selected = null;
      document.querySelectorAll('#canvas .selected, #canvas .selected-edge').forEach(el => el.classList.remove('selected', 'selected-edge'));
      renderDetailPlaceholder();
    });

    $('#zoom-in').addEventListener('click', () => zoomAt($('#canvas').clientWidth / 2, $('#canvas').clientHeight / 2, 1.25));
    $('#zoom-out').addEventListener('click', () => zoomAt($('#canvas').clientWidth / 2, $('#canvas').clientHeight / 2, 0.8));
    $('#zoom-fit').addEventListener('click', () => { fitView(); state.userMovedView = false; });
    $('#label-toggle').addEventListener('click', () => {
      document.body.classList.toggle('hide-labels');
      $('#label-toggle').classList.toggle('on');
    });

    window.addEventListener('resize', () => {
      if (state.userMovedView) return;
      if (state.mode === 'journey') fitJourney();
      else if (state.mode === 'map') fitView();
    });
  }

  /* ---------- 顶栏 tabs / 搜索 ---------- */
  function buildTabs() {
    const nav = $('#stage-tabs');
    DATA.stages.forEach(st => {
      const b = document.createElement('button');
      b.className = 'stage-tab';
      b.dataset.stage = st.id;
      b.textContent = st.short || st.title;
      b.title = `${st.title} —— ${st.question || ''}`;
      b.addEventListener('click', () => {
        if (state.stageId === st.id) return;
        state.stageId = st.id;
        renderStage();
      });
      nav.appendChild(b);
    });
  }

  function closeSearch() {
    $('#search-results').classList.add('hidden');
    $('#search-results').innerHTML = '';
  }

  function bindSearch() {
    const input = $('#search'), box = $('#search-results');
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { closeSearch(); return; }
      const hits = DATA.nodes.filter(n =>
        n.name.toLowerCase().includes(q) ||
        (n.summary || '').toLowerCase().includes(q) ||
        (n.path || '').toLowerCase().includes(q)).slice(0, 14);
      if (!hits.length) { box.innerHTML = '<div class="search-item"><span class="si-meta">无匹配结果</span></div>'; box.classList.remove('hidden'); return; }
      box.innerHTML = '';
      hits.forEach((n, i) => {
        const div = document.createElement('div');
        div.className = 'search-item' + (i === 0 ? ' first' : '');
        div.innerHTML = `<div class="si-name" style="color:${catOf(n).color}">${esc(n.name)}</div>
          <div class="si-meta">${PKG_SHORT[n.pkg] || n.pkg} · ${esc(n.summary || '')}</div>`;
        div.addEventListener('click', () => { input.value = ''; closeSearch(); selectNode(n.id); });
        box.appendChild(div);
      });
      box.classList.remove('hidden');
    });
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') {
        const first = box.querySelector('.search-item');
        if (first) first.click();
      }
      if (ev.key === 'Escape') { input.value = ''; closeSearch(); input.blur(); }
    });
    document.addEventListener('click', ev => {
      if (!ev.target.closest('#search-wrap')) closeSearch();
    });
  }

  /* ---------- 左侧目录树 ---------- */
  function buildTree() {
    const order = ['sample/01-cats-app', '@nestjs/common', '@nestjs/core', '@nestjs/platform-express', '@nestjs/testing', '@nestjs/websockets', '@nestjs/microservices'];
    const root = $('#tree');
    root.innerHTML = '';
    const ul0 = document.createElement('ul');

    order.forEach(pkg => {
      const pkgNodes = DATA.nodes.filter(n => n.pkg === pkg);
      if (!pkgNodes.length) return;
      const li = document.createElement('li');
      const dir = document.createElement('div');
      dir.className = 'tree-dir';
      dir.textContent = pkg;
      dir.addEventListener('click', () => dir.parentElement.classList.toggle('collapsed'));
      li.appendChild(dir);
      // 目录分组
      const groups = new Map();
      pkgNodes.forEach(n => {
        let dirPath = '';
        if (n.path) {
          const m = n.path.match(/packages\/[^/]+\/(.+)\/[^/]+$/);
          dirPath = m ? m[1] : (n.path.includes('/') ? '' : '');
          if (n.kind === 'file' || n.kind === 'package') dirPath = '';
        }
        if (!groups.has(dirPath)) groups.set(dirPath, []);
        groups.get(dirPath).push(n);
      });
      const ul = document.createElement('ul');
      [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([dirPath, list]) => {
        const liG = document.createElement('li');
        if (dirPath) {
          const d = document.createElement('div');
          d.className = 'tree-dir collapsed';
          d.textContent = dirPath + '/';
          d.addEventListener('click', () => d.parentElement.classList.toggle('collapsed'));
          liG.appendChild(d);
          const ulG = document.createElement('ul');
          appendLeaves(ulG, list);
          liG.appendChild(ulG);
        } else {
          appendLeaves(liG, list);
        }
        ul.appendChild(liG);
      });
      li.appendChild(ul);
      ul0.appendChild(li);
    });
    root.appendChild(ul0);
  }

  function appendLeaves(parent, list) {
    list.sort((a, b) => a.name.localeCompare(b.name)).forEach(n => {
      const b = document.createElement('button');
      b.className = 'tree-leaf';
      b.dataset.id = n.id;
      b.innerHTML = `<span class="dot" style="background:${catOf(n).color}"></span>${esc(n.name)}`;
      b.title = n.path || '';
      b.addEventListener('click', () => selectNode(n.id, { fromTree: true }));
      parent.appendChild(b);
    });
  }

  function syncTreeActive(id) {
    const activeId = id || (state.selected && state.selected.kind === 'node' ? state.selected.id : null);
    document.querySelectorAll('.tree-leaf.active').forEach(el => el.classList.remove('active'));
    if (!activeId) return;
    const leaf = document.querySelector(`.tree-leaf[data-id="${CSS.escape(activeId)}"]`);
    if (leaf) {
      leaf.classList.add('active');
      // 展开所有祖先目录
      let li = leaf.closest('li');
      while (li) {
        const parentUl = li.parentElement;
        if (!parentUl || parentUl.id === 'tree') break;
        const parentLi = parentUl.closest('li');
        if (!parentLi) break;
        parentLi.classList.remove('collapsed');
        li = parentLi;
      }
      leaf.scrollIntoView({ block: 'nearest' });
    }
  }

  /* ---------- 播放动画（请求生命周期，地图/旅程共用） ---------- */
  function currentPlaySpec() {
    if (state.mode === 'journey' && state.journey) {
      const j = DATA.journeys.find(x => x.id === state.journey.id);
      return j && j.play ? j.play : null;
    }
    const st = currentStage();
    return st && st.play ? st.play : null;
  }

  function stopAnim() {
    if (state.anim) {
      if (state.anim.cancel) state.anim.cancel();
      state.anim = null;
    }
    document.querySelectorAll('#canvas .lit').forEach(el => el.classList.remove('lit'));
    $('#anim').innerHTML = '';
    if (state.mode === 'journey') {
      const b = $('#jc-play');
      if (b) b.textContent = '▶ 连播本次旅程';
    } else {
      const btn = $('#play-btn');
      const st = currentStage();
      if (st && st.play && btn && !btn.classList.contains('hidden')) {
        btn.textContent = '▶ 播放一次 GET /cats/1';
        btn.classList.remove('playing');
      }
    }
  }

  function playAnim(specOverride) {
    const spec = specOverride && specOverride.seq ? specOverride : currentPlaySpec();
    if (!spec) return;
    if (state.anim) { stopAnim(); return; }
    const seq = spec.seq.map(id => state.layoutCache.get(id)).filter(Boolean);
    if (seq.length < 2) return;

    const g = $('#anim');
    const trail = svgEl('polyline', {
      id: 'anim-trail',
      points: seq.map(b => `${b.cx},${b.cy}`).join(' '),
    }, g);
    void trail;
    const dot = svgEl('circle', { id: 'anim-dot', r: 8, fill: '#f59e0b', stroke: '#fff', 'stroke-width': 2 }, g);

    const isMap = state.mode !== 'journey';
    const btn = isMap ? $('#play-btn') : $('#jc-play');
    if (btn) { btn.textContent = '■ 停止播放'; btn.classList.add('playing'); }

    const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    let seg = 0;
    const anim = { id: null, usedTimeout: false, cancelled: false, cancel: null };
    anim.cancel = () => {
      anim.cancelled = true;
      if (anim.id !== null) {
        if (anim.usedTimeout) clearTimeout(anim.id);
        else cancelAnimationFrame(anim.id);
      }
    };
    state.anim = anim;
    // 页面不可见时 rAF 会被浏览器暂停，降级为定时器驱动
    const schedule = fn => {
      if (document.hidden) { anim.usedTimeout = true; anim.id = setTimeout(() => fn(performance.now()), 16); }
      else { anim.id = requestAnimationFrame(fn); }
    };

    const lightNode = id => {
      const el = document.querySelector(`#canvas .node[data-id="${CSS.escape(id)}"]`);
      if (el) el.classList.add('lit');
    };

    function runSeg() {
      if (state.anim !== anim || anim.cancelled) return;
      if (seg >= seq.length - 1) {
        lightNode(spec.seq[spec.seq.length - 1]);
        toast(spec.note || '播放结束');
        setTimeout(stopAnim, 1200);
        return;
      }
      const a = seq[seg], b = seq[seg + 1];
      const aId = spec.seq[seg], bId = spec.seq[seg + 1];
      lightNode(aId);
      const dist = Math.hypot(b.cx - a.cx, b.cy - a.cy);
      const dur = clamp(dist / 0.32, 320, 950);
      const t0 = performance.now();
      const step = now => {
        if (state.anim !== anim || anim.cancelled) return;
        const t = clamp((now - t0) / dur, 0, 1);
        const e = easeInOut(t);
        const x = a.cx + (b.cx - a.cx) * e;
        const y = a.cy + (b.cy - a.cy) * e;
        dot.setAttribute('cx', x); dot.setAttribute('cy', y);
        if (t < 1) { schedule(step); }
        else { lightNode(bId); seg++; runSeg(); }
      };
      schedule(step);
    }
    runSeg();
  }

  /* ---------- v2 · 模式与跟读旅程 ---------- */
  function setMode(mode) {
    ['home', 'journey', 'map'].forEach(m => document.body.classList.remove('mode-' + m));
    document.body.classList.add('mode-' + mode);
    state.mode = mode;
    stopAnim();
    closeJourneyModal();
    if (mode === 'map') { state.userMovedView = false; renderStage(); }
  }

  function closeJourneyModal() { $('#journey-modal').classList.add('hidden'); }

  function openNodeByMode(id) {
    if (state.mode === 'journey') {
      const n = nodeById.get(id);
      if (!n) return;
      stopAnim();
      renderNodeDetail(n, $('#jm-inner'));
      $('#journey-modal').classList.remove('hidden');
      return;
    }
    selectNode(id);
  }

  function startJourney(id) {
    const j = DATA.journeys.find(x => x.id === id);
    if (!j) return;
    state.journey = { id, step: 0 };
    state.userMovedView = false;
    setMode('journey');
    buildJourneyNav(j);
    renderJourneyStep();
  }

  function journeyStep(delta) {
    if (!state.journey) return;
    const j = DATA.journeys.find(x => x.id === state.journey.id);
    if (delta > 0 && state.journey.step >= j.steps.length - 1) { setMode('home'); return; }
    state.journey.step = clamp(state.journey.step + delta, 0, j.steps.length - 1);
    renderJourneyStep();
  }

  function renderJourneyStep() {
    const j = DATA.journeys.find(x => x.id === state.journey.id);
    const idx = state.journey.step;
    const step = j.steps[idx];

    // 累计揭示：节点与边只增不减 —— 画布 = 已学过的内容
    const revealed = [], edgeKeys = [], freshN = new Set();
    const seenN = new Set(), seenE = new Set();
    j.steps.forEach((s, i) => {
      if (i > idx) return;
      [...(s.lead ? [s.lead] : []), ...(s.cast || [])].forEach(id => {
        if (!seenN.has(id)) {
          seenN.add(id); revealed.push(id);
          if (i === idx) freshN.add(id);
        }
      });
      (s.edges || []).forEach(([f, t]) => {
        const k = f + '>' + t;
        if (!seenE.has(k)) { seenE.add(k); edgeKeys.push([f, t]); }
      });
    });

    const gEdges = $('#edges'), gNodes = $('#nodes');
    gEdges.innerHTML = ''; gNodes.innerHTML = ''; $('#anim').innerHTML = '';
    state.layoutCache.clear();
    $('#canvas').classList.remove('dimmed');

    const pseudo = { pos: j.layout, nodes: revealed };
    const edgeObjs = edgeKeys
      .map(([f, t]) => DATA.edges.find(e => e.from === f && e.to === t))
      .filter(Boolean);
    state.adjacency = buildAdjacency(edgeObjs);

    const routes = buildRoutes(pseudo, edgeObjs);
    edgeObjs.forEach((e, i) => drawRoutedEdge(e, routes[i], gEdges));
    revealed.forEach(id => {
      const el = drawNode(nodeById.get(id), gNodes, pseudo);
      if (freshN.has(id)) el.classList.add('fresh');
      if (id === step.lead) el.classList.add('journey-lead');
    });

    renderJourneyCard(j, step, idx);
    updateJourneyNav(idx);
    $('#j-title').textContent = j.title;
    $('#j-progress').textContent = `第 ${idx + 1} / ${j.steps.length} 步 · ${step.nav || step.title}`;
    if (!state.userMovedView) fitJourney();
  }

  function renderJourneyCard(j, step, idx) {
    const card = $('#journey-card');
    card.querySelector('.jc-step').textContent = `第 ${idx + 1} / ${j.steps.length} 步`;
    card.querySelector('.jc-title').textContent = step.title;
    card.querySelector('.jc-text').innerHTML = (step.text || []).map(p => `<p>${esc(p)}</p>`).join('');
    const sn = card.querySelector('.jc-snippet');
    if (step.snippet && step.snippet.code) {
      sn.classList.remove('hidden');
      sn.querySelector('.jc-snippet-path').textContent = step.snippet.path || '';
      sn.querySelector('pre').textContent = step.snippet.code;
    } else sn.classList.add('hidden');
    const cats = card.querySelector('.jc-cats');
    if (step.catsApp) { cats.classList.remove('hidden'); cats.textContent = '🐱 ' + step.catsApp; }
    else cats.classList.add('hidden');
    card.querySelector('.jc-path').textContent = step.path ? '📄 ' + step.path : '';
    $('#jc-prev').disabled = idx === 0;
    $('#jc-next').textContent = idx === j.steps.length - 1 ? '完成 ✔ 回首页' : '下一步 →';
    const playBtn = $('#jc-play');
    if (step.play === true && j.play) playBtn.classList.remove('hidden');
    else playBtn.classList.add('hidden');
  }

  function buildJourneyNav(j) {
    const nav = $('#journey-nav');
    nav.innerHTML = '';
    j.steps.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'jnav-item';
      b.innerHTML = `<span class="no">${String(i + 1).padStart(2, '0')}</span><span>${esc(s.nav || s.title)}</span>`;
      b.addEventListener('click', () => { state.journey.step = i; renderJourneyStep(); });
      nav.appendChild(b);
    });
  }

  function updateJourneyNav(idx) {
    document.querySelectorAll('.jnav-item').forEach((b, i) => {
      b.classList.toggle('active', i === idx);
      b.classList.toggle('done', i < idx);
    });
    const active = document.querySelector('.jnav-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function fitJourney() {
    const card = $('#journey-card');
    const cardH = card ? card.offsetHeight : 170;
    fitView({ top: 58, left: 210, right: 26, bottom: cardH + 20 });
  }

  function bindHome() {
    document.querySelectorAll('.home-card').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.journey) startJourney(btn.dataset.journey);
        else if (btn.dataset.map !== undefined) setMode('map');
      });
    });
  }

  function bindJourneyChrome() {
    $('#j-home-btn').addEventListener('click', () => setMode('home'));
    $('#j-map-btn').addEventListener('click', () => setMode('map'));
    $('#jc-prev').addEventListener('click', () => journeyStep(-1));
    $('#jc-next').addEventListener('click', () => journeyStep(1));
    $('#jc-play').addEventListener('click', () => {
      const j = DATA.journeys.find(x => x.id === state.journey.id);
      if (j && j.play) playAnim(j.play);
    });
    $('#journey-card .jc-path').addEventListener('click', ev => {
      const t = ev.target.textContent.replace('📄 ', '');
      if (t) copyText(t);
    });
    $('#jm-close').addEventListener('click', closeJourneyModal);
    $('#journey-modal').addEventListener('click', ev => {
      if (ev.target.id === 'journey-modal') closeJourneyModal();
    });
  }

  /* ---------- 主题 ---------- */
  function isDark() { return document.body.classList.contains('dark'); }
  function initTheme() {
    const saved = localStorage.getItem('nest-arch-theme');
    if (saved === 'dark' || (!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.body.classList.add('dark');
    }
    $('#theme-toggle').addEventListener('click', () => {
      document.body.classList.toggle('dark');
      localStorage.setItem('nest-arch-theme', isDark() ? 'dark' : 'light');
      if (state.mode === 'journey') renderJourneyStep();
      else if (state.mode === 'map') renderStage(true);
    });
  }

  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  /* ---------- 键盘 / 底部导航 ---------- */
  function bindKeyboard() {
    document.addEventListener('keydown', ev => {
      const inInput = ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA';
      if (ev.key === '/' && !inInput && state.mode === 'map') { ev.preventDefault(); $('#search').focus(); return; }
      if (ev.key === 'Escape') {
        if (state.mode === 'journey') {
          if (!$('#journey-modal').classList.contains('hidden')) closeJourneyModal();
          else setMode('home');
          return;
        }
        state.selected = null;
        document.querySelectorAll('#canvas .selected, #canvas .selected-edge').forEach(el => el.classList.remove('selected', 'selected-edge'));
        renderDetailPlaceholder();
        closeSearch();
        return;
      }
      if (inInput) return;
      if (state.mode === 'journey') {
        if (ev.key === 'ArrowRight' || ev.key === ' ') { ev.preventDefault(); journeyStep(1); }
        if (ev.key === 'ArrowLeft') journeyStep(-1);
        return;
      }
      if (state.mode !== 'map') return;
      if (ev.key === 'ArrowRight') $('#next-stage').click();
      if (ev.key === 'ArrowLeft') $('#prev-stage').click();
    });
    $('#prev-stage').addEventListener('click', () => {
      const idx = DATA.stages.findIndex(s => s.id === state.stageId);
      if (idx > 0) { state.stageId = DATA.stages[idx - 1].id; renderStage(); }
    });
    $('#next-stage').addEventListener('click', () => {
      const idx = DATA.stages.findIndex(s => s.id === state.stageId);
      if (idx < DATA.stages.length - 1) { state.stageId = DATA.stages[idx + 1].id; renderStage(); }
    });
    $('#play-btn').addEventListener('click', () => playAnim());
  }

  /* ---------- 启动 ---------- */
  function init() {
    buildTabs();
    buildTree();
    bindCanvasEvents();
    bindSearch();
    bindKeyboard();
    bindHome();
    bindJourneyChrome();
    initTheme();
    buildDefs();
    // 首页模式：地图渲染推迟到进入 map 模式时（避免隐藏状态下量宽为 0）
    if (state.mode === 'map') renderStage();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
