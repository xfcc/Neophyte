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
  function escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  const api = { percent, delta, sortRows, filterRows, marketRows, groupFiveDayRows, escape };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Neophyte2 = api;
})(typeof window !== 'undefined' ? window : globalThis);
