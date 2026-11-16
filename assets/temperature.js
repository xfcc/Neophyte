/* Local-only combined valuation temperature and volatility. */
(() => {
  let latestRequest = 0;
  const format = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 1});
  const signed = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 1, signDisplay: 'exceptZero'});
  const columns = ['产品名称', '温度', '温度偏离', '5日波动', '30日波动', '百分位偏离度'];
  const temperatureBands = [
    [20, 'cold', '偏冷'], [40, 'cool', '较冷'], [60, 'neutral', '居中'],
    [80, 'warm', '较热'], [Infinity, 'hot', '偏热']
  ];
  const waveTone = {'异常波动': 'v2-wave-alert', '极端波动': 'v2-wave-extreme'};

  function waveCell(wave) {
    if (['数据不足', '仅记录'].includes(wave.level) ||
        !Number.isFinite(wave.rank) || wave.rank < 0 || wave.rank > 1) return '<td>—</td>';
    const deviation = Number((wave.rank * 100 - 50).toFixed(2));
    const text = (deviation > 0 ? '+' : '') + deviation.toFixed(2);
    return `<td class="${waveTone[wave.level] ?? ''}" title="5日波动历史百分位减去50，单位为百分点">${text}</td>`;
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

  async function render({target, snapshot, groups, volatility}) {
    const request = ++latestRequest;
    const {escape: e, percent} = window.Neophyte2;
    target.classList.add('v2-combined');
    target.parentElement.querySelector('h2').textContent = '持仓温度与波动';
    target.parentElement.querySelector('.section-note')?.remove();

    const populated = groups.filter(group => group.sections.length);
    if (!populated.length) {
      target.innerHTML = '<p class="v2-empty">该日期尚无持仓分类数据。</p>';
      return;
    }
    target.innerHTML = populated.map(({label, sections}) => {
      const groupKey = sections[0].layer.id.split(':')[1];
      const heading = `v2-combined-${groupKey}`;
      const headings = groupKey === 'gold' ? columns.map(name => name === '温度' ? '黄金历史价格分位' : name) : columns;
      return `<h3 id="${e(heading)}">${e(label)}</h3>
        <div class="v2-table-wrap" role="region" aria-labelledby="${e(heading)}" tabindex="0">
        <table aria-labelledby="${e(heading)}">
          <thead><tr>${headings.map(name => `<th scope="col">${e(name)}</th>`).join('')}</tr></thead>
          ${sections.map(({layer, products}) => {
            const distinct = new Map();
            for (const position of products) {
              const key = `${position.market}:${position.symbol}`;
              if (!distinct.has(key)) distinct.set(key, position);
            }
            return `<tbody><tr class="v2-category"><th colspan="${columns.length}" scope="rowgroup">${e(layer.name)}</th></tr>
              ${[...distinct.values()].map(position => {
                const wave = volatility(position);
                return `<tr data-temperature-symbol="${e(position.symbol)}" data-market="${e(position.market)}">
                  <td>${e(position.name)}<small>${e(position.symbol)}</small></td>
                  <td data-temperature>—</td>
                  <td data-deviation>—</td>
                  <td>${change(wave.cumulative, percent)}</td><td data-return-30d>—</td>
                  ${waveCell(wave)}</tr>`;
              }).join('')}</tbody>`;
          }).join('')}
        </table></div>`;
    }).join('');

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
        const context = product?.context;
        const item = context ?? product;
        if (item?.status !== 'calculated' || !Number.isFinite(item.temperature)) return;
        const [, band, name] = temperatureBands.find(([limit]) => item.temperature < limit);
        const badge = document.createElement('span');
        badge.className = `v2-temperature-badge v2-tone-${band}`;
        badge.textContent = format.format(item.temperature) + '°';
        temperature.replaceChildren(badge);
        temperature.title = `依估值分位${name} · 估值日 ${item.valuation_date}`;
        if (context) return;
        const deviation = row.querySelector('[data-deviation]');
        deviation.textContent = signed.format(item.deviation) + (item.deviation_unit === 'bp' ? ' bp' : '%');
        // Positive PE deviation and negative yield deviation both indicate richer valuation.
        const direction = item.deviation_unit === 'bp' ? -item.deviation : item.deviation;
        if (Math.abs(direction) >= .05) deviation.classList.add(direction > 0 ? 'v2-deviation-warm' : 'v2-deviation-cool');
    });
  }

  window.NeophyteLocalTemperature = {render};
})();
