/* Independent daily percentage stacked area views over saved percentage snapshots. */
(function (root) {
  const ui = typeof module !== 'undefined' && module.exports ? require('./portfolio-v2.js') : root.Neophyte2;
  const e = ui.escape, p = ui.percent;
  const calendar=typeof module!=='undefined'&&module.exports?require('./market-calendar.js'):root.NeophyteCalendar;
  const sections = [
    {id:'global', title:'全账户仓位', layer:'global', overview:true},
    {id:'equity', title:'股票仓位', layer:'equity', overview:true},
    {id:'bond', title:'债券仓位', layer:'bond', overview:true},
    {id:'stock-detail', title:'股票仓位明细', layer:'direct_equity_funds', choices:[['direct_equity_funds','股票基金仓位'],['active_stocks','主动个股仓位']]},
    {id:'bond-detail', title:'债券仓位明细', layer:'direct_bond_funds'},
    {id:'advisory', title:'投顾仓位', layer:'advisory'},
  ];


  function offsetDate(date,offset) {
    const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+offset);
    return value.toISOString().slice(0,10);
  }
  function initialSelections() {
    return Object.fromEntries(sections.map(section=>[section.id,{range:'7',layer:section.layer}]));
  }
  function createController() {
    const selections=initialSelections();
    return {selections, update(id,patch){
      const section=sections.find(s=>s.id===id);if(!section)return;
      if(['7','30','all'].includes(patch.range))selections[id].range=patch.range;
      if(patch.layer!==undefined&&(section.choices??[[section.layer]]).some(choice=>choice[0]===patch.layer))selections[id].layer=patch.layer;
    }};
  }
  const assetClasses=['equity','bond','cash','gold'];
  const layerChildren=(layer,id)=> (layer?.children??[]).filter(c=>id!=='global'||assetClasses.includes(c.id));
  function buildSeries(snapshots,layerId,range,today) {
    const saved=snapshots.filter(s=>s.reference_date<=today).sort((a,b)=>a.reference_date.localeCompare(b.reference_date));
    const start=range==='all'?(saved[0]?.reference_date??today):offsetDate(today,1-Number(range));
    const within=saved.filter(s=>s.reference_date>=start);
    const series=[...new Map(within.flatMap(s=>layerChildren(s.layers?.[layerId],layerId).map(c=>[c.id,{id:c.id,name:c.name}]))).values()];
    const byDate=new Map(within.map(s=>[s.reference_date,s]));
    const days=[];
    for(let date=start;date<=today;date=offsetDate(date,1)){
      // CN, HK and US securities markets share the Saturday/Sunday closure.
      // Keep every weekday: a local holiday may still be an overseas trading day.
      if([0,6].includes(new Date(date+'T12:00:00Z').getUTCDay()))continue;
      const snapshot=byDate.get(date),layer=snapshot?.layers?.[layerId],children=layerChildren(layer,layerId);
      const valid=layer?.status==='complete'&&children.length>0&&children.every(c=>Number.isFinite(c.actual_weight)&&c.actual_weight>=0&&c.actual_weight<=1)&&Math.abs(children.reduce((n,c)=>n+c.actual_weight,0)-1)<.00001;
      // Verified market closures are not missing observations. Keep actual
      // complete records, and never hide an open-market failure as a holiday.
      if(!valid&&calendar.closedMarkets(date,layerId).length)continue;
      const missing=(snapshot?.positions??[]).filter(row=>row.status==='missing'&&(layerId==='global'||layerId==='equity'&&row.asset_class==='equity'||layerId==='bond'&&row.asset_class==='bond'||layerId==='advisory'&&!row.id?.startsWith('direct:')||row.method===layerId));
      const reason=valid?null:missing.length?missing.map(row=>`${row.name}（${row.symbol}）未取得目标日数据${row.market_date?'，最新可用 '+row.market_date:''}`).join('；'):snapshot?'该层历史估值或必要汇率不完整，无法从现有证据恢复':'尚无当日仓位快照';
      const weights=new Map(children.map(c=>[c.id,c.actual_weight]));
      days.push({date,valid,reason,basis:snapshot?.history_basis??'configured_positions',estimated:snapshot?.history_source_status==='estimated',values:series.map(c=>valid?(weights.get(c.id)??0):null)});
    }
    return {start,end:today,series,days,snapshot:within.at(-1)??null};
  }
  const chartColors={equity:'#477a68',bond:'#7198b0',cash:'#bf9858',gold:'#9b80a5',unclassified:'#a3aaa2',direct_equity_funds:'#477a68',advisory_equity_funds:'#7198b0',active_stocks:'#bf9858',direct_bond_funds:'#477a68',advisory_bond_funds:'#7198b0'};
  function color(id){if(chartColors[id])return chartColors[id];let hash=0;for(const ch of id)hash=(hash*31+ch.charCodeAt(0))>>>0;return `hsl(${hash%360} 30% 52%)`;}
  function validRuns(days) {
    const runs=[];let run=[];
    for(const day of days){
      if(day.valid){
        if(run.length&&run.at(-1).basis!==day.basis){runs.push(run);run=[];}
        run.push(day);
      }else if(run.length){runs.push(run);run=[];}
    }
    if(run.length)runs.push(run);
    return runs;
  }
  function buildChartSpec(data) {
    const {days,series}=data;
    // Each contiguous complete run owns its stack. Never feed incomplete vectors
    // to percent normalization or let the renderer bridge a missing date/basis.
    const runs=validRuns(days);
    const tooltipPattern={
      title:{value:d=>d.date+(d.basis==='legacy_registered_positions'?' · 旧版估算口径，不含未登记额外现金':'')},
      content:[{key:d=>d.name,value:d=>p(d.weight)}]
    };
    return {
      type:'common',background:'transparent',animation:false,autoFit:true,padding:{top:12,right:18,bottom:6,left:0},
      color:{type:'ordinal',domain:series.map(c=>c.id),range:series.map(c=>color(c.id))},
      series:runs.map((run,index)=>({
        type:run.length===1?'bar':'area',id:'run-'+index,stackValue:'run-'+index,
        stack:true,percent:true,animation:false,invalidType:'break',
        data:{id:'run-data-'+index,values:run.flatMap(day=>series.map((c,k)=>({date:day.date,category:c.id,name:c.name,weight:day.values[k],basis:day.basis})))},
        xField:'date',yField:'weight',seriesField:'category',
        ...(run.length===1?{barWidth:8,bar:{style:{fillOpacity:.82}}}:{area:{style:{fillOpacity:.82}},line:{style:{lineWidth:1}},point:{visible:true,style:{size:5,stroke:'white',lineWidth:1}}}),
        tooltip:{mark:tooltipPattern,dimension:tooltipPattern}
      })),
      axes:[
        {orient:'bottom',type:'band',domain:days.map(d=>d.date),paddingInner:0,paddingOuter:0,
          label:{style:{fill:'#7a8179',fontSize:12},autoRotate:false,autoHide:true},
          tick:{visible:false},domainLine:{visible:false},grid:{visible:false}},
        {orient:'left',type:'linear',min:0,max:1,nice:false,tick:{tickMode:'average',tickCount:5,visible:false},
          label:{formatMethod:v=>Math.round(Number(v)*100)+'%',style:{fill:'#7a8179',fontSize:12}},
          domainLine:{visible:false},grid:{visible:true,style:{stroke:'#e3e7e2',lineDash:[]}}}
      ],
      legends:{visible:false},crosshair:{xField:{visible:true,line:{type:'line',style:{stroke:'#a3aaa2'}}}},
      tooltip:{visible:true,renderMode:'canvas',confine:true,mark:tooltipPattern,dimension:tooltipPattern}
    };
  }
  function renderChart(data,id) {
    const {days,series}=data;
    const gaps=days.filter(d=>!d.valid);
    const gapInfo=gaps.length?`<details class="allocation-gaps"><summary>缺失数据 · ${gaps.length}天</summary><ul>${gaps.map(d=>`<li>${e(d.date)}：${e(d.reason)}</li>`).join('')}</ul></details>`:'';
    const transitions=days.filter((d,i)=>d.valid&&days[i-1]?.valid&&d.basis!==days[i-1].basis);
    const basisInfo=transitions.map(d=>`<span class="allocation-history-badge">${e(d.date)} 起切换估值口径，分段展示</span>`).join('');
    const summary=days.filter(d=>d.valid).map(d=>d.date+' '+series.map((c,k)=>c.name+' '+p(d.values[k])).join('，')).join('；');
    return `<div class="allocation-chart" data-vchart-section="${e(id)}" role="img" aria-label="${e('每日仓位百分比堆叠面积图。周末不占位，缺失数据及口径变化处断开。'+summary)}">${!days.some(d=>d.valid)?'<span class="allocation-chart-empty">暂无完整估值</span>':''}</div><div class="allocation-legend">${days.some(d=>d.basis==='legacy_registered_positions')?'<span class="allocation-history-badge">旧版估算 · 不含未登记额外现金</span>':''}${basisInfo}${series.map(c=>`<span><i style="background:${color(c.id)}"></i>${e(c.name)}</span>`).join('')}</div>${gapInfo}`;
  }

  function productRows(snapshot,layerId) {
    const positions=(snapshot?.positions??[]).filter(r=>layerId==='advisory'?!r.id.startsWith('direct:'):r.method===layerId);
    const weights=new Map();
    const collect=layer=>(layer?.children??[]).forEach(child=>{
      if(positions.some(r=>r.id===child.id))weights.set(child.id,child.actual_weight);
    });
    collect(snapshot?.layers?.[layerId]);
    // Subcategory product ratios have a different denominator. Translate them
    // through their saved parent weight, never normalize the available subset.
    for(const group of snapshot?.layers?.[layerId]?.children??[]){
      const detail=snapshot.layers?.[group.id];
      if(!detail)continue;
      for(const child of detail.children??[]){
        weights.set(child.id,Number.isFinite(group.actual_weight)&&Number.isFinite(child.actual_weight)?group.actual_weight*child.actual_weight:null);
      }
    }
    return ui.sortRows(positions.map(row=>({...row,weight:weights.get(row.id)??null})),'weight');
  }
  function rangeControl(section,selection) {
    return `<label class="allocation-date-control">时间范围<select data-allocation-range data-allocation-section="${section.id}" aria-label="${section.title}的时间范围">${[['7','最近7天'],['30','最近30天'],['all','全部']].map(([value,label])=>`<option value="${value}" ${selection.range===value?'selected':''}>${label}</option>`).join('')}</select></label>`;
  }
  function renderSection(section,selection,snapshots,today) {
    const data=buildSeries(snapshots,selection.layer,selection.range,today);
    const choices=section.choices?`<label class="allocation-subview-control">仓位类型<select data-allocation-layer data-allocation-section="${section.id}" aria-label="${section.title}的类型">${section.choices.map(([value,label])=>`<option value="${value}" ${selection.layer===value?'selected':''}>${label}</option>`).join('')}</select></label>`:'';
    const header=`<header class="allocation-section-heading"><h2>${section.title}</h2><div class="allocation-section-controls">${choices}${rangeControl(section,selection)}</div></header>`;
    return `<section class="panel v2-panel allocation-section" data-allocation-section-panel="${section.id}" aria-label="${section.title}">${header}${renderChart(data,section.id)}</section>`;
  }
  function mount(element,snapshots,{today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}={}) {
    const controller=createController(snapshots,today);
    const charts=new Map();
    function release(id){charts.get(id)?.release();charts.delete(id);}
    function draw(id){
      const selection=controller.selections[id],data=buildSeries(snapshots,selection.layer,selection.range,today);
      if(!data.days.some(day=>day.valid))return;
      const node=element.querySelector(`[data-vchart-section="${id}"]`);
      const Chart=root.VChart?.default??root.VChart?.VChart;
      if(!Chart){node.textContent="图表组件加载失败，请刷新页面";return;}
      const chart=new Chart(buildChartSpec(data),{dom:node});
      charts.set(id,chart);chart.renderSync();
    }
    function render(id){
      if(id){
        release(id);
        const node=element.querySelector(`[data-allocation-section-panel="${id}"]`);
        if(node)node.outerHTML=renderSection(sections.find(s=>s.id===id),controller.selections[id],snapshots,today);
        draw(id);
      }else {
        for(const section of sections)release(section.id);
        element.innerHTML=sections.map(section=>renderSection(section,controller.selections[section.id],snapshots,today)).join('');
        for(const section of sections)draw(section.id);
      }
    }
    function update(id,patch){controller.update(id,patch);render(id);}
    element.addEventListener('change',event=>{
      const control=event.target;
      const id=control.dataset.allocationSection;
      if(!id)return;
      if(control.hasAttribute('data-allocation-range'))update(id,{range:control.value});
      if(control.hasAttribute('data-allocation-layer'))update(id,{layer:control.value});
    });
    render();
    return {render,update};
  }
  const api={sections,buildSeries,buildChartSpec,renderChart,initialSelections,createController,productRows,renderSection,mount};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NeophyteAllocation=api;
})(typeof window!=='undefined'?window:globalThis);
