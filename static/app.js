const IMG = 'https://imrs.foodibd.com/api/v1/image-resize';
const S3 = 'https://s3.ap-southeast-1.amazonaws.com/cdn.foodibd.com';
const TAKA = '৳';

let charts = {};
let currentSort = 'name';
let currentOrder = 'asc';
let currentPage = 1;
let currentView = 'grid';
let gridSize = 4;
let dealFilter = 'all';
let dealData = {};
let allProducts = [];
let compareMode = false;
let compareCart = JSON.parse(localStorage.getItem('foodie_compare_cart') || '[]');
let watchlist = JSON.parse(localStorage.getItem('foodie_watchlist') || '[]');
let newDaysThreshold = 7;
let phState = { productId: null, name: '', range: 90, data: [], stats: null };

const CHART_C = {
  saffron: '#E8A33D', chilli: '#E0522F', leaf: '#5FB86F', sky: '#6FB7C9',
  dim: '#8FA898', faint: '#5E7A68', text: '#F3E9D7', purple: '#C39BD3',
  border: '#1E3A2A', card: '#17352A',
};
const chartColors = [CHART_C.saffron, CHART_C.sky, CHART_C.leaf, CHART_C.chilli, CHART_C.purple, '#F4EBDD', '#E8A33D', '#6FB7C9', '#5FB86F', '#E0522F', '#C39BD3', '#B7C7BE', '#14B8A6', '#E8A33D', '#5FB86F', '#E0522F', '#C39BD3', '#6FB7C9'];

// Drawn ATL marker line on the price chart
const ATL_PLUGIN = {
  id: 'atlLine',
  afterDraw(chart) {
    if (!chart.options.plugins?.atlLine?.display) return;
    const low = chart.options.plugins.atlLine.low;
    const minV = chart.options.plugins.atlLine.minV;
    if (low == null || minV == null) return;
    const yAxis = chart.scales.y;
    const y = yAxis.getPixelForValue(minV);
    const ctx = chart.ctx;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = CHART_C.saffron;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(chart.chartArea.left, y);
    ctx.lineTo(chart.chartArea.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = CHART_C.saffron;
    ctx.font = `700 10px 'IBM Plex Mono', monospace`;
    ctx.fillText(`ATL ${fmt(low)}`, chart.chartArea.left + 6, y - 5);
    ctx.restore();
  }
};
Chart.register(ATL_PLUGIN);

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const fmt = n => n == null || isNaN(n) ? '—' : `${TAKA}${Number(n).toLocaleString()}`;
const API = p => fetch(p).then(r => r.json());
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function log(level, msg) {
  const c = $('#consoleOutput');
  const t = new Date().toTimeString().slice(0, 8);
  const cls = {info:'info',warn:'warn',error:'error',ok:'ok'}[level] || 'info';
  const lvl = $('#logLevel')?.value || 'all';
  const order = {all:0, info:1, warn:2, error:3};
  if (order[lvl] > order[level]) return;
  c.innerHTML += `<div class="line"><span class="time">${t}</span><span class="level ${cls}">${level.toUpperCase()}</span><span>${esc(msg)}</span></div>`;
  c.scrollTop = c.scrollHeight;
}
function clearConsole() { $('#consoleOutput').innerHTML = ''; }
function imgSrc(p, w = 80) { return `${IMG}?imageUrl=${S3}${p.image_path}&width=${w}`; }

// ---- Header date ----
function renderHeaderDate() {
  const now = new Date();
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  const t = now.toTimeString().slice(0, 5);
  $('#headerDate').innerHTML = `<span class="big">${d}</span><span class="daymark">●</span> market hours · ${t} BST`;
  $('#chalkDate').innerHTML = `Today · <span class="daymark">${d.toUpperCase()}</span>`;
}

// ---- Tab switching ----
$$('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.panel)));
function switchTab(name) {
  $$('.tab').forEach(t => t.classList.remove('active'));
  $$('.panel').forEach(p => p.classList.remove('active'));
  $(`.tab[data-panel="${name}"]`).classList.add('active');
  $(`#${name}`).classList.add('active');
  log('info', `Switched to ${name}`);
  if (name === 'price-history') refreshWatchlistChips();
  if (name === 'watchlist') loadWatchlist();
}

// ---- Chalkboard hero ----
async function loadChalkBoard() {
  const d = await API('/api/analytics');
  const inStockPct = d.total_products ? Math.round(d.in_stock / d.total_products * 100) : 0;
  const discPct = d.total_products ? Math.round(d.total_discounted / d.total_products * 100) : 0;
  const totalValue = d.category_stats.reduce((s, c) => s + c.total_value, 0);
  $('#chalkBoard').innerHTML = `
    <div class="chalk-item"><div class="lbl">Products on board</div><div class="v">${d.total_products.toLocaleString()}</div></div>
    <div class="chalk-item"><div class="lbl">Categories</div><div class="v saffron">${d.total_categories}</div></div>
    <div class="chalk-item"><div class="lbl">Avg price</div><div class="v leaf">${fmt(d.avg_price)}</div></div>
    <div class="chalk-item"><div class="lbl">On discount</div><div class="v chilli">${discPct}%</div></div>
    <div class="chalk-item"><div class="lbl">In stock</div><div class="v">${inStockPct}%</div></div>
    <div class="chalk-item"><div class="lbl">Est. shelf value</div><div class="v leaf" style="font-size:1.1rem">${TAKA}${totalValue.toLocaleString(undefined,{maximumFractionDigits:0})}</div></div>
  `;
  return d;
}

// ---- Ticker / top movers ----
async function loadTicker() {
  try {
    const movers = await API('/api/top-movers?limit=30');
    if (!movers.length) return;
    $('#tickerWrap').style.display = 'block';
    $('#ticker').innerHTML = movers.map(m => `
      <span class="ticker-item" onclick="showPH(${m.product_id},'${esc(m.name).replace(/'/g, "\\'")}', __moversNav)">
        <span class="name">${esc(m.name)}</span>
        <span class="price">${fmt(m.new_price)}</span>
        <span class="${m.price_diff < 0 ? 'down' : 'up'} pct">${m.price_diff < 0 ? '▼' : '▲'}${Math.abs(m.pct || 0).toFixed(1)}%</span>
      </span>
    `).join('');
    window.__moversNav = movers;
  } catch(e) { log('warn', `Ticker: ${e.message}`); }
}

// ---- Overview ----
async function loadOverview() {
  log('info', 'Loading overview...');
  const d = await API('/api/analytics');

  const catData = d.category_stats;
  destroyChart('catChart');
  charts.catChart = new Chart($('#catChart'), {
    type: 'bar',
    data: {
      labels: catData.map(c => c.category_name),
      datasets: [{ label: 'Products', data: catData.map(c => c.count), backgroundColor: 'rgba(232,163,61,.55)', borderColor: 'rgba(232,163,61,.9)', borderWidth: 1, borderRadius: 3 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: CHART_C.dim, font: { size: 9, family: "'IBM Plex Mono', monospace" }, maxRotation: 45 } }, y: { ticks: { color: CHART_C.dim, font: { family: "'IBM Plex Mono', monospace" } }, grid: { color: CHART_C.border } } } }
  });

  destroyChart('priceDistChart');
  charts.priceDistChart = new Chart($('#priceDistChart'), {
    type: 'bar',
    data: {
      labels: d.price_buckets.map(b => b.bucket),
      datasets: [{ label: 'Products', data: d.price_buckets.map(b => b.count), backgroundColor: 'rgba(111,183,201,.5)', borderColor: 'rgba(111,183,201,.9)', borderWidth: 1, borderRadius: 3 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: CHART_C.dim, font: { family: "'IBM Plex Mono', monospace" } } }, y: { ticks: { color: CHART_C.dim }, grid: { color: CHART_C.border } } } }
  });

  $('#topExpensive').innerHTML = d.top_expensive.map(p => `
    <div class="item" onclick="showPH(${p.product_id},'${esc(p.name).replace(/'/g, "\\'")}', window.__expNav)">
      <span style="overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</span><span class="count price">${fmt(p.discounted_price)}</span>
    </div>`).join('');
  window.__expNav = d.top_expensive;

  $('#topDiscounts').innerHTML = d.top_discounts.map(p => `
    <div class="item" onclick="showPH(${p.product_id},'${esc(p.name).replace(/'/g, "\\'")}', window.__discNav)">
      <span style="overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</span>
      <span><span class="old-price">${fmt(p.base_price)}</span> <span class="discount">-${p.is_discount_in_perc ? p.discount + '%' : fmt(p.discount)}</span></span>
    </div>`).join('');
  window.__discNav = d.top_discounts;

  if (d.scrape_runs.length) {
    const r = d.scrape_runs[0];
    const el = $('#lastRun');
    if (el) el.textContent = `Last run: ${r.finished_at ? new Date(r.finished_at).toLocaleString() : 'Running...'} (${r.products_scraped || '?'} products)`;
  }

  log('ok', `Overview loaded: ${d.total_products} products, ${d.total_categories} categories`);
}

// ---- Products ----
async function loadProducts(page = 1) {
  currentPage = page;
  const q = $('#searchInput').value;
  const cat = $('#catFilter').value;
  const sort = $('#sortSelect').value;
  const order = $('#orderSelect').value;
  const minP = $('#minPrice').value;
  const maxP = $('#maxPrice').value;
  const stock = $('#stockFilter').value;

  currentSort = sort; currentOrder = order;

  const params = new URLSearchParams({ page, per_page: 200, sort, order });
  if (q) params.set('q', q);
  if (cat) params.set('category', cat);
  if (minP) params.set('min_price', minP);
  if (maxP) params.set('max_price', maxP);
  if (stock) params.set('in_stock', stock);

  const d = await API(`/api/products?${params}`);
  allProducts = d.data;
  const filtered = filterByDeal(d.data);
  const totalFiltered = filtered.length;
  const perPage = 50;
  const totalPages = Math.ceil(totalFiltered / perPage) || 1;
  const startIdx = (page - 1) * perPage;
  const pageData = filtered.slice(startIdx, startIdx + perPage);

  $('#resultCount').textContent = `Showing ${Math.min(startIdx + 1, totalFiltered)}-${Math.min(startIdx + perPage, totalFiltered)} of ${totalFiltered} products${dealFilter !== 'all' ? ' (deal filtered)' : ''}`;

  $('#productBody').innerHTML = pageData.map(p => `
    <tr>
      <td><img class="thumb" src="${imgSrc(p)}" loading="lazy" onerror="this.style.display='none'"></td>
      <td><div class="product-name"><span>${esc(p.name)}</span></div></td>
      <td class="text-sm text-dim" style="font-family:var(--font-mono)">${esc(p.sku)}</td>
      <td><span class="badge cat">${esc(p.category_name)}</span></td>
      <td>${p.base_price != p.discounted_price ? `<span class="old-price">${fmt(p.base_price)}</span>` : '—'}</td>
      <td class="price">${fmt(p.discounted_price)}</td>
      <td>${p.discount > 0 ? `<span class="discount">${p.is_discount_in_perc ? p.discount + '%' : fmt(p.discount)}</span>` : '—'}</td>
      <td><span class="badge ${p.has_stock ? 'stock' : 'oos'}">${p.has_stock ? 'In' : 'OOS'}</span></td>
      <td><button onclick="showPH(${p.product_id},'${esc(p.name).replace(/'/g, "\\'")}', allProducts)" class="secondary" style="font-size:.7rem;padding:4px 10px">Price Board</button></td>
    </tr>`).join('');

  const grid = $('#productGridView');
  grid.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;
  grid.innerHTML = pageData.map(p => `
    <div class="grid-card ${compareMode && compareCart.includes(p.product_id) ? 'selected' : ''}" onclick="${compareMode ? `addToCart(${p.product_id})` : `showPH(${p.product_id},'${esc(p.name).replace(/'/g, "\\'")}', allProducts)`}">
      ${getDealBadge(p)}
      <img src="${imgSrc(p, 200)}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect fill=%22%23102%71D%22 width=%22100%22 height=%22100%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%235E7A68%22 font-size=%2212%22>No Image</text></svg>'">
      <div class="name" title="${esc(p.name)}">${esc(p.name)}</div>
      <div class="cat">${esc(p.category_name)}</div>
      <div class="price-row">
        <span class="sale">${fmt(p.discounted_price)}</span>
        ${p.discount > 0 ? `<span class="orig">${fmt(p.base_price)}</span><span class="disc">-${p.is_discount_in_perc ? p.discount + '%' : fmt(p.discount)}</span>` : ''}
      </div>
    </div>`).join('');

  const pag = $('#pagination');
  let html = '';
  if (page > 1) html += `<button onclick="loadProducts(${page - 1})">‹ Prev</button>`;
  const start = Math.max(1, page - 3), end = Math.min(totalPages, page + 3);
  for (let i = start; i <= end; i++) html += `<button class="${i === page ? 'current' : ''}" onclick="loadProducts(${i})">${i}</button>`;
  if (page < totalPages) html += `<button onclick="loadProducts(${page + 1})">Next ›</button>`;
  html += `<span class="text-sm text-dim" style="margin-left:8px;font-family:var(--font-mono)">Page ${page}/${totalPages}</span>`;
  pag.innerHTML = html;
}

function sortTable(field) {
  const sel = $('#sortSelect');
  if (sel.value === field) {
    $('#orderSelect').value = $('#orderSelect').value === 'asc' ? 'desc' : 'asc';
  } else { sel.value = field; $('#orderSelect').value = 'asc'; }
  loadProducts(1);
}

// ---- Grid / Table view ----
function setView(v) {
  currentView = v;
  $('#viewGrid').classList.toggle('active', v === 'grid');
  $('#viewTable').classList.toggle('active', v === 'table');
  $('#productGridView').style.display = v === 'grid' ? 'grid' : 'none';
  $('#productTableView').style.display = v === 'table' ? 'block' : 'none';
  $('#gridSliderWrap').style.display = v === 'grid' ? 'flex' : 'none';
  loadProducts(currentPage);
}
function setGridSize(v) {
  gridSize = parseInt(v);
  $('#gridSizeLabel').textContent = v;
  $('#productGridView').style.gridTemplateColumns = `repeat(${v}, 1fr)`;
  loadProducts(currentPage);
}

// ---- Analytics ----
async function loadAnalytics() {
  log('info', 'Loading analytics...');
  const d = await API('/api/analytics');

  const avgDiscount = d.total_discounted > 0 ? Math.round(d.total_discounted / d.total_products * 100) : 0;
  const inStockPct = Math.round(d.in_stock / d.total_products * 100);
  const totalValue = d.category_stats.reduce((s, c) => s + c.total_value, 0);
  const priceSpread = d.max_price - d.min_price;
  const kpis = [
    { lbl: 'Total Products', val: d.total_products.toLocaleString(), cls: 'blue' },
    { lbl: 'Categories', val: d.total_categories, cls: 'purple' },
    { lbl: 'Avg Price', val: fmt(d.avg_price), sub: `Spread: ${fmt(priceSpread)}`, cls: 'green' },
    { lbl: 'In Stock', val: `${inStockPct}%`, sub: `${d.in_stock} / ${d.total_products}`, cls: 'green' },
    { lbl: 'Discounted', val: `${avgDiscount}%`, sub: `${d.total_discounted} items`, cls: 'red' },
    { lbl: 'Est. Shelf Value', val: `${TAKA}${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, sub: `${d.total_categories} categories`, cls: 'yellow' }
  ];
  $('#kpiRow').innerHTML = kpis.map(k => `<div class="kpi ${k.cls}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div>${k.sub ? `<div class="sub">${k.sub}</div>` : ''}</div>`).join('');

  destroyChart('catRevenueChart');
  charts.catRevenueChart = new Chart($('#catRevenueChart'), {
    type: 'bar',
    data: {
      labels: d.category_stats.map(c => c.category_name),
      datasets: [{ label: 'Est. Revenue ৳', data: d.category_stats.map(c => c.total_value), backgroundColor: chartColors.slice(0, d.category_stats.length), borderRadius: 3 }]
    },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: CHART_C.dim, font: { family: "'IBM Plex Mono', monospace" }, callback: v => TAKA + v.toLocaleString() }, grid: { color: CHART_C.border } }, y: { ticks: { color: CHART_C.dim, font: { size: 9 } } } } }
  });

  destroyChart('stockPie');
  charts.stockPie = new Chart($('#stockPie'), {
    type: 'doughnut',
    data: { labels: ['In Stock', 'Out of Stock'], datasets: [{ data: [d.in_stock, d.out_of_stock], backgroundColor: ['rgba(95,184,111,.75)', 'rgba(224,82,47,.75)'], borderWidth: 0, hoverOffset: 8 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { labels: { color: CHART_C.text, font: { family: "'Space Grotesk', sans-serif" }, padding: 16 } } } }
  });

  destroyChart('catCompareChart');
  const shortNames = d.category_stats.map(c => c.category_name.length > 12 ? c.category_name.slice(0, 12) + '…' : c.category_name);
  charts.catCompareChart = new Chart($('#catCompareChart'), {
    type: 'bar',
    data: {
      labels: shortNames,
      datasets: [
        { label: 'Min', data: d.category_stats.map(c => c.min_price), backgroundColor: 'rgba(95,184,111,.55)', borderRadius: 2 },
        { label: 'Avg', data: d.category_stats.map(c => c.avg_price), backgroundColor: 'rgba(232,163,61,.6)', borderRadius: 2 },
        { label: 'Max', data: d.category_stats.map(c => c.max_price), backgroundColor: 'rgba(224,82,47,.55)', borderRadius: 2 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: CHART_C.text, font: { family: "'Space Grotesk', sans-serif" } } } }, scales: { x: { ticks: { color: CHART_C.dim, font: { size: 9 }, maxRotation: 45 } }, y: { ticks: { color: CHART_C.dim, font: { family: "'IBM Plex Mono', monospace" }, callback: v => TAKA + v }, grid: { color: CHART_C.border } } } }
  });

  destroyChart('discountDepthChart');
  const depthBuckets = {};
  d.top_discounts.forEach(p => {
    const pct = p.is_discount_in_perc ? p.discount : (p.base_price > 0 ? Math.round((1 - p.discounted_price / p.base_price) * 100) : 0);
    const bucket = pct < 5 ? '0-5%' : pct < 10 ? '5-10%' : pct < 20 ? '10-20%' : pct < 30 ? '20-30%' : pct < 50 ? '30-50%' : '50%+';
    depthBuckets[bucket] = (depthBuckets[bucket] || 0) + 1;
  });
  const dbLabels = ['0-5%', '5-10%', '10-20%', '20-30%', '30-50%', '50%+'];
  charts.discountDepthChart = new Chart($('#discountDepthChart'), {
    type: 'bar',
    data: { labels: dbLabels, datasets: [{ label: 'Products', data: dbLabels.map(b => depthBuckets[b] || 0), backgroundColor: ['#5FB86F', '#6FB7C9', '#E8A33D', '#E0522F', '#C39BD3', '#F4EBDD'], borderRadius: 3 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: CHART_C.dim, font: { family: "'IBM Plex Mono', monospace" } } }, y: { ticks: { color: CHART_C.dim }, grid: { color: CHART_C.border } } } }
  });

  destroyChart('discountPie');
  charts.discountPie = new Chart($('#discountPie'), {
    type: 'doughnut',
    data: { labels: ['Discounted', 'Full Price'], datasets: [{ data: [d.total_discounted, d.total_products - d.total_discounted], backgroundColor: ['rgba(224,82,47,.75)', 'rgba(111,183,201,.6)'], borderWidth: 0, hoverOffset: 8 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { labels: { color: CHART_C.text, font: { family: "'Space Grotesk', sans-serif" }, padding: 16 } } } }
  });

  destroyChart('bucketChart');
  charts.bucketChart = new Chart($('#bucketChart'), {
    type: 'bar',
    data: { labels: d.price_buckets.map(b => b.bucket), datasets: [{ label: 'Count', data: d.price_buckets.map(b => b.count), backgroundColor: ['#E8A33D', '#6FB7C9', '#5FB86F', '#E0522F', '#C39BD3', '#F4EBDD'], borderRadius: 3 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: CHART_C.dim, font: { family: "'IBM Plex Mono', monospace" } } }, y: { ticks: { color: CHART_C.dim }, grid: { color: CHART_C.border } } } }
  });

  destroyChart('dailyChart');
  if (d.daily_counts.length > 0) {
    charts.dailyChart = new Chart($('#dailyChart'), {
      type: 'line',
      data: { labels: d.daily_counts.map(c => c.day), datasets: [{ label: 'Products Scraped', data: d.daily_counts.map(c => c.count), borderColor: CHART_C.saffron, backgroundColor: 'rgba(232,163,61,.1)', fill: true, tension: .3, pointRadius: 3, pointBackgroundColor: CHART_C.saffron }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: CHART_C.text } } }, scales: { x: { ticks: { color: CHART_C.dim } }, y: { ticks: { color: CHART_C.dim }, grid: { color: CHART_C.border } } } }
    });
  }

  destroyChart('catAvgChart');
  charts.catAvgChart = new Chart($('#catAvgChart'), {
    type: 'bar',
    data: { labels: shortNames, datasets: [{ label: 'Avg ৳', data: d.category_stats.map(c => c.avg_price), backgroundColor: 'rgba(95,184,111,.6)', borderRadius: 3 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: CHART_C.dim, font: { family: "'IBM Plex Mono', monospace" } }, grid: { color: CHART_C.border } }, y: { ticks: { color: CHART_C.dim, font: { size: 10 } } } } }
  });

  const maxPrice = d.top_expensive.length ? d.top_expensive[0].discounted_price : 1;
  $('#leaderExpensive').innerHTML = d.top_expensive.map((p, i) => {
    const rankCls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const barW = Math.round(p.discounted_price / maxPrice * 100);
    return `<div class="row" onclick="showPH(${p.product_id},'${esc(p.name).replace(/'/g, "\\'")}', window.__expNav)" style="cursor:pointer"><span class="rank ${rankCls}">${i + 1}</span><span style="flex:2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</span><span class="bar-wrap"><span class="bar" style="width:${barW}%;background:${CHART_C.saffron}"></span></span><span class="price" style="min-width:70px;text-align:right">${fmt(p.discounted_price)}</span></div>`;
  }).join('');

  const maxDisc = d.top_discounts.length ? Math.max(...d.top_discounts.map(p => p.discount)) : 1;
  $('#leaderDiscounts').innerHTML = d.top_discounts.map((p, i) => {
    const rankCls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const barW = Math.round(p.discount / maxDisc * 100);
    return `<div class="row" onclick="showPH(${p.product_id},'${esc(p.name).replace(/'/g, "\\'")}', window.__discNav)" style="cursor:pointer"><span class="rank ${rankCls}">${i + 1}</span><span style="flex:2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</span><span class="bar-wrap"><span class="bar" style="width:${barW}%;background:${CHART_C.chilli}"></span></span><span class="discount" style="min-width:50px;text-align:right">${p.is_discount_in_perc ? p.discount + '%' : fmt(p.discount)}</span></div>`;
  }).join('');

  // Price spread heatmap
  const hDiv = $('#priceHeatmap');
  const pcts = ['P10', 'P25', 'P50', 'P75', 'P90'];
  let hHtml = '<div style="display:grid;grid-template-columns:100px repeat(5,1fr);gap:2px;font-size:.7rem">';
  hHtml += '<div></div>' + pcts.map(p => `<div class="heatmap-header">${p}</div>`).join('');
  d.category_stats.forEach((c) => {
    const range = c.max_price - c.min_price || 1;
    const vals = [.1, .25, .5, .75, .9].map(pct => c.min_price + range * pct);
    hHtml += `<div style="padding:4px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(c.category_name)}">${c.category_name.length > 12 ? c.category_name.slice(0, 12) + '…' : esc(c.category_name)}</div>`;
    vals.forEach(v => {
      const intensity = Math.min(1, v / (d.avg_price * 2));
      const r = Math.round(232 + intensity * -20);
      const g = Math.round(163 + intensity * -50);
      const b = Math.round(61 + intensity * -30);
      hHtml += `<div class="heatmap-cell" style="background:rgba(${r},${g},${b},.45)" title="${esc(c.category_name)}: ${TAKA}${Math.round(v)}"></div>`;
    });
  });
  hHtml += '</div>';
  hDiv.innerHTML = hHtml;

  const corrMetrics = [
    { label: 'Discount Rate', value: `${avgDiscount}%`, cls: 'chilli' },
    { label: 'Avg Category Size', value: Math.round(d.total_products / d.total_categories), cls: 'sky' },
    { label: 'Price Coefficient', value: (priceSpread / d.avg_price).toFixed(1) + 'x', sub: 'Spread / Avg', cls: 'purple' },
    { label: 'Premium Ratio', value: `${d.top_expensive.filter(p => p.discounted_price > 500).length}/${d.total_products}`, sub: 'Products > ৳500', cls: 'saffron' },
    { label: 'Avg Discount', value: d.total_discounted > 0 ? Math.round(d.top_discounts.reduce((s, p) => s + p.discount, 0) / Math.max(d.top_discounts.length, 1)) + '%' : '—', cls: 'leaf' },
    { label: 'Stock Rate', value: `${inStockPct}%`, cls: 'leaf' }
  ];
  $('#correlationGrid').innerHTML = corrMetrics.map(m => `<div class="correlation-card"><div class="label">${m.label}</div><div class="value" style="color:${CHART_C[m.cls] || CHART_C.text}">${m.value}</div>${m.sub ? `<div style="font-size:.65rem;color:var(--faint)">${m.sub}</div>` : ''}</div>`).join('');

  const tb = $('#catStatsBody');
  tb.innerHTML = d.category_stats.map(c => {
    const spread = (c.max_price - c.min_price).toFixed(0);
    const discPct = c.count > 0 ? Math.round(c.discounted / c.count * 100) : 0;
    return `<tr>
      <td><span class="badge cat">${esc(c.category_name)}</span></td>
      <td>${c.count}</td>
      <td class="price">${fmt(c.avg_price)}</td>
      <td>${fmt(c.min_price)}</td>
      <td>${fmt(c.max_price)}</td>
      <td class="text-dim mono">${fmt(spread)}</td>
      <td class="mono">${fmt(c.total_value)}</td>
      <td><span style="color:${discPct > 50 ? 'var(--chilli)' : discPct > 25 ? 'var(--saffron)' : 'var(--leaf)'}">${discPct}%</span></td>
      <td><span style="color:var(--leaf)">${inStockPct}%</span></td>
    </tr>`;
  }).join('');

  log('ok', `Analytics loaded: ${d.category_stats.length} categories, ${d.total_products} products`);
}

// ============================================================
// STEAMDB-STYLE PRICE HISTORY (MODAL)
// ============================================================
let phChart = null;
let phModalOpen = false;
let phNav = [];
let phNavIdx = -1;

function openPHModal(productId, name, nav) {
  phModalOpen = true;
  $('#phModal').classList.add('open');
  document.body.style.overflow = 'hidden';

  if (nav && Array.isArray(nav) && nav.length) {
    phNav = nav;
    phNavIdx = nav.findIndex(x => +x.product_id === +productId);
    if (phNavIdx < 0) phNavIdx = 0;
  }

  // Background fill: item image, semi-transparent
  const found = phNav.length ? phNav[phNavIdx] : null;
  if (found && found.image_path) {
    $('#phModalBg').style.backgroundImage = `url('${imgSrc(found, 1200)}')`;
  } else {
    $('#phModalBg').style.backgroundImage = '';
  }
  updatePHNavCount();

  loadPHData(productId, name);
}

function closePHModal() {
  phModalOpen = false;
  $('#phModal').classList.remove('open');
  document.body.style.overflow = '';
  if (phChart) { phChart.destroy(); phChart = null; }
}

function updatePHNavCount() {
  if (phNav.length > 1) {
    $('#phmNavCount').textContent = `${phNavIdx + 1} / ${phNav.length}`;
  } else {
    $('#phmNavCount').textContent = '—';
  }
}

function navPH(dir) {
  if (!phNav.length) return;
  phNavIdx = (phNavIdx + dir + phNav.length) % phNav.length;
  const item = phNav[phNavIdx];
  if (!item) return;
  const found = item;
  if (found.image_path) {
    $('#phModalBg').style.backgroundImage = `url('${imgSrc(found, 1200)}')`;
  }
  updatePHNavCount();
  loadPHData(found.product_id, found.name, found);
}

async function loadPHData(productId, name, preloaded) {
  phState.productId = productId;
  phState.name = name;
  log('info', `Price board: ${name} (${productId})`);
  $('#phmName').textContent = name;
  $('#phmMeta').textContent = `#${productId}`;
  $('#phmCurrent').textContent = '…';

  if (preloaded) {
    $('#phmMeta').textContent = `${esc(preloaded.sku || '')} · ${esc(preloaded.category_name || '')}${preloaded.uom ? ' · ' + esc(preloaded.uom) : ''}`;
    $('#phmImg').src = imgSrc(preloaded, 200);
  }

  try {
    const resp = await API(`/api/parquet/price-history/${productId}?days=3650`);
    phState.data = resp.data || [];
    phState.stats = resp.stats || null;
    if (resp.data?.length) log('info', `Loaded ${resp.data.length} points from Parquet`);
    else log('warn', `No history found for ${name}`);
  } catch (e) {
    log('warn', `Parquet unavailable, falling back to SQLite`);
    phState.data = await API(`/api/price-history/${productId}?days=3650`);
    phState.stats = null;
  }

  const last = phState.data.length ? phState.data[phState.data.length - 1] : null;
  if (last) {
    $('#phmMeta').textContent = `${esc(last.sku || '')} · ${esc(last.category_name || '')}${last.uom ? ' · ' + esc(last.uom) : ''}`;
    if (last.image_path) $('#phmImg').src = imgSrc(last, 200);
    else $('#phmImg').style.display = 'none';
  } else {
    $('#phmImg').style.display = 'none';
  }

  renderPHStats();
  renderPHChart();
  renderPHTable();
  $('#phmRangeNote').textContent = `${phState.data.length} snapshots available`;
}

async function searchForHistory() {
  const q = $('#phSearch').value.trim();
  if (!q) return;
  log('info', `Searching for price history: "${q}"`);
  const results = await API(`/api/search?q=${encodeURIComponent(q)}&limit=12`);
  const div = $('#phResults');
  if (!results.length) { div.innerHTML = '<div class="empty"><div class="big">No products found</div>Try another name or SKU.</div>'; return; }
  window.__phNav = results.map(r => ({ product_id: r.product_id, name: r.name, image_path: r.image_path, sku: r.sku, category_name: r.category_name }));
  div.innerHTML = results.map(p => `
    <div class="flex" style="padding:10px;border-bottom:1px solid var(--border);cursor:pointer;background:var(--card);border-radius:4px;margin-bottom:4px" onclick="openPHModal(${p.product_id},'${esc(p.name).replace(/'/g, "\\'")}', window.__phNav)">
      <img class="thumb" src="${imgSrc(p)}" loading="lazy" onerror="this.style.display='none'">
      <div style="flex:1"><strong>${esc(p.name)}</strong><div class="text-xs text-dim mono">${esc(p.sku)} | ${esc(p.category_name)}</div></div>
      <div class="price" style="align-self:center">${fmt(p.discounted_price)}</div>
      <button class="ghost" style="align-self:center;font-size:.7rem" onclick="event.stopPropagation();toggleWatch(${p.product_id},'${esc(p.name).replace(/'/g, "\\'")}')">${watchlist.includes(p.product_id) ? '★ Tracked' : '☆ Track'}</button>
    </div>`).join('');
}

// Backward-compatible alias used by legacy click handlers
async function showPH(productId, name, nav) {
  openPHModal(productId, name, nav);
}

function pctColor(v) {
  if (v === null || v === undefined || isNaN(v)) return 'flat';
  if (Math.abs(v) < 0.05) return 'flat';
  return v > 0 ? 'up' : 'down';
}

function renderPHStats() {
  const s = phState.stats;
  if (!s) return;
  const fmtDate = d => d ? new Date(d).toLocaleDateString() : '';
  $('#phmCurrent').textContent = fmt(s.current);
  $('#phmChg').className = 'chg ' + pctColor(s.change_30d);
  const chg30 = s.change_30d;
  $('#phmChg').textContent = chg30 === null || chg30 === undefined ? '—' : `${chg30 > 0 ? '▲' : chg30 < 0 ? '▼' : '·'} ${Math.abs(chg30).toFixed(2)}% (30d)`;

  $('#phmLow').textContent = fmt(s.low);
  $('#phmLowDate').textContent = s.low_date ? `on ${fmtDate(s.low_date)}` : '';
  $('#phmHigh').textContent = fmt(s.high);
  $('#phmHighDate').textContent = s.high_date ? `on ${fmtDate(s.high_date)}` : '';
  $('#phmAvg').textContent = fmt(s.avg);
  $('#phmMedian').textContent = `median ${fmt(s.median)}`;
  const c7 = s.change_7d, c30 = s.change_30d;
  $('#phmChg7').textContent = c7 === null || c7 === undefined ? '—' : `${c7 > 0 ? '+' : ''}${c7.toFixed(2)}%`;
  $('#phmChg7').className = 'v ' + pctColor(c7);
  $('#phmChg30').textContent = c30 === null || c30 === undefined ? '—' : `${c30 > 0 ? '+' : ''}${c30.toFixed(2)}%`;
  $('#phmChg30').className = 'v ' + pctColor(c30);
  $('#phmDays').textContent = s.days_tracked ? `${s.days_tracked}d` : '—';
  $('#phmPoints').textContent = `${s.points} points`;
}

function setPHRange(days) {
  phState.range = days;
  $$('.range-btn').forEach(b => b.classList.toggle('active', +b.dataset.days === days));
  renderPHChart();
  renderPHTable();
}

function setPHRange(days) {
  phState.range = days;
  $$('.range-btn').forEach(b => b.classList.toggle('active', +b.dataset.days === days));
  renderPHChart();
  renderPHTable();
}

function renderPHChart() {
  if (!phState.data.length) return;
  const days = phState.range;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  let pts = phState.data;
  if (days !== 9999) {
    pts = phState.data.filter(d => new Date(d.scraped_at) >= cutoff);
  }
  if (!pts.length) { log('warn', 'No data in selected range'); return; }

  if (phChart) phChart.destroy();

  // Downsample for large ranges
  const maxPoints = 120;
  let sampled = pts;
  if (pts.length > maxPoints) {
    const step = Math.ceil(pts.length / maxPoints);
    sampled = pts.filter((_, i) => i % step === 0);
    if (sampled[sampled.length - 1] !== pts[pts.length - 1]) sampled.push(pts[pts.length - 1]);
  }

  const labels = sampled.map(d => new Date(d.scraped_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  const prices = sampled.map(d => d.discounted_price);
  const base = sampled.map(d => d.base_price);
  const minV = Math.min(...prices);
  const maxV = Math.max(...prices);

  // highlight tooltip for ATL
  const lowIdx = prices.indexOf(minV);
  const pointColors = prices.map((_, i) => i === lowIdx ? CHART_C.saffron : CHART_C.leaf);
  const pointRadii = prices.map((_, i) => i === lowIdx ? 5 : 3);

  phChart = new Chart($('#phmCanvas'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Sale Price',
          data: prices,
          borderColor: CHART_C.leaf,
          backgroundColor: 'rgba(95,184,111,.15)',
          fill: true,
          tension: .25,
          pointRadius: pointRadii,
          pointHoverRadius: 6,
          pointBackgroundColor: pointColors,
          borderWidth: 2.5,
          segment: { borderColor: ctx => ctx.p1.parsed.y <= minV + 0.001 ? CHART_C.saffron : CHART_C.leaf }
        },
        {
          label: 'Base Price',
          data: base,
          borderColor: CHART_C.faint,
          borderDash: [5, 5],
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
          tension: .25
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: CHART_C.text, font: { family: "'Space Grotesk', sans-serif" }, usePointStyle: true, pointStyle: 'line' } },
        tooltip: {
          backgroundColor: CHART_C.card,
          borderColor: CHART_C.border2,
          borderWidth: 1,
          titleColor: CHART_C.text,
          bodyColor: CHART_C.text,
          bodyFont: { family: "'IBM Plex Mono', monospace" },
          callbacks: {
            label: ctx => {
              if (ctx.datasetIndex === 1) return `Base: ${fmt(ctx.parsed.y)}`;
              const isLow = ctx.parsed.y <= minV + 0.001;
              return `${isLow ? '★ All-Time Low · ' : ''}Sale: ${fmt(ctx.parsed.y)}`;
            }
          }
        },
        atlLine: { display: true, low: minV, minV }
      },
      scales: {
        x: { ticks: { color: CHART_C.dim, font: { family: "'IBM Plex Mono', monospace", size: 9 }, maxRotation: 60, autoSkip: true, maxTicksLimit: 12 }, grid: { color: CHART_C.border } },
        y: {
          ticks: { color: CHART_C.dim, font: { family: "'IBM Plex Mono', monospace" }, callback: v => TAKA + v },
          grid: { color: CHART_C.border },
          min: Math.min(minV * .92, minV - 5),
          max: maxV * 1.06
        }
      }
    }
  });

  log('ok', `Chart drawn: ${sampled.length} points (${pts.length} in range)`);
}

function renderPHTable() {
  if (!phState.data.length) return;
  const days = phState.range;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  let pts = phState.data;
  if (days !== 9999) pts = phState.data.filter(d => new Date(d.scraped_at) >= cutoff);

  // Table shows each distinct price-change event (newest first)
  const rows = [];
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    if (i === 0) { rows.push(cur); continue; }
    const prev = pts[i - 1];
    if (cur.discounted_price !== prev.discounted_price) rows.push(cur);
  }
  rows.reverse();

  const s = phState.stats || {};
  const tb = $('#phmTableBody');
  if (!tb) return;
  tb.innerHTML = rows.map((r, idx) => {
    const prevPrice = idx < rows.length - 1 ? rows[idx + 1].discounted_price : null;
    const diff = prevPrice !== null ? r.discounted_price - prevPrice : 0;
    const isLow = s.low !== null && Math.abs(r.discounted_price - s.low) < 0.01;
    const isHigh = s.high !== null && Math.abs(r.discounted_price - s.high) < 0.01;
    const isCur = idx === 0;
    let tag = '';
    if (isCur) tag = '<span class="tag-cur">CURRENT</span>';
    if (isLow) tag += ' <span class="tag-low">LOW</span>';
    if (isHigh) tag += ' <span class="tag-high">HIGH</span>';
    return `<tr>
      <td class="date">${new Date(r.scraped_at).toLocaleDateString()}</td>
      <td class="px">${fmt(r.discounted_price)} ${tag}</td>
      <td class="px text-dim">${r.base_price ? fmt(r.base_price) : '—'}</td>
      <td class="chg ${pctColor(diff)}">${diff === 0 ? '·' : diff > 0 ? `▲ +${fmt(diff)}` : `▼ ${fmt(diff)}`}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" class="text-dim text-center">No price changes in this range</td></tr>';
}

async function loadPriceChanges() {
  try {
    const changes = await API('/api/top-movers?limit=30');
    const div = $('#phChanges');
    if (!changes.length) { div.style.display = 'none'; return; }
    div.style.display = 'block';
    window.__moversNav = changes.map(c => ({ product_id: c.product_id, name: c.name, image_path: c.image_path, category_name: c.category_name }));
    $('#phChangesBody').innerHTML = changes.map(c => `
      <tr onclick="showPH(${c.product_id},'${esc(c.name).replace(/'/g, "\\'")}', window.__moversNav)" style="cursor:pointer">
        <td>${esc(c.name)}</td>
        <td><span class="badge cat">${esc(c.category_name)}</span></td>
        <td class="px text-dim">${fmt(c.old_price)}</td>
        <td class="px">${fmt(c.new_price)}</td>
        <td class="chg ${c.price_diff > 0 ? 'up' : 'down'}">${c.price_diff > 0 ? '▲' : '▼'} ${fmt(Math.abs(c.price_diff))} (${Math.abs(c.pct || 0).toFixed(1)}%)</td>
        <td class="date">${new Date(c.old_date).toLocaleDateString()}</td>
      </tr>`).join('');
  } catch (e) { /* silently skip */ }
}

// ============================================================
// WATCHLIST
// ============================================================
function saveWatchlist() {
  localStorage.setItem('foodie_watchlist', JSON.stringify(watchlist));
  $('#wlCount').textContent = watchlist.length;
}

function toggleWatch(productId, name) {
  if (watchlist.includes(productId)) {
    watchlist = watchlist.filter(id => id !== productId);
    log('info', `Removed from watchlist: ${name}`);
  } else {
    watchlist.push(productId);
    log('ok', `Added to watchlist: ${name}`);
  }
  saveWatchlist();
  refreshWatchlistChips();
  loadWatchlist();
}

function refreshWatchlistChips() {
  const chips = $('#wlChips');
  if (!watchlist.length) { chips.style.display = 'none'; return; }
  chips.style.display = 'flex';
  chips.innerHTML = '<span style="font-size:.65rem;color:var(--faint);font-family:var(--font-mono);letter-spacing:.1em;text-transform:uppercase;align-self:center">Watching:</span>' +
    watchlist.map(id => {
      const p = allProducts.find(x => x.product_id === id);
      return `<span class="wl-chip" onclick="showPH(${id},'${esc(p ? p.name : id).replace(/'/g, "\\'")}', window.__wlNav)">
        <span class="nm">${esc(p ? p.name : id)}</span>
        <span class="px">${p ? fmt(p.discounted_price) : ''}</span>
        <button class="x" onclick="event.stopPropagation();toggleWatch(${id},'')">✕</button>
      </span>`;
    }).join('');
}

async function loadWatchlist() {
  const grid = $('#wlGrid');
  if (!watchlist.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="big">Your board is empty</div>Open any product&apos;s Price Board and hit <b>☆ Track</b> to follow its price here.</div>';
    return;
  }
  grid.innerHTML = '<div class="loading">Loading watchlist...</div>';
  const results = [];
  for (const id of watchlist) {
    try {
      const r = await API(`/api/parquet/price-history/${id}?days=3650`);
      if (r.stats && r.data) results.push({ id, stats: r.stats, data: r.data });
    } catch (e) { /* skip */ }
  }
  if (!results.length) { grid.innerHTML = '<div class="empty"><div class="big">Could not load watchlist</div></div>'; return; }
  window.__wlNav = results.map(({ id, stats, data }) => {
    const last = data[data.length - 1] || {};
    return { product_id: id, name: last.name || `#${id}`, image_path: last.image_path, sku: last.sku, category_name: last.category_name };
  });
  grid.innerHTML = results.map(({ id, stats, data }) => {
    const name = data[data.length - 1]?.name || `#${id}`;
    const sku = data[data.length - 1]?.sku || '';
    const cat = data[data.length - 1]?.category_name || '';
    const img = data[data.length - 1]?.image_path;
    const chg = stats.change_30d;
    const spark = data.slice(-40).map(d => d.discounted_price);
    const sparkId = `spark${id}`;
    const chgCls = pctColor(chg);
    const chgTxt = chg === null || chg === undefined ? '—' : `${chg > 0 ? '▲ +' : '▼ '}${Math.abs(chg).toFixed(1)}%`;
    return `<div class="wl-card" onclick="showPH(${id},'${esc(name).replace(/'/g, "\\'")}', window.__wlNav)">
      <button class="wl-remove" onclick="event.stopPropagation();toggleWatch(${id},'${esc(name).replace(/'/g, "\\'")}')" title="Untrack">✕</button>
      <div class="wl-name">${esc(name)}</div>
      <div class="wl-cat mono">${esc(sku)} · ${esc(cat)}</div>
      <div class="wl-row">
        <span class="wl-price">${fmt(stats.current)}</span>
        <span class="wl-change ${chgCls}">${chgTxt}</span>
      </div>
      <div class="text-xs text-dim mono">low ${fmt(stats.low)} · avg ${fmt(stats.avg)}</div>
      <canvas class="wl-spark" id="${sparkId}"></canvas>
    </div>`;
  }).join('');
  renderSparks(results);
}

function renderSparks(results) {
  results.forEach(({ id, data }) => {
    const c = document.getElementById(`spark${id}`);
    if (!c || typeof Chart === 'undefined') return;
    const spark = data.slice(-40).map(d => ({ x: new Date(d.scraped_at), y: d.discounted_price }));
    new Chart(c, {
      type: 'line',
      data: { datasets: [{ data: spark, borderColor: CHART_C.saffron, borderWidth: 1.5, pointRadius: 0, fill: false, tension: .3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } }
    });
  });
}

async function refreshWatchlist() {
  log('info', 'Refreshing watchlist prices...');
  await loadWatchlist();
}

// ---- Categories ----
async function loadCategories() {
  log('info', 'Loading categories...');
  const cats = await API('/api/categories');

  const sel = $('#catFilter');
  sel.innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option value="${c.category_id}">${esc(c.category_name)} (${c.product_count})</option>`).join('');

  const maxCount = Math.max(...cats.map(c => c.product_count), 1);
  const cards = $('#catCards');
  cards.innerHTML = cats.map(c => {
    const discPct = c.product_count > 0 ? Math.round(c.discounted_count / c.product_count * 100) : 0;
    return `
    <div class="card" style="cursor:pointer" onclick="$('#catFilter').value='${c.category_id}';switchTab('products');loadProducts(1)">
      <h3>${esc(c.category_name)}</h3>
      <div class="flex" style="justify-content:space-between;align-items:flex-end">
        <div>
          <div class="stat" style="font-size:1.6rem;font-weight:700;font-family:var(--font-mono)">${c.product_count}</div>
          <div class="text-sm text-dim" style="font-family:var(--font-mono)">products</div>
        </div>
        <div style="text-align:right">
          <div class="mono" style="font-size:.9rem;color:var(--leaf);font-weight:700">${fmt(c.avg_price)}</div>
          <div class="text-xs text-dim">avg</div>
        </div>
      </div>
      <div class="text-xs text-dim mt-8" style="font-family:var(--font-mono)">${c.discounted_count} discounted · ${discPct}%</div>
      <div class="bar-wrap" style="height:5px;background:var(--surface);border-radius:3px;margin-top:8px;overflow:hidden"><div class="bar" style="width:${Math.round(c.product_count / maxCount * 100)}%;background:${CHART_C.saffron}"></div></div>
    </div>`;
  }).join('');

  log('ok', `Loaded ${cats.length} categories`);
}

// ---- Debug ----
async function pollLogs() {
  log('info', 'Polling latest log file...');
  try {
    const r = await fetch('/api/analytics');
    const d = await r.json();
    log('ok', `API alive. ${d.total_products} products in database`);
    if (d.scrape_runs.length) {
      const runs = d.scrape_runs;
      const tb = $('#runsBody');
      tb.innerHTML = runs.map(r => `
        <tr>
          <td class="mono">${r.id}</td>
          <td class="text-sm">${r.started_at ? new Date(r.started_at).toLocaleString() : '—'}</td>
          <td class="text-sm">${r.finished_at ? new Date(r.finished_at).toLocaleString() : '—'}</td>
          <td class="mono">${r.products_scraped || '—'}</td>
          <td class="mono">${r.categories_scraped || '—'}</td>
          <td><span class="badge ${r.status === 'completed' ? 'stock' : 'oos'}">${r.status}</span></td>
        </tr>`).join('');
    }
  } catch (e) {
    log('error', `API unreachable: ${e.message}`);
  }
}

// ---- Utilities ----
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

// ---- Scraper ----
async function triggerScrape() {
  const btn = $('#scrapeBtn');
  btn.disabled = true; btn.textContent = 'Starting...';
  try {
    const r = await fetch('/api/scrape', { method: 'POST' });
    const d = await r.json();
    if (d.status === 'already_running') {
      log('warn', 'Scraper already running');
    } else {
      log('ok', 'Scraper started');
      pollScraperStatus();
    }
  } catch (e) { log('error', `Scraper trigger failed: ${e.message}`); }
  btn.disabled = false; btn.textContent = '⟳ Run Scraper';
}

async function pollScraperStatus() {
  const dot = $('#scraperDot');
  const txt = $('#scraperText');
  const poll = async () => {
    try {
      const r = await fetch('/api/scrape/status');
      const s = await r.json();
      if (s.running) {
        dot.className = 'dot running'; txt.textContent = 'Scraping...';
        setTimeout(poll, 3000);
      } else {
        dot.className = 'dot done'; txt.textContent = s.returncode === 0 ? 'Done' : 'Failed';
        log(s.returncode === 0 ? 'ok' : 'error', `Scraper finished (code ${s.returncode})`);
        if (s.returncode === 0) await refreshAll();
      }
    } catch (e) { dot.className = 'dot idle'; txt.textContent = 'Error'; }
  };
  poll();
}

// ---- Deal classification ----
async function reloadDealData() {
  newDaysThreshold = parseInt($('#newDaysInput').value) || 7;
  log('info', `Loading deal classification (new=${newDaysThreshold}d)...`);
  const d = await API(`/api/deal-classification?new_days=${newDaysThreshold}`);
  dealData = {};
  d.forEach(p => dealData[p.product_id] = p);

  let great = 0, good = 0, wait = 0, atl = 0, nw = 0, pc = 0;
  d.forEach(p => {
    if (p.deal === 'great_deal') great++;
    else if (p.deal === 'good_buy') good++;
    else if (p.deal === 'wait') wait++;
    if (p.is_atl) atl++;
    if (p.is_new) nw++;
    if (p.pc_diff !== null && p.pc_diff !== undefined) pc++;
  });
  $('#cntGreat').textContent = great;
  $('#cntGood').textContent = good;
  $('#cntWait').textContent = wait;
  $('#cntATL').textContent = atl;
  $('#cntNew').textContent = nw;
  $('#cntPC').textContent = pc;
  log('ok', `Deal data: ${d.length} products classified`);
}

function setDealFilter(f) {
  dealFilter = dealFilter === f ? 'all' : f;
  document.querySelectorAll('.intel-btn[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === dealFilter));
  loadProducts(1);
}

function getDealBadge(p) {
  const dd = dealData[p.product_id];
  if (!dd) return '';
  if (dd.pc_diff !== null && dd.pc_diff !== undefined) {
    return dd.pc_diff < 0
      ? `<span class="deal-badge pc-down">▼${Math.abs(dd.pc_pct || 0).toFixed(0)}%</span>`
      : `<span class="deal-badge pc-up">▲${(dd.pc_pct || 0).toFixed(0)}%</span>`;
  }
  if (dd.is_atl) return '<span class="deal-badge atl">★ ALL TIME LOW</span>';
  if (dd.is_new) return '<span class="deal-badge new">NEW</span>';
  if (dd.deal === 'great_deal') return `<span class="deal-badge great">▼${(dd.deal_pct || 0).toFixed(0)}% OFF</span>`;
  if (dd.deal === 'good_buy') return `<span class="deal-badge good">▼${(dd.deal_pct || 0).toFixed(0)}%</span>`;
  if (dd.deal === 'wait') return '<span class="deal-badge wait">WAIT</span>';
  return '';
}

function filterByDeal(items) {
  if (dealFilter === 'all') return items;
  return items.filter(p => {
    const dd = dealData[p.product_id];
    if (!dd) return false;
    switch (dealFilter) {
      case 'great_deal': return dd.deal === 'great_deal';
      case 'good_buy': return dd.deal === 'good_buy';
      case 'wait': return dd.deal === 'wait';
      case 'all_time_low': return dd.is_atl;
      case 'new_items': return dd.is_new;
      case 'price_change': return dd.pc_diff !== null && dd.pc_diff !== undefined;
      default: return true;
    }
  });
}

// ---- Compare Cart ----
function toggleCompareMode() {
  compareMode = !compareMode;
  $('#compareModeBtn').classList.toggle('active', compareMode);
  log('info', compareMode ? 'Compare mode ON — click products to add' : 'Compare mode OFF');
}

function addToCart(productId) {
  if (!compareMode) return;
  if (compareCart.includes(productId)) {
    compareCart = compareCart.filter(id => id !== productId);
  } else {
    compareCart.push(productId);
  }
  localStorage.setItem('foodie_compare_cart', JSON.stringify(compareCart));
  $('#cartCount').textContent = compareCart.length;
  log('info', `Cart: ${compareCart.length} items`);
  loadProducts(currentPage);
}

function openCompareCart() {
  if (compareCart.length === 0) { log('warn', 'Cart is empty — enable Compare mode and click products'); return; }
  switchTab('price-history');
  const names = compareCart.map(id => {
    const p = allProducts.find(x => x.product_id === id);
    return p ? p.name : id;
  }).join(', ');
  log('info', `Compare cart: ${names}`);
  const first = allProducts.find(p => p.product_id === compareCart[0]);
  if (first) { $('#phSearch').value = first.name; searchForHistory(); }
}

// ---- Mean Analysis ----
async function runMeanAnalysis() {
  const start = $('#meanStartDate').value;
  const end = $('#meanEndDate').value;
  if (!start || !end) { log('warn', 'Select date range first'); return; }
  log('info', `Mean analysis: ${start} to ${end}`);
  const d = await API(`/api/mean-analysis?start_date=${start}&end_date=${end}`);
  if (!d.length) { $('#meanResult').textContent = 'No data in range'; return; }
  const avgMean = Math.round(d.reduce((s, r) => s + r.mean_price, 0) / d.length);
  const totalProducts = d.length;
  const highSpread = d.filter(r => (r.max_price - r.min_price) > r.mean_price * 0.2).length;
  $('#meanResult').innerHTML = `${totalProducts} products | Avg mean: ${TAKA}${avgMean.toLocaleString()} | ${highSpread} with &gt;20% spread`;
  log('ok', `Mean analysis: ${totalProducts} products, avg ${TAKA}${avgMean.toLocaleString()}`);
}

// ---- Refresh all ----
async function refreshAll() {
  log('info', 'Refreshing all data...');
  renderHeaderDate();
  await Promise.all([loadOverview(), loadCategories()]);
  await loadChalkBoard();
  await loadTicker();
  await reloadDealData();
  await loadProducts(1);
  await loadAnalytics();
  saveWatchlist();
  log('ok', 'All data refreshed');
}

// ---- Keyboard shortcuts ----
document.addEventListener('keydown', e => {
  if (phModalOpen) {
    if (e.key === 'Escape') { closePHModal(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); navPH(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); navPH(1); return; }
    return;
  }
  if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    e.preventDefault(); $('#searchInput').focus(); switchTab('products');
  }
  if (e.key === 'Escape') document.activeElement.blur();
});

// ---- Init ----
(async () => {
  log('info', 'Initializing daily price board...');

  const today = new Date();
  const thirtyAgo = new Date(today); thirtyAgo.setDate(today.getDate() - 30);
  $('#meanEndDate').value = today.toISOString().split('T')[0];
  $('#meanStartDate').value = thirtyAgo.toISOString().split('T')[0];
  saveWatchlist();

  try {
    await refreshAll();
    log('ok', 'Price board ready');

    const analytics = await API('/api/analytics');
    if (analytics.total_products === 0) {
      log('warn', 'No products in DB — auto-starting scraper');
      await triggerScrape();
    }
  } catch (e) {
    log('error', `Init failed: ${e.message}. Is the scraper DB populated?`);
  }

  pollScraperStatus();
})();