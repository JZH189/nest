/* 数据校验：node check.js —— 校验 data.js 的引用完整性 */
global.window = {};
require('./data.js');
const d = window.__NEST_ARCH_DATA__;

const problems = [];
const warn = [];

// 1. 节点 id 唯一
const ids = new Set();
d.nodes.forEach(n => {
  if (ids.has(n.id)) problems.push(`节点 id 重复: ${n.id}`);
  ids.add(n.id);
});

// 2. 边引用存在 + 类型合法 + stage 合法 + 两端在该 stage 节点列表内
const TYPES = ['creates','calls','extends','implements','registers','scans','resolves','uses','provides','annotates','reads','throws-to','depends','feeds'];
const stageById = new Map(d.stages.map(s => [s.id, s]));
d.edges.forEach((e, i) => {
  if (!ids.has(e.from)) problems.push(`边#${i} from 不存在: ${e.from}`);
  if (!ids.has(e.to)) problems.push(`边#${i} to 不存在: ${e.to}`);
  if (!TYPES.includes(e.type)) problems.push(`边#${i} 未知类型: ${e.type}`);
  (e.stages || []).forEach(sid => {
    const st = stageById.get(sid);
    if (!st) { problems.push(`边#${i} 未知 stage: ${sid}`); return; }
    if (!st.nodes.includes(e.from)) warn.push(`Stage${sid} 边(${e.from}→${e.to}) 的 from 不在该 stage 节点列表`);
    if (!st.nodes.includes(e.to)) warn.push(`Stage${sid} 边(${e.from}→${e.to}) 的 to 不在该 stage 节点列表`);
  });
});

// 3. stage 节点存在 + pos 齐全
d.stages.forEach(st => {
  st.nodes.forEach(id => {
    if (!ids.has(id)) { problems.push(`Stage${st.id} 引用不存在节点: ${id}`); return; }
    if (!st.pos || !st.pos[id]) warn.push(`Stage${st.id} 节点 ${id} 缺 pos`);
  });
  Object.keys(st.pos || {}).forEach(id => {
    if (!st.nodes.includes(id)) warn.push(`Stage${st.id} pos 含未列入 nodes 的 ${id}`);
  });
  if (st.play) st.play.seq.forEach(id => {
    if (!st.nodes.includes(id)) problems.push(`Stage${st.id} play 序列含非成员 ${id}`);
  });
});

// 4. 每个节点至少属于一个 stage
const staged = new Set();
d.stages.forEach(st => st.nodes.forEach(id => staged.add(id)));
ids.forEach(id => { if (!staged.has(id)) problems.push(`节点 ${id} 不属于任何 stage（左栏点击将无法定位）`); });

// 5. 内容完整性
d.nodes.forEach(n => {
  if (!n.summary) warn.push(`节点 ${n.id} 缺 summary`);
  if (!n.design || !n.design.length) warn.push(`节点 ${n.id} 缺 design`);
  if (!n.path) warn.push(`节点 ${n.id} 缺 path`);
});

// 6. seeAlso 引用
d.nodes.forEach(n => (n.seeAlso || []).forEach(id => {
  if (!ids.has(id)) warn.push(`节点 ${n.id} seeAlso 引用不存在: ${id}`);
}));

// 7. 旅程（v2）：lead/cast/edges 引用、layout 覆盖、play 序列
const edgeKeySet = new Set(d.edges.map(e => e.from + '>' + e.to));
(d.journeys || []).forEach(j => {
  const journeyNodes = new Set();
  j.steps.forEach(s => {
    const stepNodes = [...(s.lead ? [s.lead] : []), ...(s.cast || [])];
    stepNodes.forEach(id => {
      if (!ids.has(id)) problems.push(`旅程 ${j.id} 步骤引用不存在节点: ${id}`);
      else journeyNodes.add(id);
    });
    (s.edges || []).forEach(([f, t]) => {
      if (!edgeKeySet.has(f + '>' + t)) problems.push(`旅程 ${j.id} 边 (${f}→${t}) 不存在于 edges`);
    });
    if (!s.title) warn.push(`旅程 ${j.id} 步骤 ${s.no} 缺 title`);
  });
  journeyNodes.forEach(id => {
    if (!j.layout || !j.layout[id]) warn.push(`旅程 ${j.id} layout 缺 ${id}`);
  });
  if (j.layout) Object.keys(j.layout).forEach(id => {
    if (!ids.has(id)) problems.push(`旅程 ${j.id} layout 引用不存在节点: ${id}`);
  });
  if (j.play) j.play.seq.forEach(id => {
    if (!journeyNodes.has(id)) problems.push(`旅程 ${j.id} play 序列含未登场节点: ${id}`);
  });
  console.log(`旅程 ${j.id}: ${j.steps.length} 步, 登场节点 ${journeyNodes.size} 个`);
});

console.log(`节点: ${d.nodes.length} | 边: ${d.edges.length} | Stage: ${d.stages.length}`);
console.log(`每 Stage 节点数: ${d.stages.map(s => `${s.id}:${s.nodes.length}`).join('  ')}`);
if (problems.length) { console.log(`\n✗ 错误 ${problems.length} 项:`); problems.forEach(p => console.log('  - ' + p)); }
if (warn.length) { console.log(`\n△ 警告 ${warn.length} 项:`); warn.forEach(p => console.log('  - ' + p)); }
if (!problems.length && !warn.length) console.log('\n✓ 数据校验全部通过');
process.exit(problems.length ? 1 : 0);
