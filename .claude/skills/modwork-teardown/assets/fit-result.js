// Present the per-item verdict recorded by Mod Work. Sample counts explain it;
// neither a positive vertex distance nor missing evidence determines a verdict.
const titles={ok:'通过',risky:'有风险',blocked:'严重风险'};
const reasons={surface:'面边穿入身体',geometry:'网格退化',loose:'护具悬空',stretch:'局部过度拉伸',envelope:'超出球裤余量',params:'体型参数叠加',coverage:'检查覆盖不完整'};
export const sources={report:'贴合报告',legacy:'旧版结果的视口估测',morph:'原始几何的视口估测'};
const number=n=>n.toLocaleString('zh-CN');
const measured=(hits,total)=>Number.isInteger(hits)&&Number.isInteger(total)&&total>0&&hits>=0&&hits<=total;
export const hasFittedView=g=>g.fitSource!=='morph'||g.id==='shorts';

export function fitResult(fit){
  const level=Object.hasOwn(titles,fit?.level)?fit.level:'unknown';
  const title=titles[level]||'缺少判定';
  const inside=fit?.surface?.inside,total=fit?.surface?.checked;
  const surface=measured(inside,total),vertices=measured(fit?.embedded,fit?.checked);
  const cause=Object.hasOwn(reasons,fit?.reason)?reasons[fit.reason]:null;
  const reason=cause || (level==='ok'&&surface&&vertices&&inside===0&&fit.embedded===0?'本次采样未检出穿入'
    :level==='unknown'?'缺少明确的单件判定':!fit.reason&&fit.embedded>0?'受检顶点存在嵌入':'快照中的静态判定');
  return {level,title,reason,
    surface:surface?(inside===0?number(total)+' 个面边采样均未检出穿入。':number(total)+' 个面边采样中有 '+number(inside)+' 个穿入。'):'面边穿入采样未记录。',
    vertices:vertices?number(fit.embedded)+' / '+number(fit.checked):'未记录',
    distance:Number.isFinite(fit?.minSignedMm)?(fit.minSignedMm<0?'−':'+')+Math.abs(fit.minSignedMm).toFixed(3)+' mm':'未记录'};
}

export const gearName=id=>({headband:'标准发带',headband_fury:'Fury 发带',headband_tie:'绑带款发带'}[id]||id);

export const CUT_START=10.8;
export const isHeadband=(data,gear)=>data.part==='head'&&gear.id.startsWith('headband');
