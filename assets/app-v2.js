/* Three views over saved facts. The legacy script supplies locked resonance helpers. */
(async function () {
  'use strict';
  const ui = window.Neophyte2, e = ui.escape, p = ui.percent;
  const labels = {equity:'股票',bond:'债券',gold:'黄金',cash:'现金',unclassified:'待分类',direct_equity_funds:'主动股票基金',advisory_equity_funds:'投顾股票基金',active_stocks:'主动个股',direct_bond_funds:'主动债券基金',advisory_bond_funds:'投顾债券基金',cn_broad:'A股宽基',cn_dividend:'A股红利',hk_broad:'港股宽基',short_rate:'短期利率债',medium_rate:'中期利率债',credit:'信用债',short_bond:'超短债（混合券种）'};
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
    $('#v2-title').textContent={allocation:'资产配置',profit:'资产浮盈',volatility:'波动识别'}[tab];
    if(state.snapshots.length)renderCoverage();
    $('#v2-subtitle').textContent={allocation:'从全账户到各类持仓，逐层查看。交易日逐点记录，可独立查看最近30个交易日或全部',profit:'按投资标的查看当前持仓与成本的差额',volatility:'识别近5个有效交易日变化的少见程度'}[tab];
  }
  function renderCoverage() {
    const allocationView=!['profit','volatility'].includes(location.hash.slice(1));
    const s=allocationView?(state.snapshots.at(-1)??state.selected):state.selected, c=s?.coverage??{};
    $('#v2-status').textContent=s ? `估值日 ${s.reference_date} · 行情快照 ${s.valuation_input_date??'—'} · ${s.status==='complete'?'全账户测算可用':'全账户测算不完整'}${c.account_source_status==='estimated'?' · 投顾源快照为估算，本页按配置份额估值':''}` : '尚无2.0配置快照；历史事实仍可在波动识别中查看。';
    $('#v2-coverage').innerHTML=s?[
      ['行情采集',`直接 ${c.direct_confirmed??0}/${c.direct_total??0} · 投顾 ${c.advisory_confirmed??0}/${c.advisory_total??0}`],['估值覆盖',`${c.valued_positions??0}/${c.positions_total??0}`],['细分分类',c.classification==='complete'?'完整':'待完善'],
      ['账户对账',c.reconciliation==='confirmed'?'已确认':'待核对'],['现金记录',c.cash_date??'未录入'],
      ['配置版本',(s.configuration_versions?.allocation??'无').slice(0,8)]
    ].map(([k,v])=>`<div><span>${e(k)}</span><strong>${e(v)}</strong></div>`).join(''):'';
  }
  function renderAllocation() {
    if(window.NeophyteAllocation){
      if(!state.allocationDashboard)state.allocationDashboard=window.NeophyteAllocation.mount($('#v2-allocation-dashboard'),state.allocationSnapshots??state.snapshots);
      else state.allocationDashboard.render();
    }
  }
  function renderProfit() {
    const s=state.selected, filter=$('#v2-filter').value, weight=$('#v2-weight').value;
    if(!s?.positions?.length){$('#v2-profit').innerHTML=missing('尚无该日期可用的2.0持仓估值。');return;}
    const field=$('#v2-sort').value==='weight'?weight:$('#v2-sort').value;
    const scope=$('#v2-subfilter').value;
    const options=new Map();
    (s.positions??[]).filter(r=>filter==='all'||r.asset_class===filter).forEach(r=>{
      options.set(r.method,labels[r.method]??r.method);
      if(['direct_equity_funds','direct_bond_funds'].includes(r.method))options.set(r.method+'/'+r.subgroup,(labels[r.method]??r.method)+' · '+(labels[r.subgroup]??r.subgroup));
    });
    $('#v2-subfilter').innerHTML='<option value="all">全部内部分类</option>'+[...options].map(([value,label])=>`<option value="${e(value)}">${e(label)}</option>`).join('');
    $('#v2-subfilter').value=options.has(scope)?scope:'all';
    const filtered=ui.filterRows(s.positions,filter,$('#v2-subfilter').value);
    const groups=filter==='all'?['equity','bond','cash','gold']:[filter];
    $('#v2-profit').innerHTML=groups.map(cls=>{
      const rows=ui.sortRows(filtered.filter(r=>r.asset_class===cls),field);
      if(!rows.length)return '';
      const layer=s.layers[cls];
      return `<h3>${e(labels[cls])} <small>${layer&&$('#v2-subfilter').value==='all'?`${layer.status==='partial'?'已知部分':'分类'}浮盈 ${p(layer.holding_return,true)} · 已计价 ${rows.filter(r=>r.status==='confirmed').length}/${rows.length} · 已知市值中成本可比 ${p(layer.holding_return_coverage)}`:`当前筛选已计价 ${rows.filter(r=>r.status==='confirmed').length}/${rows.length}`}</small></h3><div class="v2-table-wrap"><table><thead><tr><th>投资标的</th><th>分类</th><th>市场日期</th><th>日涨跌幅</th><th>持仓浮盈收益率</th>${window.NeophyteLocalDetails?'<th>浮盈金额（人民币）</th>':''}<th>占${weight==='global_weight'?'全账户':e(labels[cls])}比例</th><th>数据状态</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${e(r.name)}<small>${e(r.symbol)}</small></td><td>${e(labels[r.method]??r.method)}<small>${e(labels[r.subgroup]??r.subgroup)}</small></td><td>${e(r.market_date??'缺失')}</td><td class="${numberClass(r.daily_return)}">${p(r.daily_return,true)}</td><td class="${numberClass(r.holding_return)}">${p(r.holding_return,true)}</td>${window.NeophyteLocalDetails?`<td data-private-profit="${e(r.id)}">—</td>`:''}<td>${p(r[weight])}</td><td>${r.status==='missing'?'估值缺失':r.holding_return_status==='unavailable'?'收益率不可比':'已计价'}${r.date_difference?' · 日期差异':''}</td></tr>`).join('')}</tbody></table></div>`;
    }).join('')||missing('该分类没有持仓。');
    window.dispatchEvent(new CustomEvent('neophyte:snapshot',{detail:s}));
  }
  function renderVolatility() {
    if(!state.daily){$('#v2-volatility').innerHTML=missing('缺少行情事实快照。');return;}
    const rows=ui.marketRows(state.daily,state.account,state.watch,state.selected?.positions??[]);
    const grouped=ui.groupFiveDayRows(rows), names={extreme:'极端波动',attention:'异常波动',normal:'正常波动',unavailable:'数据不足',record_only:'仅记录'};
    $('#v2-volatility').innerHTML=Object.entries(grouped).map(([key,list])=>`<h3>${names[key]} <small>${list.length}个标的</small></h3>${list.length?`<div class="v2-table-wrap"><table><thead><tr><th>投资标的</th><th>分类</th><th>5日窗口</th><th>5日累计</th><th>历史分位</th><th>方向</th><th>单日变化</th><th>市场参考与共振</th><th>事实描述</th></tr></thead><tbody>${list.map(r=>{
      const saved=r.five_day_volatility;
      const product=savedProductClassification(r,r.asset_id,'five_day',state.index);
      const resonance=marketResonance(state.index,r.asset_id,product,r.market_date,'five_day');
      const percentile=Number.isFinite(saved?.percentile)?p(saved.percentile):'—';
      const cumulative=key==='unavailable'?null:r.five_day_return;
      const facts=state.selected?.volatility_facts?.[r.asset_id];
      const path=facts?.window_start_date?`窗口内${facts.positive_days}日上涨、${facts.negative_days}日下跌；最大单日变化${p(facts.largest_daily_return,true)}`:'窗口路径证据不足';
      let brief=key==='normal'?'正常波动':key==='record_only'?'仅记录':key==='unavailable'?'有效数据或历史基准不足':`${path}；原因未确认（证据等级：未建立）。核验${r.market_date}及前后产品公告。`;
      if(r.asset_type==='stock'&&['extreme','attention'].includes(key)){
        const peers=rows.filter(x=>x.asset_type==='stock'&&x.market===r.market&&x.market_date===r.market_date&&Number.isFinite(x.five_day_return)).map(x=>x.five_day_return).sort((a,b)=>a-b);
        const median=peers.length?peers.length%2?peers[(peers.length-1)/2]:(peers[peers.length/2-1]+peers[peers.length/2])/2:null;
        brief+=` 同市场持仓样本${peers.length}个，中位累计变化${p(median,true)}；末日${Math.sign(r.daily_return)===Math.sign(cumulative)?'延续':'未延续'}窗口方向。观察下一有效交易日是否延续，并核验公司公告。`;
      }
      return `<tr><td>${e(r.name??r.symbol)}<small>${e(r.symbol)}</small></td><td>${e(labels[state.selected?.positions?.find(x=>x.asset_id===r.asset_id)?.asset_class]??(r.asset_bucket==='bond'?'债券':r.asset_bucket==='equity'?'股票':'待分类'))}</td><td>${e(facts?.window_start_date??'起日证据不足')} 至 ${e(r.market_date??'缺失')}</td><td class="${numberClass(cumulative)}">${p(cumulative,true)}</td><td>${percentile}</td><td>${Number.isFinite(cumulative)?cumulative>0?'正向':cumulative<0?'负向':'持平':'—'}</td><td class="${numberClass(r.daily_return)}">${p(r.daily_return,true)}</td><td>${renderMarketResonance(resonance)}</td><td>${e(brief)}</td></tr>`;
    }).join('')}</tbody></table></div>`:missing('无此类标的。')}`).join('');
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
  ['#v2-filter','#v2-subfilter','#v2-weight','#v2-sort'].forEach(s=>$(s).addEventListener('change',renderProfit));
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
