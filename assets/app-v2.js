/* Three views over saved facts. The legacy script supplies locked resonance helpers. */
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
  function activate() {
    const tab = ['allocation','profit','volatility'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'allocation';
    document.body?.setAttribute('data-view',tab);
    document.querySelectorAll('[data-v2-tab]').forEach(a=>{if(a.dataset.v2Tab===tab)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    document.querySelectorAll('[data-v2-panel]').forEach(x=>x.hidden=x.dataset.v2Panel!==tab);
    $('#v2-title').textContent={allocation:'资产配置',profit:'配置浮盈',volatility:'温度波动'}[tab];
    if(state.snapshots.length)renderCoverage();
    $('#v2-subtitle').textContent={allocation:'',profit:'当前持仓相对成本的变化',volatility:window.NeophyteLocalTemperature ? '' : '近5个有效交易日 · 产品自身历史分位'}[tab];
  }
  function renderCoverage() {
    const allocationView=!['profit','volatility'].includes(location.hash.slice(1));
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
  function profitValue(row,field) {
    if(Number.isFinite(row[field]))return p(row[field],true);
    const reason=['missing','estimated'].includes(row.status)
      ? `目标日数据未取得${row.market_date?'；最新可用行情 '+row.market_date:''}`
      : field==='holding_return'?'成本缺失或不可比，暂不计算持仓盈亏':'缺少可比的相邻交易日行情';
    return `<details class="v2-cell-detail"><summary aria-label="查看${field==='holding_return'?'持仓盈亏':'日涨跌幅'}缺失原因">—</summary><span>${e(reason)}</span></details>`;
  }
  function profitTable(sections, labelledBy) {
    const bodies=sections.map(({layer,products})=>{
      const groups=[
        ['主动持仓',products.filter(row=>row.id.startsWith('direct:'))],
        ['投顾持仓',products.filter(row=>!row.id.startsWith('direct:'))]
      ];
      return groups.filter(([,rows])=>rows.length).map(([name,rows])=>`<tbody>
        <tr class="profit-ownership"><th scope="rowgroup" colspan="4">${e(sections.length>1 ? layer.name+' · '+name : name)}</th></tr>
        ${rows.map(row=>`<tr><td>${e(row.name)}<small>${e(row.symbol)}</small></td><td>${p(row.global_weight)}</td><td>${p(row.weight)}</td><td class="${numberClass(row.holding_return)}">${profitValue(row,'holding_return')}</td></tr>`).join('')}
      </tbody>`).join('');
    }).join('');
    return `<div class="v2-table-wrap"><table aria-labelledby="${labelledBy}">
      <thead><tr><th scope="col">产品名称</th><th scope="col" title="占全账户投资资产的比例">总持仓占比</th><th scope="col" title="占此细分类全部产品市值的比例">分类持仓占比</th><th scope="col">持仓盈亏</th></tr></thead>
      ${bodies||'<tbody><tr><td colspan="4">暂无持仓</td></tr></tbody>'}
    </table></div>`;
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
      const sections=ui.sortRows(groups.filter(group=>group.layer.id.startsWith(`profit:${assetClass}:`))
        .map(group=>({...group,name:group.layer.name})),'totalWeight');
      return {assetClass,label:labels[assetClass],sections};
    });
  }
  function renderProfit() {
    const snapshot=state.selected;
    if(!snapshot?.positions?.length){$('#v2-profit').innerHTML=missing('尚无该日期可用的2.0持仓估值。');return;}
    $('#v2-profit').innerHTML=configuredGroups(snapshot).map(({assetClass,label,sections})=>{
      const heading=`profit-${assetClass}`;
      const tabbed=sections.length && ['equity','bond'].includes(assetClass);
      const summary=({layer,totalWeight})=>{
        const returnLabel=Number.isFinite(layer.holding_return)&&(layer.status==='partial'||layer.holding_return_coverage<1-1e-8)
          ?'可比部分盈亏':'持仓盈亏';
        return `<div class="profit-summary"><span>总持仓占比 <b>${p(totalWeight)}</b></span><span>${returnLabel} <b class="${numberClass(layer.holding_return)}">${p(layer.holding_return,true)}</b></span></div>`;
      };
      const content=tabbed
        ? `<div class="allocation-range-tabs profit-tabs" role="tablist" aria-label="${e(label)}分类">${sections.map(({layer},i)=>
            `<button type="button" role="tab" id="${heading}-tab-${i}" aria-controls="${heading}-panel-${i}" aria-selected="${i===0}" tabindex="${i===0?0:-1}">${e(layer.name)}</button>`
          ).join('')}</div>${sections.map((section,i)=>
            `<div role="tabpanel" id="${heading}-panel-${i}" aria-labelledby="${heading}-tab-${i}"${i===0?'':' hidden'}>${summary(section)}${profitTable([section],`${heading}-tab-${i}`)}</div>`
          ).join('')}`
        : (sections.length===1 ? summary(sections[0]) : '')+profitTable(sections,heading);
      return `<section class="profit-class" aria-labelledby="${heading}"><h3 id="${heading}">${e(label)}</h3>${content}</section>`;
    }).join('');
    window.dispatchEvent(new CustomEvent('neophyte:snapshot',{detail:snapshot}));
  }
  function selectProfitTab(tab) {
    tab.parentElement.querySelectorAll('[role="tab"]').forEach(button=>{
      const selected=button===tab;
      button.setAttribute('aria-selected',String(selected));
      button.tabIndex=selected?0:-1;
      document.getElementById(button.getAttribute('aria-controls')).hidden=!selected;
    });
  }
  $('#v2-profit').addEventListener('click',event=>{
    const tab=event.target.closest('.profit-tabs [role="tab"]');
    if(tab)selectProfitTab(tab);
  });
  $('#v2-profit').addEventListener('keydown',event=>{
    const tab=event.target.closest('.profit-tabs [role="tab"]');
    if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const tabs=[...tab.parentElement.querySelectorAll('[role="tab"]')];
    const offset=event.key==='ArrowLeft'?-1:1;
    const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(tabs.indexOf(tab)+offset+tabs.length)%tabs.length;
    event.preventDefault();
    selectProfitTab(tabs[index]);
    tabs[index].focus();
  });
  function renderVolatility() {
    const rows=ui.marketRows(state.daily,state.account,state.watch,state.selected?.positions??[]);
    const grouped=ui.groupFiveDayRows(rows), names={extreme:'极端波动',attention:'异常波动',normal:'正常波动',unavailable:'数据不足',record_only:'仅记录'};
    function metrics(r,key){
      const saved=r.five_day_volatility;
      const percentile=Number.isFinite(saved?.percentile)?p(saved.percentile):'—';
      const cumulative=key==='unavailable'?null:r.five_day_return;
      return {daily:r.daily_return,cumulative,percentile,level:names[key],
        rank:saved?.percentile};
    }
    if (window.NeophyteLocalTemperature) {
      const byProduct = new Map(Object.entries(grouped).flatMap(([level,list]) =>
        list.map(row => [`${row.market}:${row.symbol}`,{row,level}])));
      window.NeophyteLocalTemperature.render({
        target:$('#v2-volatility'), snapshot:state.selected, groups:configuredGroups(state.selected),
        volatility(position) {
          const item=byProduct.get(`${position.market}:${position.symbol}`);
          return item ? metrics(item.row,item.level) : {level:names.unavailable};
        }
      });
      return;
    }
    if(!state.daily){$('#v2-volatility').innerHTML=missing('缺少行情事实快照。');return;}
    $('#v2-volatility').innerHTML=Object.entries(grouped).map(([key,list])=>`<h3 class="${list.length?'':'v2-group-empty'}">${names[key]} <small>${list.length}个标的</small></h3>${list.length?`<div class="v2-table-wrap"><table><thead><tr><th>产品名称</th><th>单日变化</th><th>5日累计</th><th>历史分位</th><th>市场共振</th><th>描述</th></tr></thead><tbody>${list.map(r=>{
      const {daily,cumulative,percentile}=metrics(r,key);
      const product=savedProductClassification(r,r.asset_id,'five_day',state.index);
      const resonance=renderMarketResonance(marketResonance(state.index,r.asset_id,product,r.market_date,'five_day'));
      const facts=state.selected?.volatility_facts?.[r.asset_id];
      const brief=ui.volatilityBrief(r,key,facts,rows);
      return `<tr><td>${e(r.name??r.symbol)}<small>${e(r.symbol)}</small></td><td class="${numberClass(daily)}">${p(daily,true)}</td><td class="${numberClass(cumulative)}">${p(cumulative,true)}</td><td>${percentile}</td><td>${resonance}</td><td>${e(brief)}</td></tr>`;
    }).join('')}</tbody></table></div>`:''}`).join('');
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
    renderCoverage();renderAllocation();renderProfit();renderVolatility();
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
