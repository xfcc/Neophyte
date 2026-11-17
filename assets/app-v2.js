/* Allocation and holdings views over saved facts. */
(async function () {
  'use strict';
  const ui = window.Neophyte2, e = ui.escape, p = ui.percent;
  const labels = {equity:'股票',bond:'债券',gold:'黄金',cash:'现金'};
  const state = { snapshots:[], selected:null, layer:'global', daily:null, account:null, index:null, watch:[] };
  const $ = s => document.querySelector(s);
  const numberClass = n => Number.isFinite(n) ? n > 0 ? 'v2-up' : n < 0 ? 'v2-down' : '' : '';
  const missing = text => `<p class="v2-empty">${e(text)}</p>`;
  async function read(url) {
    const r=await fetch(url,{cache:'no-store'}); if(!r.ok)throw new Error('数据文件不可用');
    const text=await r.text(), payload=JSON.parse(text);
    if(payload.calculation_version==='portfolio-weights-v2'&&window.crypto?.subtle){
      const bytes=await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
      payload.__ratioDigest=[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
    }
    return payload;
  }
  const currentTab = () => ['holdings','profit','volatility'].includes(location.hash.slice(1)) ? 'holdings' : 'allocation';
  function activate() {
    const tab = currentTab();
    document.body?.setAttribute('data-view',tab);
    document.querySelectorAll('[data-v2-tab]').forEach(a=>{if(a.dataset.v2Tab===tab)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    document.querySelectorAll('[data-v2-panel]').forEach(x=>x.hidden=x.dataset.v2Panel!==tab);
    $('#v2-title').textContent={allocation:'资产配置',holdings:'持仓实盘'}[tab];
    if(state.snapshots.length)renderCoverage();
    $('#v2-subtitle').textContent='';
  }
  function renderCoverage() {
    const allocationView=currentTab()==='allocation';
    const s=allocationView?(state.snapshots.at(-1)??state.selected):state.selected, c=s?.coverage??{};
    const updatedThrough=s?.valuation_input_date;
    const holdingsConfirmed=(c.direct_confirmed??0)+(c.advisory_confirmed??0);
    const holdingsTotal=(c.direct_total??0)+(c.advisory_total??0);
    const referenceSymbols=[...new Set(Object.values(state.index?.assets??{}).flatMap(asset=>Object.values(asset.resonance_baselines??{}).map(r=>r.reference_symbol)).filter(Boolean))];
    const referenceConfirmed=referenceSymbols.filter(symbol=>Number.isFinite(state.index?.references?.[symbol]?.observations?.[updatedThrough]?.daily_return)).length;
    $('#v2-status').innerHTML=updatedThrough
      ? `<span class="v2-status-item">数据更新至 <time datetime="${e(updatedThrough)}">${e(updatedThrough)}</time></span><span class="v2-status-item">持仓采集 <strong>${holdingsConfirmed}/${holdingsTotal}</strong></span><span class="v2-status-item">共振采集 <strong>${referenceConfirmed}/${referenceSymbols.length}</strong></span>`
      : '尚无可用的仓位数据';
    $('#v2-coverage').innerHTML=s?[
      ['行情采集',`直接 ${c.direct_confirmed??0}/${c.direct_total??0} · 投顾 ${c.advisory_confirmed??0}/${c.advisory_total??0}`],['估值覆盖',`${c.valued_positions??0}/${c.positions_total??0}`],['细分分类',c.classification==='complete'?'完整':'待完善'],
      ['账户对账',c.reconciliation==='confirmed'?'已确认':'待核对'],['现金记录',c.cash_date??'未录入'],
      ['配置版本',(s.configuration_versions?.allocation??'无').slice(0,8)]
    ].map(([k,v])=>`<div><span>${e(k)}</span><strong>${e(v)}</strong></div>`).join(''):'';
  }
  function renderAllocation() {
    if(window.NeophyteAllocation){
      if(!state.allocationDashboard)state.allocationDashboard=window.NeophyteAllocation.mount($('#v2-allocation-dashboard'),state.allocationSnapshots??state.snapshots,{today:state.daily?.reference_date??state.snapshots.at(-1)?.reference_date});
      else state.allocationDashboard.render();
    }
  }
  function profitValue(row) {
    if(Number.isFinite(row.holding_return))return `<span class="${numberClass(row.holding_return)}">${p(row.holding_return,true)}</span>`;
    const reason=['missing','estimated'].includes(row.status)
      ? `目标日数据未取得${row.market_date?'；最新可用行情 '+row.market_date:''}`
      : '成本缺失或不可比，暂不计算持仓盈亏';
    return `<details class="v2-cell-detail"><summary aria-label="查看持仓盈亏缺失原因">—</summary><span>${e(reason)}</span></details>`;
  }
  function configuredGroups(snapshot) {
    if (!snapshot?.positions?.length) return [];
    const positions=new Map(snapshot.positions.map(row=>[row.id,row]));
    const groups=Object.values(snapshot.layers).filter(layer=>layer.id?.startsWith('profit:')).map(layer=>{
      const products=ui.sortRows(layer.children.map(child=>({...positions.get(child.id),weight:child.actual_weight})),'weight');
      const totalWeight=products.every(row=>Number.isFinite(row.global_weight))
        ?products.reduce((sum,row)=>sum+row.global_weight,0):null;
      return {layer,products,totalWeight};
    });
    return ['equity','bond','gold','cash'].map(assetClass=>{
      const sections=ui.sortSubgroups(groups.filter(group=>group.layer.id.startsWith(`profit:${assetClass}:`)),
        assetClass, group=>group.layer.id);
      return {assetClass,label:labels[assetClass],sections};
    });
  }
  function renderClassTables(groups,prefix,renderTable) {
    return groups.map(({assetClass,label,sections})=>{
      const heading=`${prefix}-${assetClass}`;
      const tabbed=sections.length && ['equity','bond'].includes(assetClass);
      const selected=tabbed?sections[0]:null;
      const content=tabbed
        ? `<div class="allocation-range-tabs holding-tabs" role="tablist" aria-label="${e(label)}分类">${sections.map((section,i)=>
            `<button type="button" role="tab" id="${heading}-tab-${i}" aria-controls="${heading}-panel-${i}" aria-selected="${section===selected}" tabindex="${section===selected?0:-1}">${e(section.layer.name)}</button>`
          ).join('')}</div>${sections.map((section,i)=>
            `<div role="tabpanel" id="${heading}-panel-${i}" aria-labelledby="${heading}-tab-${i}"${section===selected?'':' hidden'}>${renderTable([section],`${heading}-tab-${i}`,assetClass)}</div>`
          ).join('')}`
        : renderTable(sections,heading,assetClass);
      return `<section class="holding-class" aria-labelledby="${heading}"><h3 id="${heading}">${e(label)}</h3>${content}</section>`;
    }).join('');
  }
  function selectHoldingTab(tab) {
    tab.parentElement.querySelectorAll('[role="tab"]').forEach(button=>{
      const selected=button===tab;
      button.setAttribute('aria-selected',String(selected));
      button.tabIndex=selected?0:-1;
      document.getElementById(button.getAttribute('aria-controls')).hidden=!selected;
    });
  }
  const holdingsTarget=$('#v2-holdings');
  holdingsTarget.addEventListener('click',event=>{
    const tab=event.target.closest('.holding-tabs [role="tab"]');
    if(tab)selectHoldingTab(tab);
  });
  holdingsTarget.addEventListener('keydown',event=>{
    const tab=event.target.closest('.holding-tabs [role="tab"]');
    if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const tabs=[...tab.parentElement.querySelectorAll('[role="tab"]')];
    const offset=event.key==='ArrowLeft'?-1:1;
    const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(tabs.indexOf(tab)+offset+tabs.length)%tabs.length;
    event.preventDefault();
    selectHoldingTab(tabs[index]);
    tabs[index].focus();
  });
  function renderHoldings() {
    const rows=ui.marketRows(state.daily,state.account,state.watch,state.selected?.positions??[]);
    const grouped=ui.groupFiveDayRows(rows);
    const levels={extreme:'极端波动',attention:'异常波动',normal:'正常波动',unavailable:'数据不足',record_only:'仅记录'};
    const byProduct=new Map(Object.entries(grouped).flatMap(([level,list])=>
      list.map(row=>[`${row.market}:${row.symbol}`,{
        level:levels[level], cumulative:level==='unavailable'?null:row.five_day_return,
        rank:row.five_day_volatility?.percentile
      }])));
    if(!window.NeophyteLocalTemperature){
      holdingsTarget.innerHTML=missing('持仓实盘组件加载失败，请刷新页面。');return;
    }
    window.NeophyteLocalTemperature.render({
      target:holdingsTarget, snapshot:state.selected, groups:configuredGroups(state.selected),
      renderClassTables, profitValue,
      volatility:position=>byProduct.get(`${position.market}:${position.symbol}`)??{level:levels.unavailable}
    });
    window.dispatchEvent(new CustomEvent('neophyte:snapshot',{detail:state.selected}));
  }
  async function chooseDate(date) {
    const request=state.selection=(state.selection??0)+1;
    const selected=state.snapshots.find(s=>s.reference_date===date)??null;
    let daily=state.daily, account=state.account;
    if(selected?.valuation_input_date){
      const inputDate=selected.valuation_input_date;
      if(daily?.reference_date!==inputDate){
        const dailyPath=state.manifest.snapshots?.find(x=>x.endsWith('/'+inputDate+'.json'));
        const accountPath=state.manifest.account_snapshots?.find(x=>x.endsWith('/'+inputDate+'.json'));
        [daily,account]=await Promise.all([dailyPath?read(dataRoot+dailyPath):null,accountPath?read(dataRoot+accountPath):null]).catch(error=>{if(request===state.selection)throw error;return [null,null];});
      }
    }
    if(request!==state.selection)return;
    state.selected=selected;state.daily=daily;state.account=account;
    $('#v2-date').value=date;
    renderCoverage();renderAllocation();renderHoldings();
  }
  window.addEventListener('hashchange',activate);activate();
  $('#v2-date').addEventListener('change',ev=>chooseDate(ev.target.value).catch(showError));
  function showError(error){$('#v2-status').textContent='数据读取失败：'+error.message;}
  if(location.protocol==='file:'){showError(new Error('请运行 python3 serve.py 后打开本地查看页'));return;}
  try{
    const [manifest,index,watch]=await Promise.all([read(paths.manifest),read(paths.volatilityIndex),read(paths.watchlist)]);
    state.manifest=manifest;state.index=index;state.watch=watch.assets;
    state.snapshots=await Promise.all((manifest.portfolio_v2_snapshots??[]).map(x=>read(dataRoot+x)));
    const history=await Promise.all((manifest.allocation_history_snapshots??[]).map(x=>read(dataRoot+x)));
    state.allocationSnapshots=[...new Map([...history,...state.snapshots].map(s=>[s.reference_date,s])).values()];
    const dates=state.snapshots.map(s=>s.reference_date).sort();
    $('#v2-date').innerHTML=dates.length?dates.map(d=>`<option value="${e(d)}">${e(d)}</option>`).join(''):'<option value="">无2.0快照</option>';
    const latest=manifest.latest_snapshot??manifest.snapshots?.at(-1);
    const latestAccount=manifest.latest_account_snapshot??manifest.account_snapshots?.at(-1);
    state.daily=latest?await read(dataRoot+latest):null;state.account=latestAccount?await read(dataRoot+latestAccount):null;
    await chooseDate(dates.at(-1)??'');
  }catch(error){showError(error);}
})();
