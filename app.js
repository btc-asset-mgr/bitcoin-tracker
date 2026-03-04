// ── 持仓配置 ──
const PORTFOLIO = {
  investmentCNY: 153900,
  investmentUSD: 21170.56,
  btcAmount:     0.1050,
  avgCost:       91686.00,
  entryDate:     "2025-08-05",
  cnyRate:       7.27
};

// 主力：Binance（无 CORS、无频率限制）
const BINANCE_TICKER   = "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT";
const BINANCE_KLINES   = "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=31";

// 备用：CoinGecko
const COINGECKO_PRICE    = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_7d_change=true&include_market_cap=true&include_24hr_vol=true";
const COINGECKO_DETAIL   = "https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false";
const COINGECKO_GLOBAL   = "https://api.coingecko.com/api/v3/global";
const COINGECKO_HISTORY  = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range?vs_currency=usd&precision=2";
const COINGECKO_30D      = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=30&interval=daily";
const FEAR_GREED_API     = "https://api.alternative.me/fng/?limit=1&format=json";

let btcPrice = null;
let btcData  = null;
let pnlChart = null;
let priceChart = null;
let cnyRate  = 7.27;

// ── 工具函数 ──
function fmtUSD(v) { return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtCNY(v) { return "¥" + v.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtPct(v) { return (v >= 0 ? "+" : "") + v.toFixed(2) + "%"; }
function fmtB(v) {
  if (v >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9)  return "$" + (v / 1e9).toFixed(2) + "B";
  return "$" + v.toLocaleString();
}
function colorClass(v) { return v >= 0 ? "profit" : "loss"; }
function arrow(v) { return v >= 0 ? "▲" : "▼"; }
function calcDays() { return Math.floor((new Date() - new Date(PORTFOLIO.entryDate)) / 86400000); }

// ── 持仓渲染 ──
function renderPortfolio(price) {
  const currentValue = PORTFOLIO.btcAmount * price;
  const pnlUSD       = currentValue - PORTFOLIO.investmentUSD;
  const pnlPct       = (pnlUSD / PORTFOLIO.investmentUSD) * 100;
  const currentCNY   = currentValue * cnyRate;
  const pnlCNY       = pnlUSD * cnyRate;
  const roi          = (currentValue / PORTFOLIO.investmentUSD) * 100;
  const pnlClass     = colorClass(pnlUSD);
  const days         = calcDays();
  const todayPnlUSD  = btcData ? (PORTFOLIO.btcAmount * price * (btcData.usd_24h_change / 100)) : 0;

  // 概览卡片
  set("ovCurrentValue",    fmtUSD(currentValue));
  set("ovCurrentValueCNY", "≈ " + fmtCNY(currentCNY));
  setClass("ovPnl",    "ov-value " + pnlClass, (pnlUSD >= 0 ? "+" : "") + fmtUSD(pnlUSD));
  setClass("ovPnlPct", "ov-sub "   + pnlClass, fmtPct(pnlPct) + " · " + (pnlUSD >= 0 ? "+" : "") + fmtCNY(pnlCNY));

  // 风险指标
  const bd = ((price - PORTFOLIO.avgCost) / PORTFOLIO.avgCost) * 100;
  setClass("riskTodayPnl",    "rk-val " + colorClass(todayPnlUSD),
    (todayPnlUSD >= 0 ? "+" : "") + fmtUSD(todayPnlUSD));
  const todayPct = btcData ? btcData.usd_24h_change : 0;
  setClass("riskTodayPnlPct", "rk-sub " + colorClass(todayPct),
    (todayPct >= 0 ? "+" : "") + (todayPct || 0).toFixed(2) + "%");
  set("riskDays", days + " 天");
  setClass("riskBreakevenGap", "rk-sub " + colorClass(bd),
    (bd >= 0 ? "高于均价 +" : "低于均价 ") + Math.abs(bd).toFixed(2) + "%");
  // 最大回撤：以均价为基准，历史最低估算（BTC近期低点约 $75,000）
  const histLow = 75000;
  const maxDD = ((histLow - PORTFOLIO.avgCost) / PORTFOLIO.avgCost) * 100;
  setClass("riskMaxDD", "rk-val loss", fmtPct(maxDD));
  setClass("riskRoi", "rk-val " + pnlClass, fmtPct(pnlPct));

  // 详情表格
  set("detailBtcPrice", fmtUSD(price));
  setHTML("detailCurrentValue", fmtUSD(currentValue) + ' <span class="cny-tag">≈ ' + fmtCNY(currentCNY) + "</span>");
  setClass("detailPnl", "detail-value " + pnlClass, (pnlUSD >= 0 ? "+" : "") + fmtUSD(pnlUSD) + " (" + fmtPct(pnlPct) + ")");
  setClass("detailRoi", "detail-value " + pnlClass, roi.toFixed(2) + "%");
  set("detailDays", days + " 天");
  setClass("detailBreakevenDiff", "detail-value " + colorClass(bd),
    (bd >= 0 ? "高于 +" : "低于 ") + Math.abs(bd).toFixed(2) + "%");

  // 价格目标进度
  renderTargets(price);

  // 导航栏下拉面板
  updateNavDropdown(price, pnlUSD, pnlPct, todayPnlUSD, currentCNY, days);

  if (!pnlChart)   fetchHistoryAndRenderPnlChart();
  if (!priceChart) fetchAndRenderPriceChart();
}

function set(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function setHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
function setClass(id, cls, text) { const el = document.getElementById(id); if (el) { el.className = cls; el.textContent = text; } }

// ── 价格目标进度条 ──
function renderTargets(price) {
  [{ id: "105", t: 105000 }, { id: "150", t: 150000 }, { id: "200", t: 200000 }].forEach(({ id, t }) => {
    const pct  = Math.min(100, (price / t) * 100);
    const diff = ((price - t) / t) * 100;
    const fill = document.getElementById("prog" + id);
    const lbl  = document.getElementById("pct" + id);
    if (fill) fill.style.width = pct.toFixed(1) + "%";
    if (lbl) {
      lbl.textContent = price >= t ? "✅ 已超越 " + fmtPct(Math.abs(diff)) : "还差 " + Math.abs(diff).toFixed(1) + "%";
      lbl.className = "target-pct " + (price >= t ? "profit" : "");
    }
  });
}

// ── 实时价格（主：Binance，备：CoinGecko）──
async function fetchPrice() {
  const statusEl = document.getElementById("priceStatus");
  statusEl.textContent = "● 连接中";
  statusEl.className = "badge badge-loading";

  // 先尝试 Binance
  try {
    const res = await fetch(BINANCE_TICKER, { cache: "no-store" });
    if (!res.ok) throw new Error("binance " + res.status);
    const d = await res.json();

    btcPrice   = parseFloat(d.lastPrice);
    const ch24 = parseFloat(d.priceChangePercent);
    const high = parseFloat(d.highPrice);
    const low  = parseFloat(d.lowPrice);
    const open = parseFloat(d.openPrice);
    const vol  = parseFloat(d.quoteVolume);
    const cap  = btcPrice * 19851093;

    btcData = { usd_24h_change: ch24, usd_7d_change: null };

    set("btcPrice",    fmtUSD(btcPrice));
    setClass("btcChange", "price-change " + colorClass(ch24), arrow(ch24) + " " + fmtPct(ch24) + "  (24h)");
    set("btcChange7d", "");
    set("price24hHigh",  fmtUSD(high));
    set("price24hLow",   fmtUSD(low));
    set("price24hOpen",  fmtUSD(open));
    set("btcMarketCap",  fmtB(cap));
    set("btcVolume",     fmtB(vol));
    set("lastUpdated",   new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));

    statusEl.textContent = "● 实时";
    statusEl.className = "badge badge-live";
    renderPortfolio(btcPrice);
    return;
  } catch {}

  // 备用：CoinGecko
  try {
    const res  = await fetch(COINGECKO_PRICE, { cache: "no-store" });
    if (!res.ok) throw new Error("coingecko " + res.status);
    const data = await res.json();

    btcData  = data.bitcoin;
    btcPrice = data.bitcoin.usd;
    const ch24 = data.bitcoin.usd_24h_change ?? 0;
    const ch7d = data.bitcoin.usd_7d_change  ?? 0;

    set("btcPrice", fmtUSD(btcPrice));
    setClass("btcChange",   "price-change " + colorClass(ch24), arrow(ch24) + " " + fmtPct(ch24) + "  (24h)");
    setClass("btcChange7d", "price-change-tag " + (ch7d >= 0 ? "tag-profit" : "tag-loss"), arrow(ch7d) + " " + fmtPct(ch7d) + "  (7d)");
    if (data.bitcoin.usd_market_cap) set("btcMarketCap", fmtB(data.bitcoin.usd_market_cap));
    if (data.bitcoin.usd_24h_vol)    set("btcVolume",    fmtB(data.bitcoin.usd_24h_vol));
    set("lastUpdated", new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));

    statusEl.textContent = "● 实时";
    statusEl.className = "badge badge-live";
    renderPortfolio(btcPrice);
    return;
  } catch {}

  statusEl.textContent = "● 离线";
  statusEl.className = "badge badge-offline";
  if (!btcPrice) {
    btcPrice = 85000;
    set("btcPrice",  fmtUSD(btcPrice) + " *");
    set("btcChange", "网络暂不可用");
    set("lastUpdated", "离线模式");
    renderPortfolio(btcPrice);
  }
}

// ── 全局市场 ──
async function fetchGlobalData() {
  try {
    const res  = await fetch(COINGECKO_GLOBAL);
    if (!res.ok) return;
    const d = (await res.json()).data;
    const dom = d.market_cap_percentage?.btc;
    if (dom) set("btcDominance", dom.toFixed(1) + "%");
    const totalCap = d.total_market_cap?.usd;
    const capCh    = d.market_cap_change_percentage_24h_usd;
    if (totalCap) {
      set("globalMarketCap",    fmtB(totalCap));
      set("globalMarketCapSub", "全球加密货币总市值");
      if (capCh !== undefined)
        setClass("globalMarketCapTrend", "mk-trend " + colorClass(capCh), arrow(capCh) + " " + fmtPct(capCh) + " (24h)");
    }
  } catch {}
}

// ── BTC 详情（ATH）──
async function fetchBtcDetail() {
  try {
    const res  = await fetch(COINGECKO_DETAIL);
    if (!res.ok) return;
    const data = await res.json();
    const ath     = data.market_data?.ath?.usd;
    const athDate = data.market_data?.ath_date?.usd;
    const athDiff = data.market_data?.ath_change_percentage?.usd;
    if (ath) {
      set("btcAth", fmtUSD(ath));
      if (athDiff !== undefined)
        setClass("btcAthDiff", "ch-sub " + colorClass(athDiff), "距高点 " + athDiff.toFixed(1) + "%");
    }
  } catch {
    // 离线兜底
    set("btcAth", "~$109,114");
    set("btcAthDiff", "距高点 ~-38%");
  }
}

// ── 减半倒计时 ──
function renderHalvingCountdown() {
  // 第5次减半预计区块 1,050,000，当前约每10分钟一块
  // 第4次减半 (840,000块) 于 2024-04-19，此后继续增长
  const halvingBlock = 1050000;
  const fourthHalvingDate = new Date("2024-04-19T00:00:00Z");
  const fourthHalvingHeight = 840000;
  const minutesPerBlock = 10;
  const now = new Date();
  const minutesSinceFourth = (now - fourthHalvingDate) / 60000;
  const currentEstHeight = Math.floor(fourthHalvingHeight + minutesSinceFourth / minutesPerBlock);
  const blocksLeft = halvingBlock - currentEstHeight;
  const minutesLeft = blocksLeft * minutesPerBlock;
  const daysLeft = Math.floor(minutesLeft / 1440);
  const hoursLeft = Math.floor((minutesLeft % 1440) / 60);

  set("blockHeight", "~" + currentEstHeight.toLocaleString());
  if (blocksLeft > 0) {
    set("halvingCountdown", daysLeft + " 天 " + hoursLeft + " 时");
    set("halvingBlock", "预计区块 #" + halvingBlock.toLocaleString() + "（约剩 " + blocksLeft.toLocaleString() + " 块）");
  } else {
    set("halvingCountdown", "已完成");
    set("halvingBlock", "第5次减半已发生");
  }
}

// ── 恐贪指数 ──
async function fetchFearGreed() {
  try {
    const res  = await fetch(FEAR_GREED_API);
    if (!res.ok) return;
    const item = (await res.json()).data?.[0];
    if (!item) return;
    const score = parseInt(item.value, 10);
    document.getElementById("fgScore").textContent = score;
    const offset = 157 - (score / 100) * 157;
    const arc = document.getElementById("fgArc");
    arc.setAttribute("stroke-dashoffset", offset.toFixed(1));
    let color = score <= 25 ? "#ef5350" : score <= 45 ? "#ff7043" : score <= 55 ? "#ffd54f" : score <= 75 ? "#66bb6a" : "#26a69a";
    arc.setAttribute("stroke", color);
    document.getElementById("fgScore").setAttribute("fill", color);
    const map = { "Extreme Fear": "极度恐慌", "Fear": "恐慌", "Neutral": "中性", "Greed": "贪婪", "Extreme Greed": "极度贪婪" };
    const lbl = document.getElementById("fgLabel");
    lbl.textContent = map[item.value_classification] || item.value_classification;
    lbl.style.color = color;
    const ts = item.timestamp;
    const d  = ts ? new Date(parseInt(ts) * 1000) : new Date();
    set("fgUpdate", d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) + " 更新");
  } catch {}
}

// ── CNY 汇率 ──
async function fetchCnyRate() {
  try {
    const res  = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=cny");
    if (!res.ok) return;
    const rate = (await res.json())?.tether?.cny;
    if (rate && rate > 6 && rate < 9) {
      cnyRate = rate;
      set("cnyRateDisplay", "¥" + rate.toFixed(4));
    }
  } catch {}
}

// ── 市场资讯（分类标签）──
const NEWS_DATA = [
  { cat: "market", icon: "📊", tag: "行情", title: `BTC 实时价格更新`, body: `当前价格动态，24小时成交活跃，流动性充裕`, time: "实时" },
  { cat: "etf",    icon: "🏦", tag: "ETF",  title: "比特币现货 ETF 净流入持续", body: "BlackRock IBIT 等机构 ETF 持续获得资金净流入，机构采纳趋势加速", time: "今日" },
  { cat: "macro",  icon: "🇺🇸", tag: "宏观", title: "美联储利率政策影响加密市场", body: "降息预期升温，风险资产受益，比特币与纳斯达克相关性增强", time: "今日" },
  { cat: "onchain",icon: "⛓️", tag: "链上", title: "长期持有者持仓比例维持高位", body: "链上数据显示 HODLer 未见明显抛售，供应稀缺性持续", time: "今日" },
  { cat: "market", icon: "📈", tag: "行情", title: "BTC 七日涨跌幅追踪", body: "本周价格走势呈震荡整理态势，关键支撑位受到多次检验", time: "本周" },
  { cat: "onchain",icon: "⛏️", tag: "链上", title: "全网算力创历史新高 850 EH/s", body: "矿工算力持续扩张，显示对长期价格预期的信心", time: "本周" },
  { cat: "etf",    icon: "💼", tag: "ETF",  title: "机构持仓报告更新", body: "多家上市公司 Q4 财报披露 BTC 储备，企业级采纳加速推进", time: "本周" },
  { cat: "macro",  icon: "🌐", tag: "宏观", title: "全球加密资产监管框架逐步明朗", body: "各主要经济体监管政策趋向清晰，合规通道逐步打通", time: "本周" },
  { cat: "onchain",icon: "🔐", tag: "链上", title: "比特币网络安全性达历史峰值", body: "全网哈希率持续攀升，51% 攻击成本超 $200 亿，安全性极高", time: "本月" },
  { cat: "market", icon: "💡", tag: "行情", title: "减半效应：历史规律与周期分析", body: "第四次减半已于 2024-04-19 完成，历史显示减半后 12-18 月通常迎来牛市高点", time: "本月" },
];

let currentNewsFilter = "all";

function renderMarketNews(filter) {
  if (filter !== undefined) currentNewsFilter = filter;
  const price = btcPrice || 85000;
  const now = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  const filtered = NEWS_DATA.filter(n => currentNewsFilter === "all" || n.cat === currentNewsFilter);
  const items = filtered.map(n => `
    <div class="news-item" data-cat="${n.cat}">
      <div class="news-item-left">
        <span class="news-cat-tag cat-${n.cat}">${n.tag}</span>
        <span class="news-icon">${n.icon}</span>
      </div>
      <div class="news-item-body">
        <div class="news-title">${n.title}${n.cat === "market" && n.time === "实时" ? " " + fmtUSD(price) : ""}</div>
        <div class="news-text">${n.body}</div>
      </div>
      <span class="news-time">${n.time}</span>
    </div>`).join("");
  const el = document.getElementById("marketNews");
  if (el) el.innerHTML = items || '<div class="news-loading">暂无该分类资讯</div>';
}

function initNewsFilter() {
  document.querySelectorAll(".news-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".news-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderMarketNews(btn.dataset.cat);
    });
  });
}

// ── 历史盈亏图 ──
async function fetchHistoryAndRenderPnlChart() {
  const entryTs = Math.floor(new Date(PORTFOLIO.entryDate).getTime() / 1000);
  const nowTs   = Math.floor(Date.now() / 1000);
  try {
    const res  = await fetch(`${COINGECKO_HISTORY}&from=${entryTs}&to=${nowTs}`);
    if (!res.ok) throw new Error();
    const prices  = (await res.json()).prices;
    const step    = Math.max(1, Math.floor(prices.length / 30));
    const sampled = prices.filter((_, i) => i % step === 0 || i === prices.length - 1);
    const labels  = sampled.map(([ts]) => new Date(ts).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }));
    const pnlData = sampled.map(([, p]) => +((PORTFOLIO.btcAmount * p - PORTFOLIO.investmentUSD).toFixed(2)));
    renderPnlChart(labels, pnlData);
  } catch {
    const el = document.getElementById("pnlChart");
    if (el) el.parentElement.innerHTML = '<p style="color:#64748b;text-align:center;padding:20px;font-size:0.82rem;">历史数据加载失败，请刷新重试</p>';
  }
}

function renderPnlChart(labels, pnlData) {
  const ctx = document.getElementById("pnlChart").getContext("2d");
  const colors = pnlData.map(v => v >= 0 ? "rgba(38,166,154,0.85)" : "rgba(239,83,80,0.85)");
  if (pnlChart) { pnlChart.data.labels = labels; pnlChart.data.datasets[0].data = pnlData; pnlChart.data.datasets[0].backgroundColor = colors; pnlChart.update(); return; }
  pnlChart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "未实现盈亏 (USD)", data: pnlData, backgroundColor: colors, borderRadius: 3, borderSkipped: false }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => (c.raw >= 0 ? "盈利: +" : "亏损: ") + fmtUSD(c.raw) } } },
      scales: {
        x: { ticks: { color: "#64748b", font: { size: 10 }, maxRotation: 45 }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { ticks: { color: "#64748b", font: { size: 10 }, callback: v => (v >= 0 ? "+" : "") + "$" + v.toLocaleString() }, grid: { color: "rgba(255,255,255,0.04)" } }
      }
    }
  });
}

// ── 近30天价格趋势图（主：Binance K线，备：CoinGecko）──
async function fetchAndRenderPriceChart() {
  // Binance K线
  try {
    const res  = await fetch(BINANCE_KLINES, { cache: "no-store" });
    if (!res.ok) throw new Error();
    const rows = await res.json();
    const labels = rows.map(r => new Date(r[0]).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }));
    const vals   = rows.map(r => parseFloat(r[4])); // 收盘价
    renderPriceChart(labels, vals);
    return;
  } catch {}

  // CoinGecko 备用
  try {
    const res  = await fetch(COINGECKO_30D, { cache: "no-store" });
    if (!res.ok) throw new Error();
    const prices  = (await res.json()).prices;
    const step    = Math.max(1, Math.floor(prices.length / 30));
    const sampled = prices.filter((_, i) => i % step === 0 || i === prices.length - 1);
    const labels  = sampled.map(([ts]) => new Date(ts).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }));
    const vals    = sampled.map(([, p]) => p);
    renderPriceChart(labels, vals);
  } catch {
    const el = document.getElementById("priceChart");
    if (el) el.parentElement.innerHTML = '<p style="color:#64748b;text-align:center;padding:20px;font-size:0.82rem;">价格趋势数据加载失败</p>';
  }
}

function renderPriceChart(labels, prices) {
  const ctx    = document.getElementById("priceChart").getContext("2d");
  const rising = prices[prices.length - 1] >= prices[0];
  const grad   = ctx.createLinearGradient(0, 0, 0, 220);
  grad.addColorStop(0, rising ? "rgba(38,166,154,0.3)" : "rgba(239,83,80,0.3)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  if (priceChart) { priceChart.data.labels = labels; priceChart.data.datasets[0].data = prices; priceChart.update(); return; }
  priceChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: "BTC 价格 (USD)", data: prices, borderColor: rising ? "#26a69a" : "#ef5350", borderWidth: 2, backgroundColor: grad, fill: true, pointRadius: 0, pointHoverRadius: 4, tension: 0.4 }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => "价格: " + fmtUSD(c.raw) } } },
      scales: {
        x: { ticks: { color: "#64748b", font: { size: 10 }, maxRotation: 45 }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { ticks: { color: "#64748b", font: { size: 10 }, callback: v => "$" + v.toLocaleString() }, grid: { color: "rgba(255,255,255,0.04)" } }
      }
    }
  });
}

// ── 导航栏下拉面板数据同步 ──
function updateNavDropdown(price, pnlUSD, pnlPct, todayPnlUSD, currentCNY, days) {
  const currentValue = PORTFOLIO.btcAmount * price;
  set("ndNetWorth", fmtUSD(currentValue));
  setClass("ndTodayPnl", "nd-val " + colorClass(todayPnlUSD), (todayPnlUSD >= 0 ? "+" : "") + fmtUSD(todayPnlUSD));
  setClass("ndTotalPnl", "nd-val " + colorClass(pnlUSD), (pnlUSD >= 0 ? "+" : "") + fmtUSD(pnlUSD) + " (" + fmtPct(pnlPct) + ")");
  set("ndDays", days + " 天");
}

// ── 导航栏下拉 & 抽屉控制 ──
function initNavDropdown() {
  const btn      = document.getElementById("navAvatarBtn");
  const dropdown = document.getElementById("navDropdown");
  const wrap     = document.getElementById("navAccountWrap");
  if (!btn) return;

  btn.addEventListener("click", e => { e.stopPropagation(); dropdown.classList.toggle("nd-open"); });
  document.addEventListener("click", e => { if (!wrap.contains(e.target)) dropdown.classList.remove("nd-open"); });

  // 账户资料 & 交易记录 → 打开抽屉
  document.getElementById("ndProfileBtn")?.addEventListener("click", () => {
    dropdown.classList.remove("nd-open");
    openDrawer();
  });
}

function openDrawer() {
  document.getElementById("profileDrawer")?.classList.add("drawer-open");
  document.getElementById("drawerOverlay")?.classList.add("drawer-open");
  document.body.style.overflow = "hidden";
  updateBalanceCard();
}
function closeDrawer() {
  document.getElementById("profileDrawer")?.classList.remove("drawer-open");
  document.getElementById("drawerOverlay")?.classList.remove("drawer-open");
  document.body.style.overflow = "";
}

function initDrawer() {
  document.getElementById("drawerClose")?.addEventListener("click", closeDrawer);
  document.getElementById("drawerOverlay")?.addEventListener("click", closeDrawer);
  // 最后登录
  const now = new Date();
  set("drawerLastLogin",
    now.toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) + " " +
    now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
  );
}

// ── 虚拟交易记录 ──
// buy:     amount=花费USDT  btcQty=实际到账BTC  fee=手续费USDT(约0.1%)  price=成交均价
// sell:    amount=卖出所得USDT  btcQty=卖出BTC数量  fee=手续费USDT  price=成交均价
// deposit: amount=人民币金额  其余null
// costBasis: 卖出时对应的买入均价（用于计算已实现盈亏）
const TRANSACTIONS = [
  // ── 2025年7月 · 注册，先小额试水再递增入金，合计 ¥70,000 ──
  { id: "TXN-20250710-001", type: "deposit", date: "2025-07-10 10:22:15", amount: 5000,  price: null, btcQty: null, fee: 0, note: "首次入金试水" },
  { id: "TXN-20250722-002", type: "deposit", date: "2025-07-22 09:15:30", amount: 10000, price: null, btcQty: null, fee: 0, note: "追加充值" },
  { id: "TXN-20250728-003", type: "deposit", date: "2025-07-28 11:40:22", amount: 15000, price: null, btcQty: null, fee: 0, note: "追加充值" },
  { id: "TXN-20250802-004", type: "deposit", date: "2025-08-02 08:55:10", amount: 20000, price: null, btcQty: null, fee: 0, note: "追加充值" },
  { id: "TXN-20250804-005", type: "deposit", date: "2025-08-04 09:20:44", amount: 20000, price: null, btcQty: null, fee: 0, note: "建仓前追加" },
  // 累计入金 ¥70,000 → 换汇约 $9,628 USDT

  // ── 2025年8月～2026年2月 · 持续追加入金 ──
  { id: "TXN-20250814-D01", type: "deposit", date: "2025-08-14 21:34:02", amount: 3000,  price: null, btcQty: null, fee: 0, note: "追加充值" },
  { id: "TXN-20250901-D02", type: "deposit", date: "2025-09-01 17:49:09", amount: 2000,  price: null, btcQty: null, fee: 0, note: "追加充值" },
  { id: "TXN-20250908-D03", type: "deposit", date: "2025-09-08 16:48:18", amount: 3000,  price: null, btcQty: null, fee: 0, note: "追加充值" },
  { id: "TXN-20251008-D04", type: "deposit", date: "2025-10-08 09:54:37", amount: 3000,  price: null, btcQty: null, fee: 0, note: "追加充值" },
  { id: "TXN-20251009-D05", type: "deposit", date: "2025-10-09 20:00:06", amount: 2000,  price: null, btcQty: null, fee: 0, note: "追加充值" },
  { id: "TXN-20251015-D06", type: "deposit", date: "2025-10-15 18:49:28", amount: 3000,  price: null, btcQty: null, fee: 0, note: "追加充值" },
  { id: "TXN-20251109-D07", type: "deposit", date: "2025-11-09 19:13:34", amount: 3500,  price: null, btcQty: null, fee: 0, note: "追加充值" },
  { id: "TXN-20251208-D08", type: "deposit", date: "2025-12-08 19:15:12", amount: 3600,  price: null, btcQty: null, fee: 0, note: "追加充值" },
  { id: "TXN-20251214-D09", type: "deposit", date: "2025-12-14 19:03:04", amount: 300,   price: null, btcQty: null, fee: 0, note: "追加充值" },
  { id: "TXN-20260108-D10", type: "deposit", date: "2026-01-08 21:06:23", amount: 3000,  price: null, btcQty: null, fee: 0, note: "追加充值" },
  { id: "TXN-20260201-D11", type: "deposit", date: "2026-02-01 10:02:25", amount: 1500,  price: null, btcQty: null, fee: 0, note: "追加充值" },
  { id: "TXN-20260206-D12", type: "deposit", date: "2026-02-06 17:13:30", amount: 50000, price: null, btcQty: null, fee: 0, note: "大额追加充值" },
  { id: "TXN-20260213-D13", type: "deposit", date: "2026-02-13 16:05:39", amount: 3000,  price: null, btcQty: null, fee: 0, note: "追加充值" },
  { id: "TXN-20260216-D14", type: "deposit", date: "2026-02-16 21:25:56", amount: 2000,  price: null, btcQty: null, fee: 0, note: "追加充值" },
  // 新增入金合计 ¥83,900，累计总入金 ¥153,900

  // ── 2025年7月 · 小额试仓感受市场 ──
  { id: "TXN-20250712-006", type: "buy",  date: "2025-07-12 14:33:08", amount: 688.00,  price: 86000.00, btcQty: 0.00800000, fee: 0.69, note: "市价买入 · 小额试仓" },
  { id: "TXN-20250720-007", type: "sell", date: "2025-07-20 10:18:55", amount: 713.60,  price: 89200.00, btcQty: 0.00800000, fee: 0.71, note: "止盈出场", costBasis: 86000.00 },

  // ── 2025年8月 · 正式建仓 ──
  { id: "TXN-20250805-008", type: "buy",  date: "2025-08-05 09:48:33", amount: 7976.68, price: 91686.00, btcQty: 0.08700000, fee: 7.98, note: "市价买入 · 建仓" },
  { id: "TXN-20250814-009", type: "buy",  date: "2025-08-14 14:20:10", amount: 871.20,  price: 87120.00, btcQty: 0.01000000, fee: 0.87, note: "限价买入 · 回调抄底" },

  // ── 2025年9月 · ETF消息面追涨后止盈 ──
  { id: "TXN-20250905-010", type: "buy",  date: "2025-09-05 10:05:44", amount: 462.40,  price: 92480.00, btcQty: 0.00500000, fee: 0.46, note: "市价买入 · ETF利好追涨" },
  { id: "TXN-20250918-011", type: "sell", date: "2025-09-18 15:33:28", amount: 471.00,  price: 94200.00, btcQty: 0.00500000, fee: 0.47, note: "止盈出场", costBasis: 92480.00 },

  // ── 2025年10月 · 突破$100k，加仓后高位大幅减仓 ──
  { id: "TXN-20251003-012", type: "buy",  date: "2025-10-03 09:30:22", amount: 295.80,  price: 98600.00,  btcQty: 0.00300000, fee: 0.30, note: "限价买入 · 突破前低吸" },
  { id: "TXN-20251012-013", type: "buy",  date: "2025-10-12 11:40:07", amount: 305.40,  price: 101800.00, btcQty: 0.00300000, fee: 0.31, note: "市价买入 · 破十万追涨" },
  { id: "TXN-20251022-014", type: "sell", date: "2025-10-22 14:18:42", amount: 1567.50, price: 104500.00, btcQty: 0.01500000, fee: 1.57, note: "高位大幅减仓锁利", costBasis: 100200.00 },

  // ── 2025年11月 · 高位回落，止损+抄底 ──
  { id: "TXN-20251106-016", type: "buy",  date: "2025-11-06 10:30:22", amount: 288.60,  price: 96200.00, btcQty: 0.00300000, fee: 0.29, note: "限价买入 · 回调加仓" },
  { id: "TXN-20251119-017", type: "sell", date: "2025-11-19 15:44:08", amount: 459.00,  price: 91800.00, btcQty: 0.00500000, fee: 0.46, note: "跌破支撑线止损", costBasis: 96200.00 },
  { id: "TXN-20251126-018", type: "buy",  date: "2025-11-26 09:22:55", amount: 447.00,  price: 89400.00, btcQty: 0.00500000, fee: 0.45, note: "限价买入 · 超跌反弹布局" },

  // ── 2025年12月 · 筑底低位补仓 ──
  { id: "TXN-20251205-019", type: "buy",  date: "2025-12-05 11:10:33", amount: 262.80,  price: 87600.00, btcQty: 0.00300000, fee: 0.26, note: "市价买入 · 跟随大户加仓" },
  { id: "TXN-20251215-020", type: "buy",  date: "2025-12-15 14:05:17", amount: 1115.40, price: 85800.00, btcQty: 0.01300000, fee: 1.12, note: "限价买入 · 低位重仓补入" },
  { id: "TXN-20251223-021", type: "sell", date: "2025-12-23 10:50:44", amount: 887.00,  price: 88700.00, btcQty: 0.01000000, fee: 0.89, note: "反弹止盈", costBasis: 86700.00 },

  // ── 2026年1月 · 震荡高抛低吸 ──
  { id: "TXN-20260107-022", type: "buy",  date: "2026-01-07 10:08:41", amount: 432.00,  price: 86400.00, btcQty: 0.00500000, fee: 0.43, note: "限价买入 · 支撑位接货" },
  { id: "TXN-20260116-023", type: "sell", date: "2026-01-16 15:20:38", amount: 911.00,  price: 91100.00, btcQty: 0.01000000, fee: 0.91, note: "反弹止盈", costBasis: 86400.00 },
  { id: "TXN-20260123-024", type: "buy",  date: "2026-01-23 09:45:12", amount: 1092.00, price: 84000.00, btcQty: 0.01300000, fee: 1.09, note: "市价买入 · 恐慌期加仓" },

  // ── 2026年2月 · 跌破$80k深度布局 ──
  { id: "TXN-20260206-026", type: "buy",  date: "2026-02-06 11:15:09", amount: 399.00,  price: 79800.00, btcQty: 0.00500000, fee: 0.40, note: "限价买入 · 破八万抄底" },
  { id: "TXN-20260219-027", type: "buy",  date: "2026-02-19 14:30:55", amount: 228.00,  price: 76000.00, btcQty: 0.00300000, fee: 0.23, note: "限价买入 · 深跌再加" },
  { id: "TXN-20260226-028", type: "sell", date: "2026-02-26 10:22:17", amount: 390.00,  price: 78000.00, btcQty: 0.00500000, fee: 0.39, note: "止损控仓", costBasis: 77900.00 },

  // ── 2026年3月 · 持续抄底 ──
  { id: "TXN-20260303-029", type: "buy",  date: "2026-03-03 09:30:44", amount: 341.00,  price: 68200.00, btcQty: 0.00500000, fee: 0.34, note: "限价买入 · 大跌抄底" },
];

// ── 翻页状态 ──
let txCurrentPage = 1;
const TX_PAGE_SIZE = 8;
let txCurrentFilter = "all";

function renderTransactions(filter = "all", page = 1) {
  txCurrentFilter = filter;
  txCurrentPage   = page;

  const list    = document.getElementById("txList");
  const summary = document.getElementById("txSummary");
  if (!list) return;

  const sorted = [...TRANSACTIONS]
    .filter(t => filter === "all" || t.type === filter)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalPages = Math.ceil(sorted.length / TX_PAGE_SIZE);
  txCurrentPage = Math.min(Math.max(1, page), totalPages || 1);
  const paged = sorted.slice((txCurrentPage - 1) * TX_PAGE_SIZE, txCurrentPage * TX_PAGE_SIZE);

  const typeLabel = { buy: "买入", sell: "卖出", deposit: "充值" };

  list.innerHTML = paged.map(tx => {
    // 左侧方向图标
    const dirIcon = tx.type === "buy"
      ? `<svg class="tx-dir-icon tx-dir-buy" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 9l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : tx.type === "sell"
      ? `<svg class="tx-dir-icon tx-dir-sell" viewBox="0 0 16 16" fill="none"><path d="M8 13V3M3 7l5-5 5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg class="tx-dir-icon tx-dir-dep" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M4 7l4 4 4-4M2 13h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    if (tx.type === "deposit") {
      const usdt = (tx.amount / 7.27).toFixed(2);
      return `
      <div class="tx-row tx-row-deposit">
        <div class="tx-icon-wrap tx-deposit">${dirIcon}</div>
        <div class="tx-body">
          <div class="tx-main-row">
            <div class="tx-pair-col">
              <span class="tx-type-label tx-deposit">充值</span>
              <span class="tx-pair">CNY → USDT</span>
            </div>
            <div class="tx-qty-col">
              <div class="tx-qty-val tx-dep-color">+${parseFloat(usdt).toLocaleString("en-US", {minimumFractionDigits:2})} USDT</div>
              <div class="tx-qty-sub">≈ ¥${tx.amount.toLocaleString("zh-CN")}</div>
            </div>
          </div>
          <div class="tx-meta-row">
            <span class="tx-meta-item">${tx.note}</span>
            <span class="tx-meta-sep">·</span>
            <span class="tx-meta-item tx-date">${tx.date}</span>
            <span class="tx-meta-sep">·</span>
            <span class="tx-meta-item tx-id">${tx.id}</span>
            <span class="tx-status tx-done">✓ 已到账</span>
          </div>
        </div>
      </div>`;
    } else if (tx.type === "buy") {
      return `
      <div class="tx-row tx-row-buy">
        <div class="tx-icon-wrap tx-buy">${dirIcon}</div>
        <div class="tx-body">
          <div class="tx-main-row">
            <div class="tx-pair-col">
              <span class="tx-type-label tx-buy">买入</span>
              <span class="tx-pair">BTC / USDT</span>
            </div>
            <div class="tx-qty-col">
              <div class="tx-qty-val tx-buy-color">+${tx.btcQty.toFixed(8)} BTC</div>
              <div class="tx-qty-sub">花费 $${tx.amount.toLocaleString("en-US",{minimumFractionDigits:2})}</div>
            </div>
          </div>
          <div class="tx-detail-row">
            <div class="tx-detail-item"><span class="tx-d-label">均价</span><span class="tx-d-val">$${tx.price.toLocaleString("en-US",{minimumFractionDigits:2})}</span></div>
            <div class="tx-detail-item"><span class="tx-d-label">数量</span><span class="tx-d-val">${tx.btcQty.toFixed(8)}</span></div>
            <div class="tx-detail-item"><span class="tx-d-label">手续费</span><span class="tx-d-val">$${tx.fee.toFixed(4)}</span></div>
          </div>
          <div class="tx-meta-row">
            <span class="tx-meta-item">${tx.note}</span>
            <span class="tx-meta-sep">·</span>
            <span class="tx-meta-item tx-date">${tx.date}</span>
            <span class="tx-meta-sep">·</span>
            <span class="tx-meta-item tx-id">${tx.id}</span>
            <span class="tx-status tx-done">✓ 已成交</span>
          </div>
        </div>
      </div>`;
    } else {
      const received = (tx.amount - tx.fee).toFixed(2);
      let pnlBadgeHtml = "";
      let realizedPnlHtml = "";
      if (tx.costBasis) {
        const buyFeeEst = tx.costBasis * tx.btcQty * 0.001;
        const pnl = (tx.price - tx.costBasis) * tx.btcQty - tx.fee - buyFeeEst;
        const pnlPct = ((tx.price - tx.costBasis) / tx.costBasis) * 100;
        const isProfit = pnl >= 0;
        const sign = isProfit ? "+" : "";
        const pnlCls = isProfit ? "tx-pnl-profit" : "tx-pnl-loss";
        // 顶部盈亏徽章
        pnlBadgeHtml = `<span class="tx-pnl-badge ${isProfit ? "profit" : "loss"}">${isProfit ? "盈利" : "亏损"} ${sign}${pnlPct.toFixed(2)}%</span>`;
        realizedPnlHtml = `<div class="tx-detail-item"><span class="tx-d-label">已实现盈亏</span><span class="tx-d-val ${pnlCls}">${sign}$${pnl.toFixed(2)} (${sign}${pnlPct.toFixed(2)}%)</span></div>`;
      }
      return `
      <div class="tx-row tx-row-sell">
        <div class="tx-icon-wrap tx-sell">${dirIcon}</div>
        <div class="tx-body">
          <div class="tx-main-row">
            <div class="tx-pair-col">
              <span class="tx-type-label tx-sell">卖出</span>
              <span class="tx-pair">BTC / USDT</span>
            </div>
            <div class="tx-qty-col">
              <div class="tx-qty-val tx-sell-color">-${tx.btcQty.toFixed(8)} BTC</div>
              <div class="tx-qty-sub">到账 $${parseFloat(received).toLocaleString("en-US",{minimumFractionDigits:2})}</div>
            </div>
          </div>
          <div class="tx-detail-row">
            <div class="tx-detail-item"><span class="tx-d-label">成交价</span><span class="tx-d-val">$${tx.price.toLocaleString("en-US",{minimumFractionDigits:2})}</span></div>
            <div class="tx-detail-item"><span class="tx-d-label">数量</span><span class="tx-d-val">${tx.btcQty.toFixed(8)}</span></div>
            <div class="tx-detail-item"><span class="tx-d-label">手续费</span><span class="tx-d-val">$${tx.fee.toFixed(4)}</span></div>
            ${realizedPnlHtml}
          </div>
          ${pnlBadgeHtml ? `<div class="tx-pnl-row">${pnlBadgeHtml}</div>` : ""}
          <div class="tx-meta-row">
            <span class="tx-meta-item">${tx.note}</span>
            <span class="tx-meta-sep">·</span>
            <span class="tx-meta-item tx-date">${tx.date}</span>
            <span class="tx-meta-sep">·</span>
            <span class="tx-meta-item tx-id">${tx.id}</span>
            <span class="tx-status tx-done">✓ 已成交</span>
          </div>
        </div>
      </div>`;
    }
  }).join("");

  const buyTxs  = TRANSACTIONS.filter(t => t.type === "buy");
  const sellTxs = TRANSACTIONS.filter(t => t.type === "sell");
  const depTxs  = TRANSACTIONS.filter(t => t.type === "deposit");
  const totalFee = [...buyTxs, ...sellTxs].reduce((s, t) => s + t.fee, 0);
  summary.innerHTML = `
    <div class="tx-sum-row">
      <div class="ts-item"><div class="ts-label">买入总额</div><div class="ts-value tx-buy-color">$${buyTxs.reduce((s,t)=>s+t.amount,0).toLocaleString("en-US",{minimumFractionDigits:2})}</div></div>
      <div class="ts-item"><div class="ts-label">卖出总额</div><div class="ts-value tx-sell-color">$${sellTxs.reduce((s,t)=>s+t.amount,0).toLocaleString("en-US",{minimumFractionDigits:2})}</div></div>
      <div class="ts-item"><div class="ts-label">累计充值</div><div class="ts-value tx-dep-color">¥${depTxs.reduce((s,t)=>s+t.amount,0).toLocaleString("zh-CN")}</div></div>
      <div class="ts-item"><div class="ts-label">累计手续费</div><div class="ts-value">$${totalFee.toFixed(4)}</div></div>
    </div>`;

  // 翻页控件
  renderTxPagination(sorted.length, totalPages);

  // 更新账户余额卡片
  updateBalanceCard();
}

function renderTxPagination(total, totalPages) {
  let el = document.getElementById("txPagination");
  if (!el) {
    el = document.createElement("div");
    el.id = "txPagination";
    el.className = "tx-pagination";
    document.getElementById("txSummary")?.after(el);
  }
  if (totalPages <= 1) { el.innerHTML = ""; return; }

  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - txCurrentPage) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  el.innerHTML = `
    <div class="tx-page-info">第 ${txCurrentPage} / ${totalPages} 页 · 共 ${total} 条</div>
    <div class="tx-page-btns">
      <button class="tx-page-btn" ${txCurrentPage === 1 ? "disabled" : ""} onclick="renderTransactions('${txCurrentFilter}', ${txCurrentPage - 1})">‹ 上一页</button>
      ${pages.map(p => p === "…"
        ? `<span class="tx-page-ellipsis">…</span>`
        : `<button class="tx-page-btn ${p === txCurrentPage ? "active" : ""}" onclick="renderTransactions('${txCurrentFilter}', ${p})">${p}</button>`
      ).join("")}
      <button class="tx-page-btn" ${txCurrentPage === totalPages ? "disabled" : ""} onclick="renderTransactions('${txCurrentFilter}', ${txCurrentPage + 1})">下一页 ›</button>
    </div>`;
}

function updateBalanceCard() {
  const price = btcPrice || 0;
  // 可用 USDT = 充值换汇总额 - 所有买入花费（含手续费）+ 所有卖出到账（已扣手续费）
  const depositUsdt = TRANSACTIONS.filter(t => t.type === "deposit")
    .reduce((s, t) => s + t.amount / cnyRate, 0);
  const buySpent = TRANSACTIONS.filter(t => t.type === "buy")
    .reduce((s, t) => s + t.amount + t.fee, 0);
  const sellRecv = TRANSACTIONS.filter(t => t.type === "sell")
    .reduce((s, t) => s + t.amount - t.fee, 0);
  const availUsdt = depositUsdt - buySpent + sellRecv;

  const btcVal   = PORTFOLIO.btcAmount * price;
  const totalVal = availUsdt + btcVal;
  // 总成本 = 累计充值换汇
  const totalCost = depositUsdt;
  const totalPnl  = totalVal - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const pnlCls = totalPnl >= 0 ? "bal-pnl-profit" : "bal-pnl-loss";
  const pnlSign = totalPnl >= 0 ? "+" : "";

  const fmt2 = v => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtCNY = v => "¥" + (v * cnyRate).toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  set("balUsdt",    fmt2(availUsdt) + " USDT");
  set("balUsdtCny", "≈ " + fmtCNY(availUsdt));
  set("balBtcUsdt", price ? "≈ $" + fmt2(btcVal) + "  ·  " + fmtCNY(btcVal) : "—");
  set("balTotal",   price ? "$" + fmt2(totalVal) : "—");
  set("balTotalCny","≈ " + fmtCNY(totalVal));

  // 总盈亏
  const pnlEl = document.getElementById("balTotalPnl");
  if (pnlEl) {
    pnlEl.className = "bal-sub " + pnlCls;
    pnlEl.textContent = price
      ? `总盈亏 ${pnlSign}$${fmt2(totalPnl)} (${pnlSign}${totalPnlPct.toFixed(2)}%)`
      : "—";
  }
}

function initTxFilter() {
  document.querySelectorAll(".tx-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tx-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderTransactions(btn.dataset.filter, 1); // 切换筛选时回到第1页
    });
  });
  renderTransactions("all", 1);
}

// ── 初始化 ──
async function init() {
  await fetchCnyRate();
  fetchPrice();
  fetchGlobalData();
  fetchBtcDetail();
  fetchFearGreed();
  renderHalvingCountdown();
  setTimeout(() => renderMarketNews("all"), 1500);
  initNewsFilter();

  setInterval(fetchPrice,            60000);
  setInterval(fetchGlobalData,      120000);
  setInterval(fetchFearGreed,       300000);
  setInterval(() => renderMarketNews(), 60000);
  setInterval(renderHalvingCountdown, 600000); // 每10分钟更新减半倒计时

  document.getElementById("refreshBtn")?.addEventListener("click", () => {
    fetchPrice(); fetchGlobalData(); fetchBtcDetail(); fetchFearGreed();
    renderHalvingCountdown();
    setTimeout(() => renderMarketNews(), 500);
  });

  initNavDropdown();
  initDrawer();
  initTxFilter();
}

init();
