const publicMode = true;
const dataRoot = "./";
const paths = {
  watchlist: "./data/watchlist.json",
  volatilityIndex: "./data/volatility-index.json",
  manifest: "./data/manifest.json",
};

const groups = [
  {
    id: "equity-funds",
    label: "独立股票基金",
    description: "独立配置的股票型基金",
    matches: (asset) => asset.allocation_category === "independent_equity_funds",
  },
  {
    id: "bond-funds",
    label: "独立债券基金",
    description: "独立配置的债券型基金",
    matches: (asset) => asset.allocation_category === "independent_bond_funds",
  },
  {
    id: "active-stocks",
    label: "主动个股",
    description: "港股与美股主动个股 · 按固定 1 USD = 7.80 HKD 合并占比",
    matches: (asset) => asset.allocation_category === "active_equity",
  },
];

const portfolioCategoryOrder = [
  "independent_equity_funds",
  "independent_bond_funds",
  "active_equity",
  "advisory",
];

const portfolioCategoryLabels = {
  independent_equity_funds: "独立股票基金",
  independent_bond_funds: "独立债券基金",
  active_equity: "主动个股",
  advisory: "投顾服务产品",
};

const productLevelLabels = {
  normal: "正常波动",
  abnormal_positive: "异常波动",
  abnormal_negative: "异常波动",
  extreme_positive: "极端波动",
  extreme_negative: "极端波动",
  record_only: "仅记录",
  unavailable: "无法判断",
};

const resonanceLabels = {
  same_normal: "同向正常",
  same_abnormal: "同向异常",
  negative_abnormal: "负向异常",
};

const accountAllocationColors = { equity: "#a43e35", bond: "#2e5f7a", cash: "#6f8980" };
const accountBucketLabels = { equity: "股票基金", bond: "债券基金", cash: "现金及货币基金" };
const viewNames = new Set(["daily", "five-day", "global"]);

function formatPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

function formatAccountDaily(component) {
  if (!Number.isFinite(component?.daily_return)) return "-";
  const digits = component.value_type === "money_fund_income" ? 3 : 2;
  return `${component.daily_return >= 0 ? "+" : ""}${(component.daily_return * 100).toFixed(digits)}%`;
}

function formatHolding(holding) {
  if (!holding || !Number.isFinite(holding.return)) return holding?.description ?? "待配置";
  return formatPercent(holding.return);
}

function formatWeight(holding) {
  if (!Number.isFinite(holding?.group_weight)) return "—";
  return `${(holding.group_weight * 100).toFixed(2)}%`;
}

function formatPlainPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(2)}%`;
}

function sortByWeight(items, getWeight) {
  return items
    .map((item, sourceIndex) => ({ item, sourceIndex, weight: getWeight(item) }))
    .sort((left, right) => {
      const leftAvailable = Number.isFinite(left.weight);
      const rightAvailable = Number.isFinite(right.weight);
      if (leftAvailable !== rightAvailable) return leftAvailable ? -1 : 1;
      if (!leftAvailable) return left.sourceIndex - right.sourceIndex;
      return right.weight - left.weight || left.sourceIndex - right.sourceIndex;
    })
    .map(({ item }) => item);
}

function formatWeightDelta(actual, target) {
  if (!Number.isFinite(actual) || !Number.isFinite(target)) return "—";
  const value = (actual - target) * 100;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} 个百分点`;
}


function formatChineseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function returnClass(value) {
  if (!Number.isFinite(value) || value === 0) return "return-flat";
  return value > 0 ? "return-up" : "return-down";
}

function isProductAnomaly(classification) {
  return classification && !["normal", "record_only", "unavailable"].includes(classification.level);
}

function visualLevel(level) {
  if (level?.startsWith("extreme")) return "extreme";
  if (level?.startsWith("abnormal")) return "attention";
  if (level === "normal") return "normal";
  if (level === "record_only") return "record-only";
  return "unavailable";
}

function rowClass(level) {
  return isProductAnomaly({ level }) ? "row-attention" : "row-normal";
}

function classifyReturn(value, baselines) {
  if (!Number.isFinite(value) || !baselines) return { level: "unavailable", direction: 0 };
  if (value <= baselines.p01) return { level: "extreme_negative", direction: -1 };
  if (value <= baselines.p10) return { level: "abnormal_negative", direction: -1 };
  if (value >= baselines.p99) return { level: "extreme_positive", direction: 1 };
  if (value >= baselines.p90) return { level: "abnormal_positive", direction: 1 };
  return { level: "normal", direction: Math.sign(value) };
}

function productClassification(volatilityIndex, assetId, value, windowName, date) {
  const assetBaseline = volatilityIndex.assets[assetId];
  if (assetBaseline?.volatility_enabled === false) {
    return { level: "record_only", direction: 0, value, assetBaseline, windowName, date, percentile: null };
  }
  return {
    ...classifyReturn(value, assetBaseline?.baselines?.[windowName]),
    value,
    assetBaseline,
    windowName,
    date,
    percentile: assetBaseline?.observed_percentiles?.[windowName]?.[date] ?? null,
  };
}

function savedProductClassification(item, assetId, windowName, volatilityIndex) {
  const value = windowName === "five_day" ? item?.five_day_return : item?.daily_return;
  const saved = windowName === "five_day" ? item?.five_day_volatility : item?.volatility;
  if (saved?.basis !== "historical_percentile") {
    return productClassification(volatilityIndex, assetId, value, windowName, item?.market_date);
  }
  const direction = Number.isFinite(value) ? Math.sign(value) : 0;
  const directionalLevel = saved.level === "attention"
    ? direction > 0 ? "abnormal_positive" : "abnormal_negative"
    : saved.level === "extreme"
      ? direction > 0 ? "extreme_positive" : "extreme_negative"
      : saved.level;
  return {
    level: directionalLevel,
    direction,
    value,
    windowName,
    date: item?.market_date ?? null,
    percentile: saved.percentile,
    assetBaseline: volatilityIndex.assets[assetId],
  };
}

function renderProductVolatility(classification) {
  const shown = visualLevel(classification.level);
  const directionClass = isProductAnomaly(classification)
    ? ` level-direction-${classification.direction > 0 ? "up" : "down"}`
    : "";
  const percentileClass = classification.direction > 0
    ? " classification-note-up"
    : classification.direction < 0
      ? " classification-note-down"
      : "";
  const percentile = isProductAnomaly(classification) && Number.isFinite(classification.percentile)
    ? `<small class="classification-note${percentileClass}">${(classification.percentile * 100).toFixed(2)}%</small>`
    : "";
  return `<span class="volatility-stack"><span class="level-badge level-${shown}${directionClass}">${productLevelLabels[classification.level]}</span>${percentile}</span>`;
}

function referenceDetail(volatilityIndex, assetBaseline, relationship, product, date, windowName) {
  const resonanceBaseline = assetBaseline.resonance_baselines?.[relationship];
  const symbol = resonanceBaseline?.reference_symbol;
  const reference = volatilityIndex.references[symbol];
  const observation = reference?.observations?.[date];
  const field = windowName === "five_day" ? "five_day_return" : "daily_return";
  const value = observation?.[field];
  const gap = Number.isFinite(product.value) && Number.isFinite(value) ? product.value - value : null;
  return {
    role: relationship === "primary" ? "主要" : "宽市",
    symbol,
    name: reference?.name ?? symbol,
    value,
    gap,
    sameDirection: Math.sign(value) === product.direction,
    classification: classifyReturn(gap, resonanceBaseline?.baselines?.[windowName]),
    percentile: resonanceBaseline?.observed_percentiles?.[windowName]?.[date] ?? null,
  };
}

function largestRelativeGap(details) {
  return details.reduce((selected, detail) => (
    !selected || Math.abs(detail.gap) > Math.abs(selected.gap) ? detail : selected
  ), null);
}

function closestReference(details) {
  return details.reduce((selected, detail) => (
    !selected || Math.abs(detail.gap) < Math.abs(selected.gap) ? detail : selected
  ), null);
}

function marketResonance(volatilityIndex, assetId, product, date, windowName) {
  if (product.level === "record_only") return { kind: "not_applicable", details: [] };
  if (product.level === "unavailable") return { kind: "unavailable", details: [] };
  if (!isProductAnomaly(product)) return { kind: "not_triggered", details: [] };
  const assetBaseline = volatilityIndex.assets[assetId];
  if (!assetBaseline || !date) return { kind: "unavailable", details: [] };

  const details = [
    referenceDetail(volatilityIndex, assetBaseline, "primary", product, date, windowName),
    referenceDetail(volatilityIndex, assetBaseline, "broad", product, date, windowName),
  ];
  const available = details.filter((detail) => Number.isFinite(detail.gap));
  if (!available.length) return { kind: "unavailable", details };

  const abnormal = available.filter((detail) => isProductAnomaly(detail.classification));
  const sameDirection = available.filter((detail) => detail.sameDirection);
  const selected = abnormal.length
    ? largestRelativeGap(abnormal)
    : sameDirection.length
      ? closestReference(sameDirection)
      : largestRelativeGap(available);
  const kind = selected.sameDirection
    ? isProductAnomaly(selected.classification) ? "same_abnormal" : "same_normal"
    : "negative_abnormal";
  return { kind, details: selected ? [selected] : [] };
}

function renderMarketResonance(resonance) {
  if (resonance.kind === "not_applicable") return '<span class="level-badge level-record-only">仅记录</span>';
  if (resonance.kind === "not_triggered") return '<span class="level-badge level-normal">不涉及</span>';
  if (resonance.kind === "unavailable") return '<span class="level-badge level-unavailable">无法判断</span>';
  const visual = resonance.kind === "same_abnormal" ? "attention" : resonance.kind === "negative_abnormal" ? "divergence" : "neutral";
  const available = resonance.details.filter((detail) => Number.isFinite(detail.gap));
  const detailText = !available.length
    ? ""
    : `<small class="resonance-detail" title="${available.map((detail) => `${detail.role}：${detail.name} ${formatPercent(detail.value)}；相对差值 ${formatPercent(detail.gap)}${Number.isFinite(detail.percentile) ? `；差值历史分位 ${(detail.percentile * 100).toFixed(2)}%` : ""}`).join("；")}">${available.map((detail) => `${detail.role} ${formatPercent(detail.value)}`).join(" · ")}</small>`;
  return `<span class="resonance-badge resonance-${visual}">${resonanceLabels[resonance.kind]}</span>${detailText}`;
}

function buildDailyGroups(snapshot, assets, volatilityIndex) {
  const observations = new Map(snapshot.observations.map((item) => [item.asset_id, item]));
  return groups.map((group) => ({
    ...group,
    rows: sortByWeight(
      assets.filter(group.matches).map((asset) => {
        const item = observations.get(asset.id) ?? null;
        const classification = savedProductClassification(item, asset.id, "daily", volatilityIndex);
        const resonance = marketResonance(volatilityIndex, asset.id, classification, item?.market_date, "daily");
        return { asset, item, classification, resonance };
      }),
      (row) => row.item?.holding?.group_weight,
    ),
  }));
}

function observationEntries(snapshots, assetId) {
  return snapshots.map((snapshot) => snapshot.observations.find((item) => item.asset_id === assetId));
}

function calculateFiveDay(entries, assetId, volatilityIndex) {
  const latest = entries.at(-1);
  if (latest?.five_day_volatility?.basis === "historical_percentile") {
    const classification = savedProductClassification(latest, assetId, "five_day", volatilityIndex);
    return {
      available: entries.filter((item) => item && Number.isFinite(item.daily_return)),
      missing: entries.filter((item) => !item || !Number.isFinite(item.daily_return)).length,
      cumulative: latest.five_day_return,
      endDate: latest.market_date,
      classification,
      resonance: marketResonance(volatilityIndex, assetId, classification, latest.market_date, "five_day"),
    };
  }
  const available = entries.filter((item) => item && Number.isFinite(item.daily_return));
  const missing = entries.length - available.length;
  const cumulative = missing || entries.length !== 5
    ? null
    : available.reduce((result, item) => result * (1 + item.daily_return), 1) - 1;
  const endDate = available.at(-1)?.market_date ?? null;
  const classification = productClassification(volatilityIndex, assetId, cumulative, "five_day", endDate);
  const resonance = marketResonance(volatilityIndex, assetId, classification, endDate, "five_day");
  return { available, missing, cumulative, endDate, classification, resonance };
}

function buildWeeklyGroups(snapshots, assets, volatilityIndex) {
  const latestObservations = new Map((snapshots.at(-1)?.observations ?? []).map((item) => [item.asset_id, item]));
  return groups.map((group) => ({
    ...group,
    rows: sortByWeight(
      assets.filter(group.matches).map((asset) => ({
        asset,
        entries: observationEntries(snapshots, asset.id),
        metrics: calculateFiveDay(observationEntries(snapshots, asset.id), asset.id, volatilityIndex),
      })),
      (row) => latestObservations.get(row.asset.id)?.holding?.group_weight,
    ),
  }));
}

function renderOverviewItem(label, text, type) {
  return `<li class="overview-item overview-${type}"><span class="overview-marker" aria-hidden="true"></span><span><strong>${label}</strong>${text}</span></li>`;
}

function renderOverviewList(root, overview, emptyText = "") {
  const labels = ["数据更新：", "向上异常：", "向下异常：", "正向关注：", "负向关注："];
  const items = overview?.items ?? [];
  if (!items.length) {
    root.innerHTML = renderOverviewItem("", emptyText, "normal");
    return;
  }
  root.innerHTML = items.map((item) => {
    const textLabel = labels.find((candidate) => item.text.startsWith(candidate)) ?? "";
    const label = textLabel || (item.type === "coverage" ? "数据更新：" : "");
    const text = textLabel ? item.text.slice(textLabel.length) : item.text;
    const type = ["向上异常：", "正向关注："].includes(label)
      ? "positive"
      : ["向下异常：", "负向关注："].includes(label)
        ? "negative"
        : item.type;
    return renderOverviewItem(label, text, type);
  }).join("");
}

function renderOverview(snapshot) {
  renderOverviewList(document.querySelector("#overview-list"), snapshot.overview);
}

function renderFiveDayOverview(snapshot) {
  renderOverviewList(
    document.querySelector("#five-day-overview-list"),
    snapshot.five_day_overview,
    "当前没有需要关注的5日累计异常。",
  );
}

function renderAccountAllocations(account, ariaLabel = "投顾服务产品内部实际比例") {
  return `<div class="account-allocation" aria-label="${ariaLabel}"><div class="account-allocation-bar">${account.allocations.map((item) => `<span style="width:${item.weight * 100}%;background:${accountAllocationColors[item.bucket]}"></span>`).join("")}</div><div class="account-allocation-legend">${account.allocations.map((item) => `<span><i style="background:${accountAllocationColors[item.bucket]}"></i>${item.name}<strong>${formatPlainPercent(item.weight)}</strong></span>`).join("")}</div></div>`;
}

function renderAdvisoryDaily(accountSnapshot, volatilityIndex) {
  const root = document.querySelector("#advisory-daily");
  const account = accountSnapshot?.accounts?.[0];
  if (!account) {
    root.innerHTML = '<article class="data-group panel empty-account"><p>尚无投顾服务产品快照。</p></article>';
    return;
  }
  const rows = sortByWeight(account.components, (component) => component.account_weight).map((component) => {
    const classification = savedProductClassification(component, component.asset_id, "daily", volatilityIndex);
    const resonance = marketResonance(volatilityIndex, component.asset_id, classification, component.market_date, "daily");
    return `<tr class="${rowClass(classification.level)}"><td><strong>${component.name}</strong><span class="symbol">${component.symbol} · ${accountBucketLabels[component.asset_bucket]}</span></td><td class="movement-value movement-start ${returnClass(component.daily_return)}">${formatAccountDaily(component)}</td><td class="description-cell">${renderProductVolatility(classification)}</td><td class="resonance-cell">${renderMarketResonance(resonance)}</td><td class="holding-return ${returnClass(component.holding_return)}">${formatPercent(component.holding_return)}</td><td class="holding-weight">${formatPlainPercent(component.account_weight)}</td></tr>`;
  }).join("");
  root.innerHTML = `<article class="data-group panel advisory-card"><div class="account-summary"><div class="account-title"><p>投顾服务产品</p><strong>TIAA001001</strong></div><div><span>持仓收益</span><strong class="${returnClass(account.holding_return)}">${formatPercent(account.holding_return)}</strong></div><div><span>当日变化</span><strong class="${returnClass(account.daily_return)}">${formatPercent(account.daily_return)}</strong></div></div>${renderAccountAllocations(account)}<div class="table-wrap"><table class="daily-table"><thead><tr><th>内部基金</th><th class="movement-start">日涨跌幅</th><th>产品波动</th><th>市场共振</th><th>持仓收益</th><th>账户内占比</th></tr></thead><tbody>${rows}</tbody></table></div><p class="account-footnote">现金及货币基金只记录公开数据，不参与波动判断。其他产品进入异常或极端分位时，显示精确历史分位；市场共振比较产品与主要基准、宽市场的相对差值，两项同时异常时保留绝对差值较大者。缺失日期不使用临近数据替代。</p></article>`;
}

function advisoryComponentEntries(accountSnapshots, assetId) {
  return accountSnapshots.map((snapshot) => snapshot.accounts?.[0]?.components?.find((item) => item.asset_id === assetId));
}

function renderAdvisoryHistory(accountSnapshots, volatilityIndex) {
  const root = document.querySelector("#advisory-history");
  const latestAccount = accountSnapshots.at(-1)?.accounts?.[0];
  if (!latestAccount) {
    root.innerHTML = '<article class="data-group panel empty-account"><p>尚无投顾服务产品历史快照。</p></article>';
    return;
  }
  const dates = accountSnapshots.map((snapshot) => snapshot.reference_date);
  const rows = sortByWeight(latestAccount.components, (component) => component.account_weight).map((component) => {
    const entries = advisoryComponentEntries(accountSnapshots, component.asset_id);
    const metrics = calculateFiveDay(entries, component.asset_id, volatilityIndex);
    const cells = entries.map((item, index) => {
      const daily = savedProductClassification(item, component.asset_id, "daily", volatilityIndex);
      return `<td class="history-value ${index === 0 ? "movement-start " : ""}${returnClass(item?.daily_return)} ${rowClass(daily.level)}">${formatAccountDaily(item)}</td>`;
    }).join("");
    return `<tr><td><strong>${component.name}</strong><span class="symbol">${component.symbol}</span></td>${cells}<td class="history-cumulative ${returnClass(metrics.cumulative)}">${formatPercent(metrics.cumulative)}</td><td class="history-description">${renderProductVolatility(metrics.classification)}</td><td class="resonance-cell">${renderMarketResonance(metrics.resonance)}</td></tr>`;
  }).join("");
  const accountEntries = accountSnapshots.map((snapshot) => snapshot.accounts?.[0]).filter(Boolean);
  const accountComplete = accountEntries.length === 5 && accountEntries.every((item) => Number.isFinite(item.daily_return));
  const accountCumulative = accountComplete ? accountEntries.reduce((result, item) => result * (1 + item.daily_return), 1) - 1 : null;
  root.innerHTML = `<article class="data-group panel history-group advisory-history-card"><div class="group-heading"><div><h3>投顾服务产品</h3><p>${accountComplete ? `账户5日累计 ${formatPercent(accountCumulative)}` : `已积累 ${accountEntries.length}/5 个账户日期，暂不计算完整累计`}</p></div><span>${latestAccount.components.length} 项</span></div><div class="table-wrap"><table><thead><tr><th>内部基金</th>${dates.map((date, index) => `<th class="${index === 0 ? "movement-start" : ""}">${date.slice(5)}</th>`).join("")}<th>5日累计</th><th>产品波动</th><th>市场共振</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
}

function portfolioDisplaySnapshot(portfolioSnapshot) {
  const order = new Map(portfolioCategoryOrder.map((id, index) => [id, index]));
  const topLevel = portfolioSnapshot.top_level
    .map((item, sourceIndex) => ({
      ...item,
      name: portfolioCategoryLabels[item.id] ?? item.name,
      sourceIndex,
    }))
    .sort((left, right) => (order.get(left.id) ?? 99) - (order.get(right.id) ?? 99) || left.sourceIndex - right.sourceIndex)
    .map(({ sourceIndex, ...item }) => item);
  const lookthrough = Object.fromEntries(Object.entries(portfolioSnapshot.lookthrough ?? {}).map(([id, detail]) => {
    const groupKey = detail.type === "advisory_account" ? "buckets" : "groups";
    const detailGroups = sortByWeight(detail[groupKey] ?? [], (group) => group.weight).map((group) => ({
      ...group,
      components: sortByWeight(group.components ?? [], (component) => component.weight),
    }));
    return [id, { ...detail, [groupKey]: detailGroups }];
  }));
  return { ...portfolioSnapshot, top_level: topLevel, lookthrough };
}

function renderDaily(snapshot, assets, volatilityIndex) {
  const dailyGroups = buildDailyGroups(snapshot, assets, volatilityIndex);
  document.querySelector("#daily-groups").innerHTML = dailyGroups.map((group) => {
    const rows = group.rows.map(({ asset, item, classification, resonance }) => `<tr class="${rowClass(classification.level)}"><td><strong>${asset.name}</strong><span class="symbol">${asset.symbol}</span></td><td class="movement-value movement-start ${returnClass(item?.daily_return)}">${formatPercent(item?.daily_return)}</td><td class="description-cell">${renderProductVolatility(classification)}</td><td class="resonance-cell">${renderMarketResonance(resonance)}</td><td class="holding-return ${returnClass(item?.holding?.return)}">${formatHolding(item?.holding)}</td><td class="holding-weight">${formatWeight(item?.holding)}</td></tr>`).join("");
    return `<article class="data-group panel"><div class="group-heading"><div><h3>${group.label}</h3><p>${group.description}</p></div><span>${group.rows.length} 项</span></div><div class="table-wrap"><table class="daily-table"><thead><tr><th>产品名称</th><th class="movement-start">日涨跌幅</th><th>产品波动</th><th>市场共振</th><th>持仓收益</th><th>持仓占比</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
  }).join("");
}

function renderHistory(snapshots, assets, volatilityIndex) {
  const dates = snapshots.map((snapshot) => snapshot.reference_date);
  const observationsByDate = new Map(snapshots.map((snapshot) => [snapshot.reference_date, new Map(snapshot.observations.map((item) => [item.asset_id, item]))]));
  const latestObservations = observationsByDate.get(dates.at(-1)) ?? new Map();
  document.querySelector("#history-groups").innerHTML = groups.map((group) => {
    const groupAssets = sortByWeight(
      assets.filter(group.matches),
      (asset) => latestObservations.get(asset.id)?.holding?.group_weight,
    );
    const rows = groupAssets.map((asset) => {
      const entries = dates.map((date) => observationsByDate.get(date)?.get(asset.id));
      const metrics = calculateFiveDay(entries, asset.id, volatilityIndex);
      const cells = entries.map((item, index) => {
        if (!item || !Number.isFinite(item.daily_return)) return `<td class="history-missing ${index === 0 ? "movement-start" : ""}">缺失</td>`;
        const daily = savedProductClassification(item, asset.id, "daily", volatilityIndex);
        return `<td class="history-value ${index === 0 ? "movement-start " : ""}${returnClass(item.daily_return)} ${rowClass(daily.level)}">${formatPercent(item.daily_return)}</td>`;
      }).join("");
      return `<tr><td><strong>${asset.name}</strong><span class="symbol">${asset.symbol}</span></td>${cells}<td class="history-cumulative ${returnClass(metrics.cumulative)}">${formatPercent(metrics.cumulative)}</td><td class="history-description">${renderProductVolatility(metrics.classification)}</td><td class="resonance-cell">${renderMarketResonance(metrics.resonance)}</td></tr>`;
    }).join("");
    return `<article class="data-group panel history-group"><div class="group-heading"><div><h3>${group.label}</h3><p>${group.description}</p></div></div><div class="table-wrap"><table><thead><tr><th>产品名称</th>${dates.map((date, index) => `<th class="${index === 0 ? "movement-start" : ""}">${date.slice(5)}</th>`).join("")}<th>5日累计</th><th>产品波动</th><th>市场共振</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
  }).join("");
}

function portfolioReturnState(item) {
  if (!Number.isFinite(item?.holding_return)) return "unavailable";
  if (item.holding_return > 0) return "gain";
  if (item.holding_return < 0) return "loss";
  return "flat";
}

function holdingReturnContext(item) {
  if (!Number.isFinite(item?.holding_return)) return "持仓收益不可比";
  const coverage = Number.isFinite(item.holding_return_coverage) && item.holding_return_coverage < 0.999
    ? ` · 收益覆盖 ${formatPlainPercent(item.holding_return_coverage)}`
    : "";
  const estimated = item.holding_return_status === "estimated" ? " · 账户估算" : "";
  return `持仓收益 ${formatPercent(item.holding_return)}${coverage}${estimated}`;
}

function renderPortfolioMap(portfolioSnapshot, activeId) {
  const root = document.querySelector("#portfolio-map");
  root.innerHTML = portfolioSnapshot.top_level.map((item, index) => {
    const selected = item.id === activeId;
    return `<button type="button" class="portfolio-tile portfolio-${portfolioReturnState(item)}" data-portfolio-region="${item.id}" aria-pressed="${selected}" style="--portfolio-share:${Math.max(item.actual_weight * 100, 10)};--portfolio-order:${index}"><span class="portfolio-tile-name">${item.name}</span><strong>${formatPlainPercent(item.actual_weight)}</strong><small>${holdingReturnContext(item)}</small></button>`;
  }).join("");
}

function renderAllocationComparison(portfolioSnapshot) {
  document.querySelector("#allocation-comparison").innerHTML = `<div class="allocation-comparison-list">${portfolioSnapshot.top_level.map((item) => `<div class="allocation-comparison-row"><div class="allocation-row-label"><strong>${item.name}</strong><span>实际 ${formatPlainPercent(item.actual_weight)} · 目标 ${formatPlainPercent(item.target_weight)}</span></div><div class="allocation-track" role="img" aria-label="${item.name}实际比例${formatPlainPercent(item.actual_weight)}，目标比例${formatPlainPercent(item.target_weight)}"><span class="allocation-actual" style="width:${item.actual_weight * 100}%"></span><i class="allocation-target" style="left:${item.target_weight * 100}%"></i></div><span class="allocation-delta ${item.actual_weight >= item.target_weight ? "is-over" : "is-under"}">${formatWeightDelta(item.actual_weight, item.target_weight)}</span></div>`).join("")}</div><div class="comparison-legend"><span><i class="legend-actual"></i>实际比例</span><span><i class="legend-target"></i>目标比例</span></div>`;
}

function renderRegionReturns(portfolioSnapshot) {
  const values = portfolioSnapshot.top_level.map((item) => Math.abs(item.holding_return ?? 0));
  const maxMagnitude = Math.max(...values, 0.01);
  document.querySelector("#region-return-chart").innerHTML = `<div class="region-return-list">${portfolioSnapshot.top_level.map((item) => {
    const magnitude = Number.isFinite(item.holding_return) ? Math.abs(item.holding_return) / maxMagnitude * 50 : 0;
    const state = portfolioReturnState(item);
    return `<div class="region-return-row"><div class="return-row-label"><strong>${item.name}</strong><span>${Number.isFinite(item.holding_return_coverage) && item.holding_return_coverage < 0.999 ? `覆盖 ${formatPlainPercent(item.holding_return_coverage)}` : item.holding_return_status === "estimated" ? "账户估算" : "完整口径"}</span></div><div class="region-return-track"><i class="return-zero"></i>${Number.isFinite(item.holding_return) ? `<span class="region-return-fill is-${state}" style="--return-width:${magnitude}%"></span>` : ""}</div><span class="region-return-value ${returnClass(item.holding_return)}">${formatPercent(item.holding_return)}</span></div>`;
  }).join("")}</div>`;
}

function renderDetailComponent(component, shareLabel) {
  const returnText = component.holding_return_status === "historical_cost_recovered"
    ? "历史交易已收回投入"
    : formatPercent(component.holding_return);
  const returnLabel = "持仓收益";
  return `<li><span class="detail-product"><strong>${component.name}</strong><small>${component.symbol}</small></span><span><small>${shareLabel}</small><strong>${formatPlainPercent(component.weight)}</strong></span><span><small>${returnLabel}</small><strong class="${returnClass(component.holding_return)}">${returnText}</strong></span></li>`;
}

function renderPortfolioDetail(portfolioSnapshot, regionId) {
  const region = portfolioSnapshot.top_level.find((item) => item.id === regionId) ?? portfolioSnapshot.top_level[0];
  const detail = portfolioSnapshot.lookthrough[region.id];
  document.querySelector("#portfolio-detail-title").textContent = region.name;
  document.querySelector("#portfolio-detail-note").textContent = `实际 ${formatPlainPercent(region.actual_weight)} · 目标 ${formatPlainPercent(region.target_weight)} · ${holdingReturnContext(region)}`;
  const groupsToRender = detail.type === "advisory_account" ? detail.buckets : detail.groups;
  const shareLabel = detail.type === "advisory_account" ? "账户内占比" : "区域内占比";
  const content = groupsToRender.map((group) => `<section class="detail-group"><header><div><strong>${group.name}</strong><span>${shareLabel} ${formatPlainPercent(group.weight)}</span></div><div><small>分组持仓收益</small><strong class="${returnClass(group.holding_return)}">${formatPercent(group.holding_return)}</strong></div></header><ul>${group.components.map((component) => renderDetailComponent(component, shareLabel)).join("")}</ul></section>`).join("");
  const note = region.id === "advisory"
    ? "投顾服务产品在全局只计算一次。内部基金比例仅用于穿透查看，不与一级产品重复加总。"
    : region.id === "active_equity"
      ? "港股与美股先按同日汇率折算成人民币再计算比例。"
      : "区域持仓收益仅展示百分比结果。";
  document.querySelector("#portfolio-detail").innerHTML = `<div class="detail-summary"><span>实际占比<strong>${formatPlainPercent(region.actual_weight)}</strong></span><span>目标占比<strong>${formatPlainPercent(region.target_weight)}</strong></span><span>持仓收益<strong class="${returnClass(region.holding_return)}">${formatPercent(region.holding_return)}</strong></span></div><div class="detail-groups">${content}</div><p class="portfolio-method-note">${note}</p>`;
}

function renderPortfolioMeta(portfolioSnapshot) {
  document.querySelector("#global-title").textContent = `截至${formatChineseDate(portfolioSnapshot.reference_date)}的持仓全貌`;
  const items = [
    `估值日 ${portfolioSnapshot.reference_date}`,
    `${portfolioSnapshot.coverage.valued_positions}/${portfolioSnapshot.coverage.positions_total} 个持仓计价完成`,
  ];
  document.querySelector("#portfolio-meta").innerHTML = items.map((text) => `<li>${text}</li>`).join("");
}

function renderGlobal(portfolioSnapshot) {
  const displaySnapshot = portfolioDisplaySnapshot(portfolioSnapshot);
  let activeId = displaySnapshot.top_level[0]?.id;
  const selectRegion = (regionId) => {
    activeId = regionId;
    renderPortfolioMap(displaySnapshot, activeId);
    renderPortfolioDetail(displaySnapshot, activeId);
  };
  renderPortfolioMeta(displaySnapshot);
  renderAllocationComparison(displaySnapshot);
  renderRegionReturns(displaySnapshot);
  selectRegion(activeId);
  document.querySelector("#portfolio-map").addEventListener("click", (event) => {
    const button = event.target.closest("[data-portfolio-region]");
    if (button) selectRegion(button.dataset.portfolioRegion);
  });
}

function requestedView() {
  const name = window.location.hash.slice(1);
  return viewNames.has(name) ? name : "daily";
}

function activateView(name = requestedView()) {
  const activeName = viewNames.has(name) ? name : "daily";
  document.querySelectorAll("[data-view-panel]").forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== activeName; });
  document.querySelectorAll("[data-view-target]").forEach((tab) => {
    if (tab.dataset.viewTarget === activeName) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
  const titles = { daily: document.querySelector("#page-title")?.textContent ?? "每日更新", "five-day": "近 5 日更新", global: "全局概览" };
  document.title = `Neophyte · ${titles[activeName]}`;
}

function setViewSummaries(snapshots, assets, accountSnapshot, volatilityIndex, portfolioSnapshot) {
  const first = snapshots.at(0)?.reference_date;
  const latest = snapshots.at(-1)?.reference_date;
  if (first && latest) document.querySelector("#history-range").textContent = `${formatChineseDate(first)}至${formatChineseDate(latest)}`;
  document.querySelector("#global-summary").textContent = portfolioSnapshot
    ? "按实际比例查看四个一级区域；投顾服务产品内部持仓只作穿透，不重复计入全局"
    : "组合快照尚未生成";
  document.querySelector("#baseline-note").textContent = `产品自身历史分位 · AkShare基准截至 ${volatilityIndex.baseline_as_of}`;
}

function setUpdateState(manifest, snapshot) {
  const root = document.querySelector("#update-state");
  root.classList.add(manifest.last_run?.status === "success" ? "is-success" : "is-issue");
  document.querySelector("#update-label").textContent = manifest.last_run?.status === "success" ? "数据与描述已更新" : "部分数据需要检查";
  document.querySelector("#page-title").textContent = `${formatChineseDate(snapshot.reference_date)}发生了什么`;
}

async function loadJson(relativePath) {
  const response = await fetch(relativePath, { cache: "no-store" });
  if (!response.ok) throw new Error(`无法读取 ${relativePath}`);
  return response.json();
}

async function main() {
  try {
    const [watchlist, volatilityIndex, manifest] = await Promise.all([
      loadJson(paths.watchlist),
      loadJson(paths.volatilityIndex),
      loadJson(paths.manifest),
    ]);
    const assets = watchlist.assets.filter((asset) => asset.monitoring_enabled);
    const snapshots = await Promise.all((manifest.snapshots ?? []).slice(-5).map((relativePath) => loadJson(`${dataRoot}${relativePath}`)));
    const accountSnapshots = await Promise.all((manifest.account_snapshots ?? []).slice(-5).map((relativePath) => loadJson(`${dataRoot}${relativePath}`)));
    const portfolioSnapshot = manifest.latest_portfolio_snapshot
      ? await loadJson(`${dataRoot}${manifest.latest_portfolio_snapshot}`)
      : null;
    const latest = snapshots.at(-1);
    const latestAccountSnapshot = accountSnapshots.at(-1) ?? null;
    if (!latest) throw new Error("尚无每日快照");
    setUpdateState(manifest, latest);
    renderOverview(latest);
    renderFiveDayOverview(latest);
    renderAdvisoryDaily(latestAccountSnapshot, volatilityIndex);
    renderDaily(latest, assets, volatilityIndex);
    renderAdvisoryHistory(accountSnapshots, volatilityIndex);
    renderHistory(snapshots, assets, volatilityIndex);
    if (portfolioSnapshot) renderGlobal(portfolioSnapshot);
    setViewSummaries(snapshots, assets, latestAccountSnapshot, volatilityIndex, portfolioSnapshot);
    activateView();
  } catch (error) {
    document.querySelector("#update-state").classList.add("is-issue");
    document.querySelector("#update-label").textContent = "本地数据读取失败";
    document.querySelector("#overview-list").innerHTML = `<li class="overview-item overview-conflict"><span class="overview-marker"></span><span>${error.message}。请从项目根目录运行 python3 serve.py。</span></li>`;
    document.querySelector("#five-day-overview-list").innerHTML = `<li class="overview-item overview-conflict"><span class="overview-marker"></span><span>近5日概览暂不可用。</span></li>`;
    activateView("daily");
  }
}

if (window.location.protocol !== "file:") {
  window.addEventListener("hashchange", () => activateView());
  activateView();
  main();
}
