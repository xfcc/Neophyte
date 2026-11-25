/* Holdings, valuation temperature, and volatility. */
(() => {
  let latestRequest = 0;
  const format = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 1});
  const signed = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 1, signDisplay: 'exceptZero'});
  const columns = ['产品名称', '持仓占比', '分类占比', '5日波动', '30日波动', '波动率', '温度', '持仓盈亏'];
  const temperatureBands = [
    [20, 'cold', '偏冷'], [40, 'cool', '较冷'], [60, 'neutral', '居中'],
    [80, 'warm', '较热'], [Infinity, 'hot', '偏热']
  ];
  function waveCell(wave, dateNote) {
    const {rank, level} = wave;
    if (['数据不足', '仅记录'].includes(level) ||
        !Number.isFinite(rank) || rank < 0 || rank > 1) return '<td>—</td>';
    const text = signed.format(200 * rank - 100) + '%';
    // Test percentile boundaries directly so rounding cannot trigger a stronger color.
    const intensity = rank < .1 || rank > .9 ? 'extreme' : rank < .2 || rank > .8 ? 'alert' : '';
    const direction = rank > .5 ? 'positive' : 'negative';
    const tone = intensity ? ` v2-wave-${direction} v2-wave-${intensity}` : '';
    const badge = `<span class="v2-wave${tone}">${text}</span>`;
    return `<td title="5日涨跌幅历史百分位 ${format.format(rank * 100)}%。波动率 = 2 × 历史百分位 − 100%">${badge}${dateNote}</td>`;
  }

  function change(value, percent) {
    const text = percent(value, true);
    if (!Number.isFinite(value)) return '—';
    if (!/[1-9]/.test(text)) return '0.00%';
    return `<span class="${value > 0 ? 'v2-up' : 'v2-down'}">${text}</span>`;
  }

  async function load(url, date) {
    try {
      const response = await fetch(url, {cache: 'no-store'});
      if (!response.ok) return null;
      const report = await response.json();
      return report.reference_date === date ? report : null;
    } catch { return null; }
  }

  async function render({target, snapshot, groups, renderClassTables, profitValue, volatility}) {
    const request = ++latestRequest;
    const {escape: e, percent} = window.Neophyte2;
    if (!groups.length) {
      target.innerHTML = '<p class="v2-empty">该日期尚无持仓分类数据。</p>';
      return;
    }
    const source = row => row.id.startsWith('direct:') ? '直持' : '投顾';
    const sum = (rows, field) => rows.every(row => Number.isFinite(row[field]))
      ? rows.reduce((total, row) => total + row[field], 0) : null;
    target.innerHTML = renderClassTables(groups, 'holdings', (sections, labelledBy, assetClass) => {
      const headings = assetClass === 'gold' ? columns.map(name => name === '温度' ? '黄金历史价格分位' : name) : columns;
      const empty = `<tbody><tr><td colspan="${columns.length}">暂无持仓</td></tr></tbody>`;
      const category = sections.length === 1 ? sections[0] : null;
      const summary = category ? `<div class="profit-summary"><span>总持仓占比 <b>${percent(category.totalWeight)}</b></span><span>${Number.isFinite(category.layer.holding_return) && (category.layer.status === 'partial' || category.layer.holding_return_coverage < 1 - 1e-8) ? '可比部分盈亏' : '持仓盈亏'} <b class="profit-sensitive"><span class="profit-value">${change(category.layer.holding_return, percent)}</span></b></span></div>` : '';
      const definitions = {'持仓占比': '占全账户投资资产的比例', '分类占比': '占该细分类资产的比例'};
      return `${summary}<div class="v2-table-wrap" role="region" aria-labelledby="${e(labelledBy)}" tabindex="0">
        <table aria-labelledby="${e(labelledBy)}">
          <thead><tr>${headings.map(name => `<th scope="col"${definitions[name] ? ` title="${definitions[name]}"` : ''}>${e(name)}</th>`).join('')}</tr></thead>
          ${sections.map(({products}) => {
            const distinct = new Map();
            for (const position of products) {
              const key = `${position.market}:${position.symbol}`;
              if (!distinct.has(key)) distinct.set(key, []);
              distinct.get(key).push(position);
            }
            const holdings = window.Neophyte2.sortRows([...distinct.values()].map(positions => ({
              positions, weight: sum(positions, 'weight'), globalWeight: sum(positions, 'global_weight')
            })), 'weight');
            return `<tbody>
              ${holdings.map(({positions, weight, globalWeight}) => {
                const [position] = positions;
                const wave = volatility(position);
                const dateNote = wave.marketDate ? `<small>截至 ${e(wave.marketDate)}</small>` : '';
                const profit = positions.length === 1 ? profitValue(position) : positions
                  .map(row => `<div class="holding-profit-source"><span>${source(row)}</span>${profitValue(row)}</div>`).join('');
                return `<tr data-temperature-symbol="${e(position.symbol)}" data-market="${e(position.market)}">
                  <td>${e(position.name)}<small>${e(position.symbol)} · ${[...new Set(positions.map(source))].join('／')}</small></td>
                  <td>${percent(globalWeight)}</td><td>${percent(weight)}</td>
                  <td>${change(wave.cumulative, percent)}${dateNote}</td><td data-return-30d>—</td>
                  ${waveCell(wave, dateNote)}
                  <td data-temperature>—</td><td class="profit-sensitive"><div class="profit-value">${profit}</div></td></tr>`;
              }).join('')}</tbody>`;
          }).join('') || empty}
        </table></div>`;
    });

    const date = snapshot.reference_date;
    const [temperatures, longReturns] = await Promise.all([
      load(`./data/temperature/${date}.json`, date),
      load(`./data/volatility-30d/${date}.json`, date)
    ]);
    if (request !== latestRequest) return;
    target.querySelectorAll('[data-temperature-symbol]').forEach(row => {
        const {market, temperatureSymbol: symbol} = row.dataset;
        const longReturn = longReturns?.products?.[`${market}:${symbol}`];
        row.querySelector('[data-return-30d]').innerHTML = change(longReturn?.cumulative ?? longReturn, percent);
        const product = temperatures?.products?.[symbol];
        const temperature = row.querySelector('[data-temperature]');
        const price = product?.price_context;
        if (price?.status === 'calculated' && Number.isFinite(price.price_percentile)) {
          temperature.textContent = format.format(price.price_percentile) + '%';
          temperature.title = `Au99.99 近10年人民币收盘价分位 · ${price.valuation_date}`;
          return;
        }
        const item = product?.context ?? product;
        if (item?.status !== 'calculated' || !Number.isFinite(item.temperature)) return;
        const [, band, name] = temperatureBands.find(([limit]) => item.temperature < limit);
        const badge = document.createElement('span');
        badge.className = `v2-temperature-badge v2-tone-${band}`;
        badge.textContent = format.format(item.temperature) + '°';
        temperature.replaceChildren(badge);
        temperature.title = `依估值分位${name} · 估值日 ${item.valuation_date}`;
    });
  }

  window.NeophyteLocalTemperature = {render};
})();
