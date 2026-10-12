(() => {
  if (window.location.protocol === 'file:') return;
  const $ = id => document.getElementById(id);
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => Number.isFinite(value) ? value.toFixed(3) : '—';
  const labels = {candidate:'低估值候选',assessed:'已核验 · 非候选',pending:'待确认'};
  const reasons = {
    required_input_missing:'必要数据尚未确认', financial_metadata_or_point_in_time_unavailable:'财报币种、公告日期或可用时间尚未确认',
    financial_announcement_date_not_returned:'缺少财报实际公告日期', statement_currency_not_returned:'报表原始币种未确认',
    quote_currency_unconfirmed:'报价币种未确认', H_share_total_issuer_market_cap_unconfirmed:'尚未确认市值覆盖整家公司',
    target_price_missing_or_conflicting:'目标价格日数据缺失或存在冲突', dated_market_cap_unavailable:'缺少同日有效总市值',
    dividend_history_coverage_unconfirmed:'普通股息历史覆盖或实际付款未确认', CCR_extremely_high:'现金利润比超过500%，保留原值',
    nonpositive_TTM_parent_profit:'TTM归母净利润不为正', CCR_denominator_invalid:'合并净利润不为正或接近零',
    TTM_parent_loss:'TTM归母亏损', TTM_consolidated_loss:'TTM合并亏损',
    price_date_share_capital_not_directly_confirmed:'价格日股本尚未直接确认',price_date_share_capital_unconfirmed:'价格日股本尚未确认',
    price_date_share_count_unconfirmed:'价格日股份数量尚未确认', dividend_payment_confirmation_missing:'股息付款尚未确认',
    dividend_actual_payment_unconfirmed:'股息实际付款尚未确认', ANTA_2025_comparatives_restated:'2025年可比财务数据已重列',
    ANTA_profit_includes_Amer_dilution_gain:'利润包含Amer持股摊薄收益',
    akshare_period_label_requires_override_with_official_balance_date:'财报日期按官方原文核对',
    revenue_unavailable_or_not_yet_extracted:'TTM营业收入尚未确认', dividend_coverage_or_price_unavailable:'股息覆盖或价格未确认',
  };
  const explain = reason => reasons[reason] ?? (reason ? '数据口径或计算条件尚待核验' : '尚未确认');
  let index, loading, page = 0, requestId = 0, detailId = 0;
  const fetchJson = async path => {
    const response = await fetch(`${dataRoot}${path}`, {cache:'no-store'});
    if (!response.ok) throw new Error('研究数据暂时无法加载，请重试');
    return response.json();
  };
  const group = () => index.groups.find(g => g.id === $('valuation-industry').value) ?? index.groups[0];
  const busy = active => {
    $('valuation-prev').disabled = active || page === 0;
    $('valuation-next').disabled = active || !index || page >= (group().pages[$('valuation-kind').value]?.length ?? 0)-1;
  };
  async function showPage(nextPage = 0) {
    const id = ++requestId; ++detailId;
    $('valuation-detail').hidden = true;
    page = nextPage;
    const selected = group(), kind = $('valuation-kind').value, paths = selected.pages[kind], total = selected.counts[kind];
    $('valuation-rows').replaceChildren();
    $('valuation-count').textContent = `${total.toLocaleString()} 家 · 每页 ${index.page_size} 家`;
    $('valuation-page').textContent = paths.length ? `${page+1} / ${paths.length} 页` : '0 / 0 页';
    $('valuation-message').textContent = paths.length ? '正在加载本页' : kind === 'candidates' ? '当前已核验企业中没有符合条件的候选；待确认企业仍保留在研究清单。' : '当前行业没有此类企业。';
    $('valuation-retry').hidden = true;
    busy(true);
    try {
      if (!paths.length) return;
      const result = await fetchJson(paths[page]);
      if (id !== requestId) return;
      $('valuation-rows').innerHTML = result.companies.map(c => `<tr><td><strong>${esc(c.name)}</strong><small>${esc(c.symbol)}</small></td><td>${esc(c.industry ?? '行业未确认')}</td><td>${num(c.scores.VS)}</td><td>${num(c.scores.QS)}</td><td class="valuation-fs">${num(c.scores.FS)}</td><td><span class="valuation-status ${c.status}">${c.scope_status === 'excluded' ? '已核验 · 收入或利润不为正' : labels[c.status]}</span></td><td><button type="button" data-valuation-detail="${esc(c.detail_path)}" aria-label="查看${esc(c.name)}详情">查看</button></td></tr>`).join('');
      $('valuation-message').textContent = `显示第 ${page*index.page_size+1}–${page*index.page_size+result.companies.length} 家`;
    } catch (error) {
      if (id === requestId) { $('valuation-message').textContent = error.message; $('valuation-retry').hidden = false; }
    } finally { if (id === requestId) busy(false); }
  }
  async function showDetail(path) {
    const id = ++detailId, panel = $('valuation-detail');
    panel.hidden = false; panel.textContent = '正在加载企业详情';
    try {
      const c = await fetchJson(path);
      if (id !== detailId) return;
      const percent = new Set(['DY','ROE','DR']);
      const names = {PE:'市盈率 PE',PB:'市净率 PB',DY:'普通股息率 DY（辅助）',ROE:'净资产收益率 ROE',CCR:'现金利润比 CCR',DR:'资产负债率 DR'};
      const metrics = Object.entries(c.metrics).map(([key, m]) => `<div><dt>${names[key]}</dt><dd>${Number.isFinite(m.number) ? percent.has(key) ? `${(m.number*100).toFixed(2)}%` : m.number.toFixed(4) : '—'}</dd>${m.status === 'missing' ? `<small>${esc(explain(m.reason))}</small>` : ''}</div>`).join('');
      const money = m => Number.isFinite(m.amount) ? `${(m.amount/1e8).toFixed(2)} 亿 ${esc(m.currency)}` : '待确认';
      const periods = c.financial_period ? `${c.financial_period.start} 至 ${c.financial_period.end}` : '财务期间待确认';
      const gaps = Object.entries(c.missing).map(([key, reason]) => `<li>${esc(names[key] ?? (key === 'ttm_revenue' ? 'TTM营业收入' : 'TTM归母净利润'))}：${esc(explain(reason))}</li>`).join('');
      const flags = c.flags.filter(f => f !== 'dividend_history_coverage_unconfirmed').map(f => `<li>${esc(explain(f))}</li>`).join('');
      panel.innerHTML = `<div class="section-heading"><div><p class="section-kicker">${esc(c.symbol)} · ${esc(c.industry)}</p><h2 id="valuation-detail-title" tabindex="-1">${esc(c.name)}</h2></div><button id="valuation-close" type="button">收起详情</button></div><p class="valuation-meta">TTM期间 ${esc(periods)} · VS ${num(c.scores.VS)} / QS ${num(c.scores.QS)} / FS ${num(c.scores.FS)}</p><dl class="valuation-metrics"><div><dt>TTM营业收入</dt><dd>${money(c.fundamentals.ttm_revenue)}</dd></div><div><dt>TTM归母净利润</dt><dd>${money(c.fundamentals.ttm_parent_profit)}</dd></div>${metrics}</dl>${gaps ? `<h3>缺失数据</h3><ul>${gaps}</ul>` : ''}${flags ? `<h3>数据标记</h3><ul>${flags}</ul>` : ''}<details><summary>财务期间、实际公告日期与来源</summary><ul>${c.reports.map(r => `<li>${esc(r.period_start ?? '起始日待确认')} 至 ${esc(r.period_end)} · 报表币种 ${esc(r.currency ?? '待确认')} · 公告 ${esc(r.announced_at ?? '待确认')}</li>`).join('')}</ul>${c.sources.length ? `<ul>${c.sources.map((s, i) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.provider ?? '公开来源')} · 原始资料 ${i+1}</a></li>`).join('')}</ul>` : '<p>财报原件尚未完成核验；批量表格不作为有效评分依据。</p>'}</details>`;
      $('valuation-close').addEventListener('click', () => { ++detailId; panel.hidden = true; });
      $('valuation-detail-title').focus({preventScroll:true}); panel.scrollIntoView({behavior:'smooth',block:'start'});
    } catch (error) { if (id === detailId) panel.textContent = error.message; }
  }
  async function ensure() {
    if (index || loading) return;
    loading = true;
    try {
      const manifest = await fetchJson('data/manifest.json');
      if (!manifest.valuation_view) throw new Error('研究结果尚未发布');
      index = await fetchJson(manifest.valuation_view.index_path);
      $('valuation-meta').textContent = `观察 ${index.snapshot_date} · 价格 ${index.price_date} · 名录 ${index.registry_as_of ?? '待确认'} · 模型 V${index.model_version}`;
      const s = index.summary;
      $('valuation-stats').innerHTML = [['研究企业',s.companies],['财务核验',s.companies-s.scope_unknown],['完整评分',s.FS_valid],['低估值候选',s.candidates]].map(([label, count]) => `<div><span>${label}</span><strong>${count.toLocaleString()}</strong></div>`).join('');
      $('valuation-coverage').textContent = `${s.scope_unknown.toLocaleString()} 家财务资格待确认。候选仅来自已核验子集。目标价格日缺失 ${index.gaps.price} 家、报价币种未确认 ${index.gaps.quotation_currency} 家、H股全公司市值口径未确认 ${index.gaps.whole_issuer_market_cap} 家，缺口可能重叠。`;
      $('valuation-industry').innerHTML = index.groups.map(g => `<option value="${g.id}">${esc(g.name)} · ${g.counts.all} 家</option>`).join('');
      const w = index.model.weights, b = index.model.baselines;
      $('valuation-rules').textContent = `VS = ${w.PE.toFixed(4)} × ${b.PE}/PE + ${w.PB.toFixed(4)} × ${b.PB}/PB。QS = ${w.ROE} × ROE/${b.ROE} + ${w.CCR} × CCR + ${w.DR} × (1−DR)/${b.DR}。FS = ${w.VS} × VS + ${w.QS} × QS。权重按原始精度计算。仅同行业内比较，不设质量准入门槛，不截断有效极端值；股息率缺失不影响V1.1核心评分。FS是评价指数，不是收益率或上涨概率。名录之后的上市及退市变更尚待核验。`;
      await showPage();
    } catch (error) {
      index = null; $('valuation-message').textContent = error.message;
      $('valuation-coverage').textContent = '研究数据暂不可用，可重新加载。'; $('valuation-retry').hidden = false;
    } finally { loading = false; }
  }
  $('valuation-industry').addEventListener('change', () => index && showPage());
  $('valuation-kind').addEventListener('change', () => index && showPage());
  $('valuation-prev').addEventListener('click', () => showPage(page-1));
  $('valuation-next').addEventListener('click', () => showPage(page+1));
  $('valuation-rows').addEventListener('click', event => { const button = event.target.closest('[data-valuation-detail]'); if (button) showDetail(button.dataset.valuationDetail); });
  $('valuation-retry').addEventListener('click', () => index ? showPage(page) : ensure());
  window.addEventListener('neophyte:view', event => { if (event.detail === 'valuation') ensure(); });
  if (window.location.hash === '#valuation') ensure();
})();
