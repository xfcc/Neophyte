/* Shared, pure presentation rules. No private configuration or market fetches. */
(function (root) {
  const finite = Number.isFinite;
  function percent(value, signed = false) { return finite(value) ? `${signed && value > 0 ? '+' : ''}${(value * 100).toFixed(2)}%` : '—'; }
  function delta(actual, target) {
    if (!finite(target)) return '无目标';
    if (!finite(actual)) return '—';
    const pp = (actual - target) * 100;
    return Math.abs(pp) < 1e-8 ? '与目标一致' : `${pp > 0 ? '高于' : '低于'}目标${Math.abs(pp).toFixed(2)}个百分点`;
  }
  function sortRows(rows, field, ascending = false) {
    return [...rows].sort((a, b) => finite(a[field]) !== finite(b[field]) ? (finite(a[field]) ? -1 : 1) : finite(a[field]) ? (a[field] - b[field]) * (ascending ? 1 : -1) : 0);
  }
  function filterRows(rows, assetClass, internal = 'all') {
    const [method,subgroup] = internal.split('/');
    return rows.filter(r=>(assetClass==='all'||r.asset_class===assetClass)&&(internal==='all'||r.method===method&&(!subgroup||r.subgroup===subgroup)));
  }
  function marketRows(daily, account, watch, positions) {
    const current = new Map(watch.map(x=>[x.id,x]));
    const history = new Map(positions.map(x=>[x.asset_id,x]));
    return [...(daily?.observations??[]),...(account?.accounts??[]).flatMap(a=>a.components??[])].map(row=>{
      const old=history.get(row.asset_id), fallback=current.get(row.asset_id);
      return {...fallback,...row,name:old?.name??row.name??fallback?.name,market:old?.market??fallback?.market??'CN_FUND',asset_type:old?.asset_type??fallback?.asset_type??'mutual_fund'};
    });
  }
  function groupFiveDayRows(rows) {
    const groups = { extreme: [], attention: [], normal: [], unavailable: [], record_only: [] };
    const seen = new Set();
    rows.forEach(row => {
      const key = `${row.market ?? ''}:${row.symbol}`;
      if (seen.has(key)) return;
      seen.add(key);
      const saved = row.five_day_volatility;
      const level = saved?.level === 'record_only' ? 'record_only' : saved?.basis === 'historical_percentile' && finite(row.five_day_return) && ['extreme','attention','normal'].includes(saved.level) ? saved.level : 'unavailable';
      groups[level].push(row);
    });
    return groups;
  }
  function volatilityBrief(row, level, facts, rows) {
    if(level==='normal')return '正常波动';
    if(level==='record_only')return '仅记录';
    if(level==='unavailable')return '数据或基准不足';
    const daily=row.daily_return, cumulative=row.five_day_return;
    const ending=!finite(daily)?'末日数据缺失':daily===0?'末日持平':!finite(cumulative)||cumulative===0?`末日${daily>0?'上涨':'下跌'}`:Math.sign(daily)===Math.sign(cumulative)?`末日${daily>0?'续涨':'续跌'}`:`末日${daily>0?'反弹':'回落'}`;
    const details=[];
    if(row.asset_type==='stock'){
      details.push(ending);
      const peers=rows.filter(x=>x.asset_type==='stock'&&x.market===row.market&&x.market_date===row.market_date&&finite(x.five_day_return)).map(x=>x.five_day_return).sort((a,b)=>a-b);
      if(peers.length>=2&&finite(cumulative)){
        const mid=Math.floor(peers.length/2), median=peers.length%2?peers[mid]:(peers[mid-1]+peers[mid])/2;
        const gap=(cumulative-median)*100;
        details.push(Math.abs(gap)<.005?'与同市场持仓中位数相当':`${gap>0?'高于':'低于'}同市场持仓中位数${Math.abs(gap).toFixed(2)}个百分点`);
      }else details.push('同市场样本不足');
    }else{
      const largest=facts?.window_start_date?facts.largest_daily_return:null;
      if(finite(largest)&&largest!==0&&finite(daily)&&Math.abs(largest-daily)<1e-10){
        details.push(`末日${daily>0?'涨幅':'跌幅'}最大`);
      }else{
        if(finite(largest))details.push(`最大单日 ${percent(largest,true)}`);
        details.push(ending);
      }
    }
    return [...details,'原因未确认'].join('；');
  }
  function escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  const api = { percent, delta, sortRows, filterRows, marketRows, groupFiveDayRows, volatilityBrief, escape };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Neophyte2 = api;
})(typeof window !== 'undefined' ? window : globalThis);
