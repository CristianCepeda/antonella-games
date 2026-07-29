// ---------- Config ----------

const STATION_DEFS = [
  { id: 'griddle', food: 'pancakes', duration: 4000, name: 'Griddle' },
  { id: 'skillet', food: 'eggs', duration: 3000, name: 'Skillet' },
  { id: 'stove', food: 'bacon', duration: 3000, name: 'Stove' },
  { id: 'coffeemachine', food: 'coffee', duration: 2000, name: 'Coffee Machine' },
];

const FOOD_KEYS = STATION_DEFS.map(s => s.food);
const TABLE_COUNT = 4;
const MAX_QUEUE = 5;
const TICK_MS = 100;

const CUSTOMER_SKINS = [
  { shirt: '#e05a5a', skin: '#f2c197' },
  { shirt: '#4a90d9', skin: '#d9a066' },
  { shirt: '#f2a541', skin: '#8d5524' },
  { shirt: '#7bb662', skin: '#f2c197' },
  { shirt: '#9b6bd9', skin: '#d9a066' },
];

function dayConfig(day) {
  return {
    goal: 30 + (day - 1) * 25,
    patienceMs: Math.max(7000, 15000 - (day - 1) * 900),
    spawnIntervalMin: Math.max(1200, 3200 - (day - 1) * 250),
    spawnIntervalMax: Math.max(2200, 4800 - (day - 1) * 250),
  };
}

// ---------- State ----------

let state = null;
let tickHandle = null;

function newGameState() {
  return {
    day: 1,
    money: 0,
    lives: 3,
    queue: [],
    tables: Array.from({ length: TABLE_COUNT }, (_, i) => ({ id: i, customer: null })),
    stations: STATION_DEFS.map(def => ({ ...def, cooking: false, ready: false, cookElapsed: 0 })),
    nextCustomerId: 1,
    spawnTimer: 0,
    spawnInterval: 3000,
    running: false,
  };
}

function applyDayConfig() {
  const cfg = dayConfig(state.day);
  state.goal = cfg.goal;
  state.patienceMs = cfg.patienceMs;
  state.spawnMin = cfg.spawnIntervalMin;
  state.spawnMax = cfg.spawnIntervalMax;
  state.spawnInterval = randRange(cfg.spawnIntervalMin, cfg.spawnIntervalMax);
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function randomFood() {
  return FOOD_KEYS[Math.floor(Math.random() * FOOD_KEYS.length)];
}

function randomSkin() {
  return CUSTOMER_SKINS[Math.floor(Math.random() * CUSTOMER_SKINS.length)];
}

// ---------- Screen management ----------

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function startNewGame() {
  state = newGameState();
  applyDayConfig();
  state.running = true;
  showScreen('game-screen');
  renderAll();
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(tick, TICK_MS);
}

function startDay(day) {
  state.day = day;
  applyDayConfig();
  state.queue = [];
  state.tables.forEach(t => (t.customer = null));
  state.stations.forEach(s => { s.cooking = false; s.ready = false; s.cookElapsed = 0; });
  state.spawnTimer = 0;
  state.money = 0;
  state.running = true;
  showScreen('game-screen');
  renderAll();
}

function endGame() {
  state.running = false;
  clearInterval(tickHandle);
  document.getElementById('gameover-summary').textContent =
    `You made it to Day ${state.day} with $${state.money} earned. Give it another shot!`;
  showScreen('gameover-screen');
}

function completeLevel() {
  state.running = false;
  document.getElementById('levelcomplete-summary').textContent =
    `Day ${state.day} goal of $${state.goal} reached! Tomorrow's crowd will be hungrier and less patient.`;
  showScreen('levelcomplete-screen');
}

// ---------- Game loop ----------

function tick() {
  if (!state || !state.running) return;

  let queueChanged = false;
  let stationsChanged = false;

  state.spawnTimer += TICK_MS;
  if (state.spawnTimer >= state.spawnInterval && state.queue.length < MAX_QUEUE) {
    spawnCustomer();
    state.spawnTimer = 0;
    state.spawnInterval = randRange(state.spawnMin, state.spawnMax);
    queueChanged = true;
  }

  state.tables.forEach(table => {
    const c = table.customer;
    if (c && !c.leaving) {
      c.patienceRemaining -= TICK_MS;
      if (c.patienceRemaining <= 0) {
        customerLeavesAngry(table);
      }
    }
  });

  state.stations.forEach(st => {
    if (st.cooking && !st.ready) {
      st.cookElapsed += TICK_MS;
      if (st.cookElapsed >= st.duration) {
        st.cooking = false;
        st.ready = true;
        stationsChanged = true;
      }
    }
  });

  // Only rebuild a DOM subtree when something structural actually changed.
  // Rebuilding every tick would occasionally swap out the exact element the
  // player is mid-tap on, causing taps to be silently dropped. Smooth bar
  // animations are updated in place instead of a full re-render.
  renderHUD();
  updatePatienceBars();
  updateCookBars();
  if (queueChanged) renderQueue();
  if (stationsChanged) {
    renderStations();
    tryAutoServe();
  }
}

function updatePatienceBars() {
  state.tables.forEach(table => {
    const c = table.customer;
    if (!c || c.leaving) return;
    const tableEl = document.querySelector(`.table[data-table-id="${table.id}"]`);
    const bar = tableEl && tableEl.querySelector('.patience-bar');
    if (!bar) return;
    const pct = Math.max(0, (c.patienceRemaining / c.patienceTotal) * 100);
    const barColor = pct > 50 ? '#43a047' : pct > 20 ? '#fbc02d' : '#e53935';
    bar.style.width = `${pct}%`;
    bar.style.backgroundColor = barColor;
  });
}

function updateCookBars() {
  state.stations.forEach(st => {
    if (!st.cooking) return;
    const stEl = document.querySelector(`.station[data-station-id="${st.id}"]`);
    const bar = stEl && stEl.querySelector('.cook-bar');
    if (!bar) return;
    const pct = Math.min(100, (st.cookElapsed / st.duration) * 100);
    bar.style.width = `${pct}%`;
  });
}

function spawnCustomer() {
  const skin = randomSkin();
  state.queue.push({
    id: state.nextCustomerId++,
    order: randomFood(),
    skin,
    status: 'queued',
  });
}

function customerLeavesAngry(table) {
  const c = table.customer;
  c.leaving = true;
  c.mood = 'angry';
  state.lives -= 1;
  showPopupNearTable(table.id, '-1 ❤️', 'bad');
  renderHUD();
  renderTables();
  setTimeout(() => {
    table.customer = null;
    renderTables();
    if (state.lives <= 0) endGame();
  }, 550);
}

// ---------- Player actions ----------
// One tap seats a customer, one tap starts a station cooking. Food is
// delivered automatically to a matching customer as soon as it's ready.

function tapQueueCustomer(customerId) {
  const idx = state.queue.findIndex(c => c.id === customerId);
  if (idx === -1) return;

  const table = state.tables.find(t => !t.customer);
  if (!table) {
    showPopupNearTop('No open tables!', 'bad');
    return;
  }

  const customer = state.queue.splice(idx, 1)[0];
  customer.status = 'seated';
  customer.tableId = table.id;
  customer.patienceTotal = state.patienceMs;
  customer.patienceRemaining = state.patienceMs;
  customer.mood = 'normal';
  table.customer = customer;

  renderQueue();
  renderTables();
  tryAutoServe();
}

function clickStation(stationId) {
  const station = state.stations.find(s => s.id === stationId);
  if (!station) return;
  if (station.cooking || station.ready) return; // already cooking or waiting to be served

  station.cooking = true;
  station.cookElapsed = 0;
  renderStations();
}

function tryAutoServe() {
  let servedAny = false;

  state.stations.forEach(st => {
    if (!st.ready) return;

    let best = null;
    state.tables.forEach(table => {
      const c = table.customer;
      if (c && !c.leaving && c.order === st.food) {
        if (!best || c.patienceRemaining < best.customer.patienceRemaining) {
          best = { table, customer: c };
        }
      }
    });

    if (best) {
      serveCustomer(best.table, st);
      servedAny = true;
    }
  });

  if (servedAny) {
    renderStations();
  }
}

function serveCustomer(table, station) {
  const customer = table.customer;
  const speedBonus = Math.round((customer.patienceRemaining / customer.patienceTotal) * 5);
  const earned = 8 + speedBonus;

  state.money += earned;
  customer.leaving = true;
  customer.mood = 'happy';
  showPopupNearTable(table.id, `+$${earned}`, 'good');

  station.ready = false;
  station.cookElapsed = 0;

  setTimeout(() => {
    table.customer = null;
    renderTables();
    if (state.money >= state.goal) completeLevel();
  }, 500);
}

// ---------- Rendering ----------

function renderAll() {
  if (!state) return;
  renderHUD();
  renderQueue();
  renderTables();
  renderStations();
}

function renderHUD() {
  document.getElementById('hud-day').textContent = state.day;
  document.getElementById('hud-money').textContent = `$${state.money}`;
  document.getElementById('hud-goal').textContent = `$${state.goal}`;
  document.getElementById('hud-lives').textContent = '❤️'.repeat(Math.max(0, state.lives));
}

function renderQueue() {
  const el = document.getElementById('queue');
  el.innerHTML = '';
  state.queue.forEach(c => {
    const div = document.createElement('div');
    div.className = 'entity customer tappable';
    div.innerHTML = `
      ${svgCustomer(c.skin.shirt, c.skin.skin)}
      <div class="entity-label">${foodLabel(c.order)} ${foodEmoji(c.order)}</div>
    `;
    div.addEventListener('click', () => tapQueueCustomer(c.id));
    el.appendChild(div);
  });
}

function renderTables() {
  const el = document.getElementById('tables');
  el.innerHTML = '';
  state.tables.forEach(table => {
    const wrap = document.createElement('div');
    wrap.className = 'table' + (!table.customer ? ' open' : '');
    wrap.dataset.tableId = table.id;

    const slot = document.createElement('div');
    slot.className = 'table-slot';

    if (table.customer) {
      const c = table.customer;
      const cdiv = document.createElement('div');
      cdiv.className = 'entity customer' + (c.leaving ? ' leaving' : '');

      const moodIcon = c.mood === 'happy' ? '😋' : c.mood === 'angry' ? '😠' : '';
      const pct = Math.max(0, (c.patienceRemaining / c.patienceTotal) * 100);
      const barColor = pct > 50 ? '#43a047' : pct > 20 ? '#fbc02d' : '#e53935';

      cdiv.innerHTML = `
        <div class="order-bubble">${foodEmoji(c.order)}</div>
        ${moodIcon ? `<div class="mood-face">${moodIcon}</div>` : ''}
        ${svgCustomer(c.skin.shirt, c.skin.skin)}
        <div class="patience-bar-wrap"><div class="patience-bar" style="width:${pct}%;background:${barColor}"></div></div>
      `;
      slot.appendChild(cdiv);
    }

    wrap.appendChild(slot);
    const tableGraphic = document.createElement('div');
    tableGraphic.className = 'table-graphic';
    tableGraphic.innerHTML = svgTable();
    wrap.appendChild(tableGraphic);

    el.appendChild(wrap);
  });
}

function renderStations() {
  const el = document.getElementById('stations');
  el.innerHTML = '';
  state.stations.forEach(st => {
    const div = document.createElement('div');
    let cls = 'entity station';
    if (st.cooking) cls += ' cooking';
    if (st.ready) cls += ' ready';
    if (!st.cooking && !st.ready) cls += ' tappable';
    div.className = cls;
    div.dataset.stationId = st.id;

    const pct = st.cooking ? Math.min(100, (st.cookElapsed / st.duration) * 100) : 0;

    div.innerHTML = `
      ${st.ready ? `<div class="station-food-icon">${foodEmoji(st.food)} waiting for order!</div>` : ''}
      ${svgStation(st.food)}
      <div class="entity-label">${st.name}</div>
      <div class="entity-sublabel">${foodEmoji(st.food)} ${foodLabel(st.food)}</div>
      <div class="cook-bar-wrap ${st.cooking ? 'active' : ''}"><div class="cook-bar" style="width:${pct}%"></div></div>
    `;
    div.addEventListener('click', () => clickStation(st.id));
    el.appendChild(div);
  });
}

function showPopupNearTable(tableId, text, type) {
  const tableEl = document.querySelector(`.table[data-table-id="${tableId}"]`);
  const layer = document.getElementById('popup-layer');
  if (!tableEl || !layer) return;

  const tableRect = tableEl.getBoundingClientRect();
  const layerRect = layer.getBoundingClientRect();

  const popup = document.createElement('div');
  popup.className = `popup ${type}`;
  popup.textContent = text;
  popup.style.left = `${tableRect.left - layerRect.left + tableRect.width / 2 - 20}px`;
  popup.style.top = `${tableRect.top - layerRect.top}px`;
  layer.appendChild(popup);
  setTimeout(() => popup.remove(), 1000);
}

function showPopupNearTop(text, type) {
  const layer = document.getElementById('popup-layer');
  if (!layer) return;
  const popup = document.createElement('div');
  popup.className = `popup ${type}`;
  popup.textContent = text;
  popup.style.left = '50%';
  popup.style.top = '10px';
  popup.style.transform = 'translateX(-50%)';
  layer.appendChild(popup);
  setTimeout(() => popup.remove(), 1000);
}

// ---------- Event wiring ----------

document.getElementById('start-btn').addEventListener('click', startNewGame);

document.getElementById('next-day-btn').addEventListener('click', () => {
  startDay(state.day + 1);
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(tick, TICK_MS);
});

document.getElementById('retry-btn').addEventListener('click', startNewGame);
