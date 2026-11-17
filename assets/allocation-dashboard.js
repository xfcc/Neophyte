/* Daily allocation charts over saved percentage snapshots. */
(function (root) {
  const ui = typeof module !== 'undefined' && module.exports ? require('./portfolio-v2.js') : root.Neophyte2;
  const e = ui.escape, p = ui.percent;
  const calendar=typeof module!=='undefined'&&module.exports?require('./market-calendar.js'):root.NeophyteCalendar;
  const sections = [
    {id:'global', title:'全账户仓位', layer:'global'},
    {id:'stock-funds', title:'股票基金仓位', layer:'direct_equity_funds'},
    {id:'stocks', title:'个股仓位', layer:'active_stocks'},
    {id:'bond-detail', title:'债券仓位明细', layer:'direct_bond_funds'},
    {id:'advisory', title:'投顾仓位', layer:'advisory'},
  ];


  function offsetDate(date,offset) {
    const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+offset);
    return value.toISOString().slice(0,10);
  }
  function initialSelections() {
    return Object.fromEntries(sections.map(section=>[section.id,{range:'30',layer:section.layer}]));
  }
  function createController() {
    const selections=initialSelections();
    return {selections, update(id,patch){
      const section=sections.find(s=>s.id===id);if(!section)return;
      if(['30','all'].includes(patch.range))selections[id].range=patch.range;
    }};
  }
  const assetClasses=['equity','bond','cash','gold'];
  function layerChildren(layer,id) {
    const children=layer?.children??[];
    if(id==='global')return children.filter(c=>assetClasses.includes(c.id));
    if(id==='direct_equity_funds')return children.map(c=>c.id===id+':hk_broad'?{...c,name:'境外宽基'}:c);
    if(id!=='direct_bond_funds')return children;
    const retiredId=id+':short_bond', creditId=id+':credit';
    const retired=children.find(c=>c.id===retiredId);
    if(!retired)return children;
    const credit=children.find(c=>c.id===creditId);
    if(!credit)return children.map(c=>c===retired?{...c,id:creditId,name:'信用债'}:c);
    const actual=Number.isFinite(credit.actual_weight)&&Number.isFinite(retired.actual_weight)
      ?credit.actual_weight+retired.actual_weight:null;
    return children.filter(c=>c!==retired).map(c=>c===credit?{...c,actual_weight:actual}:c);
  }
  function completeLayer(snapshot,layerId) {
    const layer=snapshot?.layers?.[layerId],children=layerChildren(layer,layerId);
    return ['complete','estimated'].includes(layer?.status)&&children.length>0&&children.every(c=>Number.isFinite(c.actual_weight)&&c.actual_weight>=0&&c.actual_weight<=1)&&Math.abs(children.reduce((n,c)=>n+c.actual_weight,0)-1)<.00001;
  }
  function isValuationDay(date,layerId,snapshot) {
    return ![0,6].includes(new Date(date+'T12:00:00Z').getUTCDay())&&(completeLayer(snapshot,layerId)||!calendar.closedMarkets(date,layerId).length);
  }
  function buildSeries(snapshots,layerId,range,today) {
    const saved=snapshots.filter(s=>s.reference_date<=today).sort((a,b)=>a.reference_date.localeCompare(b.reference_date));
    const savedByDate=new Map(saved.map(s=>[s.reference_date,s]));
    let start=saved[0]?.reference_date??today;
    if(range!=='all'){
      let count=0;start=today;
      while(count<Number(range)){
        if(isValuationDay(start,layerId,savedByDate.get(start)))count++;
        if(count<Number(range))start=offsetDate(start,-1);
      }
    }
    const within=saved.filter(s=>s.reference_date>=start);
    const availableSeries=[...new Map(within.flatMap(s=>layerChildren(s.layers?.[layerId],layerId)
      .filter(c=>c.id!=='unclassified'&&!c.id.endsWith(':unclassified'))
      .map(c=>[c.id,{id:c.id,name:c.name}]))).values()];
    const categoryAsset={direct_equity_funds:'equity',direct_bond_funds:'bond'}[layerId];
    const series=categoryAsset?ui.sortSubgroups(availableSeries,categoryAsset,c=>c.id):availableSeries;
    const byDate=new Map(within.map(s=>[s.reference_date,s]));
    const days=[];
    for(let date=start;date<=today;date=offsetDate(date,1)){
      if(!isValuationDay(date,layerId,byDate.get(date)))continue;
      const snapshot=byDate.get(date),layer=snapshot?.layers?.[layerId],children=layerChildren(layer,layerId);
      const valid=completeLayer(snapshot,layerId);
      const positions=(snapshot?.positions??[]).filter(row=>layerId==='global'||layerId==='equity'&&row.asset_class==='equity'||layerId==='bond'&&row.asset_class==='bond'||layerId==='advisory'&&!row.id?.startsWith('direct:')||row.method===layerId);
      const missing=positions.filter(row=>row.status==='missing');
      const reason=valid?null:layerId==='global'&&snapshot?.coverage?.reconciliation==='unconfirmed'?'该日账户对账未确认，无法生成全账户比例':missing.length?missing.map(row=>`${row.name}（${row.symbol}）未取得目标日数据${row.market_date?'，最新可用 '+row.market_date:''}`).join('；'):snapshot?'该层历史估值或必要汇率不完整，无法从现有证据恢复':'尚无当日仓位快照';
      const weights=new Map(children.map(c=>[c.id,c.actual_weight]));
      days.push({date,valid,reason,basis:snapshot?.history_basis??'configured_positions',values:series.map(c=>valid?(weights.get(c.id)??0):null)});
    }
    return {start,end:today,layerId,series,days,snapshot:within.at(-1)??null};
  }
  const chartColors={
    equity:'#147b7b',bond:'#4e76ae',cash:'#8796ab',gold:'#d4a843',
    cn_broad:'#147b7b',cn_dividend:'#ad7043',hk_broad:'#4e76ae',cn_theme:'#8661a8',overseas_theme:'#64748b',
    short_rate:'#147b7b',medium_rate:'#4e76ae',credit:'#ad7043'
  };
  function color(id){return chartColors[id.split(':').at(-1)]??'#64748b';}
  const axisText={fill:'#596a81',fontSize:12,fontFamily:'Inter, PingFang SC, Microsoft YaHei, system-ui, sans-serif'};
  const chartLabels={
    global:'占全账户资产比例',equity:'占股票资产比例',direct_equity_funds:'占主动股票基金比例',
    direct_bond_funds:'占主动债券基金比例',active_stocks:'占个股资产比例',advisory:'占投顾资产比例'
  };
  const heatBands=[
    [.05,'#e5f3f1','0–<5%'],[.10,'#c1e1de','5–<10%'],[.20,'#85c3bd','10–<20%'],
    [.30,'#439b98','20–<30%'],[Infinity,'#147b7b','≥30%']
  ];
  function chartType(layerId){
    if(layerId==='global')return 'area';
    return ['active_stocks','advisory'].includes(layerId)?'heatmap':'line';
  }
  function validRuns(days) {
    const runs=[];let run=[];
    for(const day of days){
      if(day.valid){
        run.push(day);
      }else if(run.length){runs.push(run);run=[];}
    }
    if(run.length)runs.push(run);
    return runs;
  }
  function buildChartSpec(data) {
    const {days,series,layerId}=data;
    const type=chartType(layerId);
    const tooltipPattern={
      title:{value:d=>d.date},
      content:[{key:d=>d.name,value:d=>p(d.weight)}]
    };
    const base={
      background:'transparent',animation:false,autoFit:true,padding:{top:12,right:18,bottom:6,left:0},
      legends:{visible:false},
      tooltip:{visible:true,renderMode:'canvas',confine:true,mark:tooltipPattern,dimension:tooltipPattern}
    };
    const xAxis={orient:'bottom',type:'band',domain:days.map(d=>d.date),
      label:{style:axisText,autoRotate:false,autoHide:true},
      tick:{visible:false},domainLine:{visible:false},grid:{visible:false}};
    const valuesFor=rows=>rows.flatMap(day=>series.map((c,k)=>({
      date:day.date,category:c.id,name:c.name,weight:day.values[k],basis:day.basis
    })));
    if(type==='heatmap'){
      const complete=days.filter(day=>day.valid);
      const latest=complete.at(-1);
      const names=new Map(series.map(c=>[c.id,c.name]));
      const order=series.map((c,i)=>({id:c.id,weight:latest?.values[i]})).sort((a,b)=>b.weight-a.weight);
      return {
        ...base,type,
        data:{id:'weights',values:valuesFor(complete)},
        xField:'date',yField:'category',valueField:'weight',
        cell:{style:{fill:d=>heatBands.find(([limit])=>d.weight<limit)[1],stroke:'#ffffff',lineWidth:.7}},
        axes:[{...xAxis,paddingInner:.04,paddingOuter:0},{
          orient:'left',type:'band',inverse:true,domain:order.map(c=>c.id),paddingInner:.08,paddingOuter:0,
          label:{autoHide:false,style:axisText,formatMethod:id=>{
            const name=names.get(id)??id;
            return name.length>10?name.slice(0,10)+'…':name;
          }},
          tick:{visible:false},domainLine:{visible:false},grid:{visible:false}
        }]
      };
    }
    // Keep each contiguous complete run separate so lines and areas break at missing dates.
    const runs=series.length?validRuns(days):[];
    const isStacked=type==='area';
    return {
      ...base,type:'common',
      color:{type:'ordinal',domain:series.map(c=>c.id),range:series.map(c=>color(c.id))},
      series:runs.map((run,index)=>({
        type:isStacked&&run.length===1?'bar':type,id:'run-'+index,stackValue:'run-'+index,
        stack:isStacked,percent:isStacked&&run.every(day=>Math.abs(day.values.reduce((sum,value)=>sum+value,0)-1)<.00001),
        animation:false,invalidType:'break',
        data:{id:'run-data-'+index,values:valuesFor(run)},
        xField:'date',yField:'weight',seriesField:'category',
        ...(isStacked&&run.length===1?{barWidth:8,bar:{style:{fillOpacity:.82}}}:{
          ...(isStacked?{area:{style:{fillOpacity:.82}}}:{}),
          line:{style:{lineWidth:isStacked?1:2}},
          point:{visible:true,style:{size:isStacked?5:4,stroke:'white',lineWidth:1}}
        }),
        tooltip:{mark:tooltipPattern,dimension:tooltipPattern}
      })),
      axes:[
        {...xAxis,paddingInner:0,paddingOuter:0},
        {orient:'left',type:'linear',min:0,max:1,nice:false,tick:{tickMode:'average',tickCount:5,visible:false},
          label:{formatMethod:v=>Math.round(Number(v)*100)+'%',style:axisText},
          domainLine:{visible:false},grid:{visible:true,style:{stroke:'#dbe4eb',lineDash:[]}}}
      ],
      crosshair:{xField:{visible:true,line:{type:'line',style:{stroke:'#8796ab'}}}}
    };
  }
  function renderChart(data,id) {
    const {days,series,layerId}=data;
    const type=chartType(layerId);
    const label=chartLabels[layerId];
    const gaps=days.filter(d=>!d.valid);
    const gapInfo=gaps.length?`<details class="allocation-gaps"><summary>缺失数据 · ${gaps.length}天</summary><ul>${gaps.map(d=>`<li>${e(d.date)}：${e(d.reason)}</li>`).join('')}</ul></details>`:'';
    const summary=days.filter(d=>d.valid).map(d=>d.date+' '+series.map((c,k)=>c.name+' '+p(d.values[k])).join('，')).join('；');
    const layer=data.snapshot?.layers?.[data.layerId];
    const compact=value=>Number.isFinite(value)?`${Number((value*100).toFixed(2))}%`:'—';
    const complete=completeLayer(data.snapshot,layerId);
    const hasTargets=layerChildren(layer,layerId).some(c=>Number.isFinite(c.target_weight)&&series.some(item=>item.id===c.id));
    const latestWeights=new Map(layerChildren(layer,layerId).map(child=>[child.id,child]));
    const legend=series.map(c=>`<span><i style="background:${color(c.id)}"></i><span>${e(c.name)}：${compact(complete?latestWeights.get(c.id)?.actual_weight:null)}</span></span>`).join('');
    const comparison=hasTargets?`<div class="allocation-comparison-label">${e(data.snapshot.reference_date)} · 实际 / 目标</div><div class="allocation-comparison">${series.map(c=>{
      const child=latestWeights.get(c.id);
      const actual=complete?child?.actual_weight:null, target=child?.target_weight;
      return `<div><div class="allocation-comparison-name"><i style="background:${color(c.id)}"></i><span>${e(c.name)}：${compact(actual)}${Number.isFinite(target)?' / '+compact(target):''}</span></div><div class="allocation-weight-track" aria-hidden="true">
        ${Number.isFinite(actual)?`<i class="allocation-actual-bar" style="width:${compact(actual)};background:${color(c.id)}"></i>`:''}
        ${Number.isFinite(target)?`<i class="allocation-target-marker" style="left:${compact(target)}"></i>`:''}
      </div></div>`;
    }).join('')}</div>`:'';
    const empty=!series.length||!days.some(d=>d.valid);
    const heatLegend=empty?'':`<div class="allocation-legend allocation-heat-scale">${heatBands.map(([,fill,range])=>
      `<span><i style="background:${fill}"></i>${e(range)}</span>`).join('')}${gaps.length?'<span>空白为缺失数据</span>':''}</div>`;
    const plotted={area:'百分比堆叠面积图',line:'独立仓位折线图',heatmap:'逐产品仓位热力图'}[type];
    return `<div class="allocation-chart-caption">${e(label)}</div><div class="allocation-chart" data-vchart-section="${e(id)}" data-chart-type="${type}"${type==='heatmap'?` style="--heatmap-height:${Math.max(250,series.length*25+58)}px"`:''} role="img" aria-label="${e(label+'。'+plotted+'。'+summary)}">${empty?'<span class="allocation-chart-empty">暂无完整估值</span>':''}</div>${type==='heatmap'?heatLegend:hasTargets?comparison:`<div class="allocation-legend">${legend}</div>`}${gapInfo}`;
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
    return `<div class="allocation-range-tabs" role="group" aria-label="${section.title}的时间范围">${[['30','30个交易日'],['all','全部']].map(([value,label])=>`<button type="button" data-allocation-range="${value}" data-allocation-section="${section.id}" aria-pressed="${selection.range===value}">${label}</button>`).join('')}</div>`;
  }
  function renderSection(section,selection,snapshots,today) {
    const data=buildSeries(snapshots,selection.layer,selection.range,today);
    const header=`<header class="allocation-section-heading"><h2>${section.title}</h2><div class="allocation-section-controls">${rangeControl(section,selection)}</div></header>`;
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
    element.addEventListener('click',event=>{
      const control=event.target.closest('button[data-allocation-range]');
      if(control&&element.contains(control))update(control.dataset.allocationSection,{range:control.dataset.allocationRange});
    });
    render();
    return {render,update};
  }
  const api={sections,buildSeries,buildChartSpec,renderChart,initialSelections,createController,productRows,renderSection,mount};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NeophyteAllocation=api;
})(typeof window!=='undefined'?window:globalThis);
