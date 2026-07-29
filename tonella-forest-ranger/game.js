// ---------- Canvas setup ----------
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ---------- Isometric projection ----------
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;

function gridToScreen(gx, gy) {
  return {
    x: (gx - gy) * (TILE_WIDTH / 2),
    y: (gx + gy) * (TILE_HEIGHT / 2),
  };
}

// ---------- Procedural noise (seeded value noise) ----------
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function makeNoise2D(seed) {
  const rand = mulberry32(seed);
  const perm = new Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = perm.concat(perm);
  const grad = new Array(256);
  for (let i = 0; i < 256; i++) grad[i] = rand() * Math.PI * 2;

  return function noise2D(x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const dot = (ix, iy, fx, fy) => {
      const angle = grad[p[(p[ix & 255] + iy) & 255] & 255];
      return Math.cos(angle) * fx + Math.sin(angle) * fy;
    };

    const n00 = dot(xi, yi, xf, yf);
    const n10 = dot(xi + 1, yi, xf - 1, yf);
    const n01 = dot(xi, yi + 1, xf, yf - 1);
    const n11 = dot(xi + 1, yi + 1, xf - 1, yf - 1);

    const u = smoothstep(xf);
    const v = smoothstep(yf);
    const nx0 = n00 * (1 - u) + n10 * u;
    const nx1 = n01 * (1 - u) + n11 * u;
    // roughly -0.7..0.7 -> remap to 0..1
    return (nx0 * (1 - v) + nx1 * v) * 0.7 + 0.5;
  };
}

let worldSeed = Math.floor(Math.random() * 1e9);
let terrainNoise = makeNoise2D(worldSeed);
let biomeNoise = makeNoise2D(worldSeed + 101);
let treeDensityNoise = makeNoise2D(worldSeed + 202);
let rockDensityNoise = makeNoise2D(worldSeed + 303);
let flowerDensityNoise = makeNoise2D(worldSeed + 404);

const WATER_THRESHOLD = 0.24;
const TERRAIN_SCALE = 0.09;
const BIOME_SCALE = 0.02;

function isWaterAt(gx, gy) {
  return terrainNoise(gx * TERRAIN_SCALE, gy * TERRAIN_SCALE) < WATER_THRESHOLD;
}

const REALMS = {
  meadow: {
    skyDay: '#7ec8e3', skyNight: '#0a0e2a',
    groundDay: '#5a8f4f', groundDayAlt: '#4e7d44',
    groundNight: '#1c2b1a', groundNightAlt: '#233a20',
  },
  ember: {
    skyDay: '#e0a86b', skyNight: '#2a0a0a',
    groundDay: '#8f5a3d', groundDayAlt: '#7d4e30',
    groundNight: '#3a1410', groundNightAlt: '#4a1c14',
  },
  frost: {
    skyDay: '#cfe8f5', skyNight: '#0d1a2a',
    groundDay: '#c9dde6', groundDayAlt: '#b3ccd8',
    groundNight: '#233245', groundNightAlt: '#2c3d52',
  },
  mire: {
    skyDay: '#a3a86b', skyNight: '#141a12',
    groundDay: '#5a6b3d', groundDayAlt: '#4e5d34',
    groundNight: '#1a2214', groundNightAlt: '#20291a',
  },
};
const REALM_KEYS = Object.keys(REALMS);

function getRealmAt(gx, gy) {
  const n = biomeNoise(gx * BIOME_SCALE, gy * BIOME_SCALE);
  const idx = Math.min(REALM_KEYS.length - 1, Math.floor(n * REALM_KEYS.length));
  return REALM_KEYS[idx];
}

// ---------- Audio (simple synthesized beeps) ----------
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
window.addEventListener('keydown', ensureAudio, { once: true });
window.addEventListener('click', ensureAudio, { once: true });

function playBeep(freq, duration, type, volume, delay) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + (delay || 0);
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume || 0.2, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

const sfx = {
  gather: () => playBeep(880, 0.08, 'square', 0.12),
  craft: () => { playBeep(523, 0.1, 'triangle', 0.18); playBeep(659, 0.12, 'triangle', 0.18, 0.1); },
  nightFall: () => playBeep(110, 0.7, 'sawtooth', 0.15),
  wolfSpotted: () => { playBeep(220, 0.2, 'square', 0.18); playBeep(180, 0.25, 'square', 0.18, 0.15); },
  eat: () => playBeep(660, 0.08, 'sine', 0.15),
  hit: () => playBeep(150, 0.1, 'square', 0.2),
  wolfDeath: () => { playBeep(300, 0.15, 'sawtooth', 0.15); playBeep(150, 0.2, 'sawtooth', 0.15, 0.12); },
};

// ---------- Input ----------
const keys = {};
const keysPressed = {}; // set for one frame on the keydown edge
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (!keys[k]) keysPressed[k] = true;
  keys[k] = true;
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

function consumeKeyPress(k) {
  if (keysPressed[k]) {
    keysPressed[k] = false;
    return true;
  }
  return false;
}

// ---------- Player ----------
const MAX_HUNGER = 100;
const MAX_WARMTH = 50;
const MAX_HEALTH = 100;

const MAX_STAMINA = 100;
const SPRINT_MULTIPLIER = 1.8;
const STAMINA_DRAIN_RATE = 25; // per second while sprinting
const STAMINA_REGEN_RATE = 15; // per second while not sprinting
const SPRINT_MIN_STAMINA = 10; // must regen above this before sprinting again once exhausted

function makePlayer() {
  return {
    gx: 0, // grid position (float, in tiles)
    gy: 0,
    speed: 3.5, // tiles per second
    hunger: MAX_HUNGER,
    warmth: MAX_WARMTH,
    health: MAX_HEALTH,
    stamina: MAX_STAMINA,
    exhausted: false,
    isSprinting: false,
  };
}

let player = makePlayer();

function updatePlayer(dt) {
  let dx = 0;
  let dy = 0;
  if (keys['w']) dy -= 1;
  if (keys['s']) dy += 1;
  if (keys['a']) dx -= 1;
  if (keys['d']) dx += 1;

  const isMoving = dx !== 0 || dy !== 0;

  if (player.exhausted && player.stamina >= SPRINT_MIN_STAMINA) {
    player.exhausted = false;
  }
  player.isSprinting = isMoving && keys['shift'] && player.stamina > 0 && !player.exhausted;

  if (player.isSprinting) {
    player.stamina = Math.max(0, player.stamina - STAMINA_DRAIN_RATE * dt);
    if (player.stamina <= 0) player.exhausted = true;
  } else {
    player.stamina = Math.min(MAX_STAMINA, player.stamina + STAMINA_REGEN_RATE * dt);
  }

  if (isMoving) {
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;

    const speed = player.isSprinting ? player.speed * SPRINT_MULTIPLIER : player.speed;
    const newGx = player.gx + dx * speed * dt;
    const newGy = player.gy + dy * speed * dt;

    if (!isWaterAt(Math.round(newGx), Math.round(player.gy))) {
      player.gx = newGx;
    }
    if (!isWaterAt(Math.round(player.gx), Math.round(newGy))) {
      player.gy = newGy;
    }
  }
}

function updateHunger(dt) {
  player.hunger = Math.max(0, player.hunger - dt);
  if (player.hunger <= 0) {
    triggerDeath('Starved', `You survived to Day ${dayCount}, ${formatClock()}`);
  }
}

// A player standing on a shelter tile is considered "inside" it.
function isPlayerSheltered() {
  return isShelterAt(Math.round(player.gx), Math.round(player.gy));
}

function isNearCampfire(gx, gy, radius) {
  return placedCampfires.some((cf) => Math.hypot(cf.gx - gx, cf.gy - gy) <= radius);
}

const WARMTH_OUTSIDE_NIGHT_RATE = -1;
const WARMTH_SHELTERED_CAMPFIRE_RATE = 2;
const WARMTH_DAY_REGEN_RATE = 1;

function updateWarmth(dt) {
  let rate;
  if (isNight()) {
    rate = (isPlayerSheltered() && isNearCampfire(player.gx, player.gy, 1.5))
      ? WARMTH_SHELTERED_CAMPFIRE_RATE
      : WARMTH_OUTSIDE_NIGHT_RATE;
  } else {
    rate = WARMTH_DAY_REGEN_RATE;
  }
  player.warmth = Math.max(0, Math.min(MAX_WARMTH, player.warmth + rate * dt));
  if (player.warmth <= 0) {
    triggerDeath('Frozen', `You survived to Day ${dayCount}, ${formatClock()}`);
  }
}

// ---------- Day/Night cycle ----------
// gameTime: 0-100 = day, 100-200 = night, then loops.
const DAY_LENGTH = 100; // "units"
const NIGHT_LENGTH = 100;
const CYCLE_LENGTH = DAY_LENGTH + NIGHT_LENGTH;
const TIME_SPEED = 1; // units per second

let gameTime = 0; // 0..CYCLE_LENGTH
let dayCount = 1;

function updateTime(dt) {
  gameTime += dt * TIME_SPEED;
  if (gameTime >= CYCLE_LENGTH) {
    gameTime -= CYCLE_LENGTH;
    dayCount += 1;
  }
}

function isNight() {
  return gameTime >= DAY_LENGTH;
}

// Map gameTime to a clock string.
// Day: 0-100 units -> 6:00 AM to 8:00 PM (14 hours)
// Night: 100-200 units -> 8:00 PM to 6:00 AM (10 hours)
function formatClock() {
  let hoursFloat;
  if (gameTime < DAY_LENGTH) {
    const frac = gameTime / DAY_LENGTH;
    hoursFloat = 6 + frac * 14; // 6:00 -> 20:00
  } else {
    const frac = (gameTime - DAY_LENGTH) / NIGHT_LENGTH;
    hoursFloat = 20 + frac * 10; // 20:00 -> 30:00 (i.e. 6:00 next day)
  }
  hoursFloat = hoursFloat % 24;
  let hours24 = Math.floor(hoursFloat);
  const minutes = Math.floor((hoursFloat - hours24) * 60);
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;
  const minStr = minutes.toString().padStart(2, '0');
  return `${hours12}:${minStr} ${ampm}`;
}

const timeDisplay = document.getElementById('time-display');
const hungerFill = document.getElementById('hunger-bar-fill');
const hungerLabel = document.getElementById('hunger-label');
const warmthFill = document.getElementById('warmth-bar-fill');
const warmthLabel = document.getElementById('warmth-label');
const healthFill = document.getElementById('health-bar-fill');
const healthLabel = document.getElementById('health-label');
const staminaFill = document.getElementById('stamina-bar-fill');
const staminaLabel = document.getElementById('stamina-label');

function updateHUD() {
  timeDisplay.textContent = `Day ${dayCount} / ${formatClock()}`;

  const hungerPct = Math.max(0, Math.min(100, player.hunger));
  hungerFill.style.width = `${hungerPct}%`;
  hungerLabel.textContent = `Hunger: ${Math.ceil(hungerPct)}`;
  if (hungerPct <= 25) {
    hungerFill.style.background = '#c9432e';
  } else if (hungerPct <= 50) {
    hungerFill.style.background = '#e0a83d';
  } else {
    hungerFill.style.background = 'linear-gradient(90deg, #7bc142, #a9d94a)';
  }

  const warmthPct = Math.max(0, Math.min(100, (player.warmth / MAX_WARMTH) * 100));
  warmthFill.style.width = `${warmthPct}%`;
  warmthLabel.textContent = `Warmth: ${Math.ceil(player.warmth)}`;
  warmthFill.style.background = warmthPct <= 30 ? '#5aa3d9' : 'linear-gradient(90deg, #e0a83d, #f2c94c)';

  const healthPct = Math.max(0, Math.min(100, player.health));
  healthFill.style.width = `${healthPct}%`;
  healthLabel.textContent = `Health: ${Math.ceil(healthPct)}`;
  healthFill.style.background = healthPct <= 25 ? '#c9432e' : 'linear-gradient(90deg, #b5342a, #e0533d)';

  const staminaPct = Math.max(0, Math.min(100, player.stamina));
  staminaFill.style.width = `${staminaPct}%`;
  staminaLabel.textContent = player.isSprinting ? `Stamina: ${Math.ceil(staminaPct)} (sprinting)` : `Stamina: ${Math.ceil(staminaPct)}`;
  staminaFill.style.background = player.exhausted ? '#7a5230' : 'linear-gradient(90deg, #4a90d9, #7ec8e3)';
}

// ---------- Food (berries) ----------
const BERRY_HUNGER_VALUE = 20;
const BERRY_PICKUP_RADIUS = 0.6; // tiles
const BERRY_SPAWN_RADIUS = 20; // tiles from origin
const BERRY_COUNT = 40;

let berries = [];

function spawnBerries() {
  berries = [];
  let attempts = 0;
  while (berries.length < BERRY_COUNT && attempts < BERRY_COUNT * 40) {
    attempts++;
    const angle = Math.random() * Math.PI * 2;
    const dist = 2 + Math.random() * BERRY_SPAWN_RADIUS;
    const gx = Math.round(Math.cos(angle) * dist);
    const gy = Math.round(Math.sin(angle) * dist);
    if (isWaterAt(gx, gy)) continue;
    // cluster loosely with flower patches (berries grow near foliage)
    if (flowerDensityNoise(gx * 0.1, gy * 0.1) < 0.4) continue;
    berries.push({ gx, gy });
  }
}

function updateBerries() {
  for (let i = berries.length - 1; i >= 0; i--) {
    const b = berries[i];
    const dx = b.gx - player.gx;
    const dy = b.gy - player.gy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= BERRY_PICKUP_RADIUS) {
      player.hunger = Math.min(MAX_HUNGER, player.hunger + BERRY_HUNGER_VALUE);
      berries.splice(i, 1);
      sfx.eat();
    }
  }
}

function drawBerries(camX, camY) {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  for (const b of berries) {
    const s = gridToScreen(b.gx, b.gy);
    const sx = s.x - camX + centerX;
    const sy = s.y - camY + centerY;

    if (sx < -24 || sx > canvas.width + 24) continue;
    if (sy < -30 || sy > canvas.height + 24) continue;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 5, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // leafy bush body: a few overlapping foliage clumps
    const clumps = [
      { dx: -7, dy: -6, r: 8 },
      { dx: 7, dy: -6, r: 8 },
      { dx: 0, dy: -12, r: 9 },
      { dx: 0, dy: -4, r: 8 },
    ];
    for (const c of clumps) {
      ctx.fillStyle = '#3d6b2e';
      ctx.beginPath();
      ctx.arc(sx + c.dx, sy + c.dy, c.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // lighter highlight clump for depth
    ctx.fillStyle = '#4e7d44';
    ctx.beginPath();
    ctx.arc(sx - 3, sy - 10, 6, 0, Math.PI * 2);
    ctx.fill();

    // berries dotted through the foliage
    const berryDots = [
      { dx: -6, dy: -8 }, { dx: 5, dy: -9 }, { dx: 0, dy: -3 },
      { dx: -3, dy: -13 }, { dx: 4, dy: -4 },
    ];
    for (const d of berryDots) {
      ctx.fillStyle = '#8b2545';
      ctx.beginPath();
      ctx.arc(sx + d.dx, sy + d.dy, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c0567a';
      ctx.beginPath();
      ctx.arc(sx + d.dx - 0.6, sy + d.dy - 0.6, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---------- Inventory ----------
function makeEmptyInventory() {
  return {
    wood: 0, stone: 0, fiber: 0, bone: 0, leather: 0, metal: 0,
    meat: 0, cooked_meat: 0,
    campfire: 0, spear: 0, armor: 0, backpack: 0,
  };
}

let inventory = makeEmptyInventory();

const inventoryList = document.getElementById('inventory-list');

function updateInventoryUI() {
  inventoryList.innerHTML = '';
  const entries = Object.entries(inventory).filter(([, count]) => count > 0);
  if (entries.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '(nothing yet)';
    inventoryList.appendChild(li);
    return;
  }
  for (const [name, count] of entries) {
    const li = document.createElement('li');
    const label = name.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    li.textContent = `${label} (${count})`;
    inventoryList.appendChild(li);
  }
}

// ---------- Resource nodes ----------
const NODE_TYPES = {
  tree: { resource: 'wood', color: '#3d6b2e', trunkColor: '#5a3d24', gatherRadius: 0.9 },
  rock: { resource: 'stone', color: '#8a8a86', gatherRadius: 0.8 },
  flower: { resource: 'fiber', color: '#c76bb3', gatherRadius: 0.6 },
};

const NODE_SPAWN_RADIUS = 20;
const GATHER_TIME = 3; // seconds

let resourceNodes = [];

const DENSITY_SCALE = 0.1;
const DENSITY_THRESHOLD = 0.55;
const DENSITY_NOISE_BY_TYPE = {
  tree: () => treeDensityNoise,
  rock: () => rockDensityNoise,
  flower: () => flowerDensityNoise,
};

function spawnResourceNodes() {
  resourceNodes = [];
  const counts = { tree: 24, rock: 16, flower: 16 };
  for (const [type, count] of Object.entries(counts)) {
    const densityFn = DENSITY_NOISE_BY_TYPE[type]();
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 60) {
      attempts++;
      const angle = Math.random() * Math.PI * 2;
      const dist = 2 + Math.random() * NODE_SPAWN_RADIUS;
      const gx = Math.round(Math.cos(angle) * dist);
      const gy = Math.round(Math.sin(angle) * dist);
      if (isWaterAt(gx, gy)) continue;
      // clustering: only place where this resource's density noise is "high" here,
      // producing natural patches instead of a uniform scatter
      if (densityFn(gx * DENSITY_SCALE, gy * DENSITY_SCALE) < DENSITY_THRESHOLD) continue;
      resourceNodes.push({
        type,
        gx,
        gy,
        remaining: 2 + Math.floor(Math.random() * 3), // 2-4 gathers before depleted
      });
      placed++;
    }
  }
}

function findNearestNode() {
  let nearest = null;
  let nearestDist = Infinity;
  for (const node of resourceNodes) {
    const def = NODE_TYPES[node.type];
    const dx = node.gx - player.gx;
    const dy = node.gy - player.gy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= def.gatherRadius && dist < nearestDist) {
      nearest = node;
      nearestDist = dist;
    }
  }
  return nearest;
}

let gathering = null; // { node, progress }

function effectiveGatherTime() {
  return inventory.backpack > 0 ? GATHER_TIME * 0.7 : GATHER_TIME;
}

function updateGathering(dt) {
  const nearNode = findNearestNode();

  if (keys['e'] && nearNode) {
    if (!gathering || gathering.node !== nearNode) {
      gathering = { node: nearNode, progress: 0 };
    }
    gathering.progress += dt;
    if (gathering.progress >= effectiveGatherTime()) {
      const def = NODE_TYPES[gathering.node.type];
      inventory[def.resource] += 1;
      resourcesGathered += 1;
      if (gathering.node.type === 'rock' && Math.random() < 0.15) {
        inventory.metal += 1; // rare ore vein
      }
      sfx.gather();
      updateInventoryUI();
      gathering.node.remaining -= 1;
      if (gathering.node.remaining <= 0) {
        const idx = resourceNodes.indexOf(gathering.node);
        if (idx !== -1) resourceNodes.splice(idx, 1);
      }
      gathering = null;
    }
  } else {
    gathering = null;
  }

  const hint = document.getElementById('gather-hint');
  if (gathering) {
    const pct = Math.floor((gathering.progress / effectiveGatherTime()) * 100);
    hint.textContent = `Gathering ${NODE_TYPES[gathering.node.type].resource}... ${pct}%`;
  } else if (nearNode) {
    hint.textContent = `Press E to gather ${NODE_TYPES[nearNode.type].resource}`;
  } else if (inventory.campfire > 0) {
    hint.textContent = `Press F to place a campfire (${inventory.campfire})`;
  } else if (
    inventory.spear > 0 &&
    (wolves.some((w) => Math.hypot(w.gx - player.gx, w.gy - player.gy) <= 1.2) ||
      sheepFlock.some((s) => Math.hypot(s.gx - player.gx, s.gy - player.gy) <= 1.2))
  ) {
    hint.textContent = 'Press SPACE to thrust your spear';
  } else if (inventory.meat > 0 && isNearCampfire(player.gx, player.gy, 1.5)) {
    hint.textContent = `Press R to cook meat (${inventory.meat} raw)`;
  } else if (inventory.cooked_meat > 0 && player.hunger < MAX_HUNGER) {
    hint.textContent = `Press Q to eat cooked meat (${inventory.cooked_meat})`;
  } else {
    hint.textContent = '';
  }
}

function drawResourceNodes(camX, camY) {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  for (const node of resourceNodes) {
    const s = gridToScreen(node.gx, node.gy);
    const sx = s.x - camX + centerX;
    const sy = s.y - camY + centerY;

    if (sx < -40 || sx > canvas.width + 40) continue;
    if (sy < -60 || sy > canvas.height + 40) continue;

    const def = NODE_TYPES[node.type];

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 4, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (node.type === 'tree') {
      ctx.fillStyle = def.trunkColor;
      ctx.fillRect(sx - 3, sy - 10, 6, 14);
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 44);
      ctx.lineTo(sx + 16, sy - 6);
      ctx.lineTo(sx - 16, sy - 6);
      ctx.closePath();
      ctx.fill();
    } else if (node.type === 'rock') {
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.ellipse(sx, sy - 6, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (node.type === 'flower') {
      ctx.fillStyle = def.color;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(sx - 4 + i * 4, sy - 6, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // gathering progress bar
    if (gathering && gathering.node === node) {
      const pct = gathering.progress / effectiveGatherTime();
      const barW = 30;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(sx - barW / 2, sy - 58, barW, 5);
      ctx.fillStyle = '#a9d94a';
      ctx.fillRect(sx - barW / 2, sy - 58, barW * pct, 5);
    }
  }
}

// ---------- Crafting ----------
const RECIPES = [
  {
    id: 'campfire',
    name: 'Campfire',
    cost: { wood: 5, stone: 2 },
    result: 'campfire',
    description: '5 Wood + 2 Stone → gives warmth',
  },
  {
    id: 'spear',
    name: 'Spear',
    cost: { wood: 4, fiber: 2 },
    result: 'spear',
    description: '4 Wood + 2 Fiber → melee weapon',
  },
  {
    id: 'armor',
    name: 'Armor',
    cost: { leather: 2, metal: 2 },
    result: 'armor',
    description: '2 Leather + 2 Metal → halves wolf damage',
  },
  {
    id: 'backpack',
    name: 'Backpack',
    cost: { fiber: 4 },
    result: 'backpack',
    description: '4 Fiber → faster gathering',
  },
];

let craftMenuOpen = false;
const craftMenu = document.getElementById('craft-menu');
const craftRecipeList = document.getElementById('craft-recipe-list');

function canAfford(cost) {
  return Object.entries(cost).every(([res, amt]) => (inventory[res] || 0) >= amt);
}

function craftRecipe(recipe) {
  if (!canAfford(recipe.cost)) return;
  for (const [res, amt] of Object.entries(recipe.cost)) {
    inventory[res] -= amt;
  }
  inventory[recipe.result] = (inventory[recipe.result] || 0) + 1;
  sfx.craft();
  updateInventoryUI();
  renderCraftMenu();
}

function renderCraftMenu() {
  craftRecipeList.innerHTML = '';
  for (const recipe of RECIPES) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'craft-recipe-btn';
    btn.disabled = !canAfford(recipe.cost);
    btn.textContent = `${recipe.name}: ${recipe.description}`;
    btn.addEventListener('click', () => craftRecipe(recipe));
    li.appendChild(btn);
    craftRecipeList.appendChild(li);
  }
}

function toggleCraftMenu() {
  craftMenuOpen = !craftMenuOpen;
  craftMenu.classList.toggle('hidden', !craftMenuOpen);
  if (craftMenuOpen) renderCraftMenu();
}

// ---------- Shelter placement ----------
let shelters = [];

function screenToGrid(mx, my, camX, camY) {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const wx = mx - centerX + camX;
  const wy = my - centerY + camY;
  const gx = (wx / (TILE_WIDTH / 2) + wy / (TILE_HEIGHT / 2)) / 2;
  const gy = (wy / (TILE_HEIGHT / 2) - wx / (TILE_WIDTH / 2)) / 2;
  return { gx: Math.round(gx), gy: Math.round(gy) };
}

function isShelterAt(gx, gy) {
  return shelters.some((sh) => sh.gx === gx && sh.gy === gy);
}

function placeShelterAt(gx, gy) {
  if (gameState !== 'playing') return;
  if (!isShelterAt(gx, gy) && !isWaterAt(gx, gy)) {
    shelters.push({ gx, gy });
  }
}

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const camPos = gridToScreen(player.gx, player.gy);
  const { gx, gy } = screenToGrid(mx, my, camPos.x, camPos.y);
  placeShelterAt(gx, gy);
});

function drawShelters(camX, camY) {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  for (const sh of shelters) {
    const s = gridToScreen(sh.gx, sh.gy);
    const sx = s.x - camX + centerX;
    const sy = s.y - camY + centerY;

    if (sx < -TILE_WIDTH || sx > canvas.width + TILE_WIDTH) continue;
    if (sy < -60 || sy > canvas.height + TILE_HEIGHT) continue;

    ctx.fillStyle = '#7a5230';
    ctx.beginPath();
    ctx.moveTo(sx, sy - 40);
    ctx.lineTo(sx + TILE_WIDTH / 2, sy - 8);
    ctx.lineTo(sx, sy + TILE_HEIGHT / 2);
    ctx.lineTo(sx - TILE_WIDTH / 2, sy - 8);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#3d2c18';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// ---------- Placed campfires ----------
let placedCampfires = [];

function updateCampfirePlacement() {
  if (consumeKeyPress('f') && inventory.campfire > 0) {
    inventory.campfire -= 1;
    placedCampfires.push({ gx: Math.round(player.gx), gy: Math.round(player.gy) });
    updateInventoryUI();
  }
}

const COOKED_MEAT_HUNGER_VALUE = 40;

function updateCooking() {
  if (consumeKeyPress('r') && inventory.meat > 0 && isNearCampfire(player.gx, player.gy, 1.5)) {
    inventory.meat -= 1;
    inventory.cooked_meat += 1;
    updateInventoryUI();
    sfx.craft();
  }
  if (consumeKeyPress('q') && inventory.cooked_meat > 0) {
    inventory.cooked_meat -= 1;
    player.hunger = Math.min(MAX_HUNGER, player.hunger + COOKED_MEAT_HUNGER_VALUE);
    updateInventoryUI();
    sfx.eat();
  }
}

function drawCampfires(camX, camY) {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  for (const cf of placedCampfires) {
    const s = gridToScreen(cf.gx, cf.gy);
    const sx = s.x - camX + centerX;
    const sy = s.y - camY + centerY;

    if (sx < -30 || sx > canvas.width + 30) continue;
    if (sy < -30 || sy > canvas.height + 30) continue;

    if (isNight()) {
      const glow = ctx.createRadialGradient(sx, sy, 2, sx, sy, 40);
      glow.addColorStop(0, 'rgba(255,160,60,0.45)');
      glow.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, 40, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#5a3d24';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 4, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f2924c';
    ctx.beginPath();
    ctx.moveTo(sx, sy - 14);
    ctx.lineTo(sx + 6, sy);
    ctx.lineTo(sx - 6, sy);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f7d24c';
    ctx.beginPath();
    ctx.moveTo(sx, sy - 8);
    ctx.lineTo(sx + 3, sy);
    ctx.lineTo(sx - 3, sy);
    ctx.closePath();
    ctx.fill();
  }
}

// ---------- Wolves ----------
const WOLF_SPEED = 1; // tiles per second
const WOLF_HUNT_RADIUS = 50; // tiles
const WOLF_ATTACK_RANGE = 0.8;
const WOLF_ATTACK_COOLDOWN = 1; // seconds
const WOLF_ATTACK_DAMAGE = 5;
const WOLF_MAX_HP = 30; // 3 spear hits at 10 damage each
const WOLF_SPAWN_MIN_DIST = 25;
const WOLF_SPAWN_MAX_DIST = 40;

const MAX_DAYS = 5;
const SUNRISE_HUNGER_BONUS = 20;
const SUNRISE_WARMTH_BONUS = 10;

let wolves = [];
let wasNight = false;
let elapsedTime = 0;
let wolvesSpawnedThisNight = false;
let wolvesKilled = 0;
let resourcesGathered = 0;

function spawnWolvesForNight(count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = WOLF_SPAWN_MIN_DIST + Math.random() * (WOLF_SPAWN_MAX_DIST - WOLF_SPAWN_MIN_DIST);
    wolves.push({
      gx: player.gx + Math.cos(angle) * dist,
      gy: player.gy + Math.sin(angle) * dist,
      hp: WOLF_MAX_HP,
      wanderTarget: null,
      wanderTimer: 0,
      lastAttack: -Infinity,
      // in a pack (2+), even wolves charge straight in while odd wolves flank from the side
      role: count >= 2 && i % 2 === 1 ? 'flanker' : 'charger',
      flankSide: i % 4 < 2 ? 1 : -1,
      hasAlerted: false,
    });
  }
}

const FLANK_RADIUS = 5; // tiles to the side while circling in
const FLANK_CLOSE_DIST = 6; // once this close, flankers charge too

function moveTowards(entity, tx, ty, dist, dt) {
  const dx = tx - entity.gx;
  const dy = ty - entity.gy;
  const len = Math.hypot(dx, dy);
  if (len < 0.05) return;
  const nx = dx / len;
  const ny = dy / len;
  const step = Math.min(dist * dt, len);

  const newGx = entity.gx + nx * step;
  const newGy = entity.gy + ny * step;

  // wolves cannot enter shelter tiles or water
  const blockedX = isShelterAt(Math.round(newGx), Math.round(entity.gy)) || isWaterAt(Math.round(newGx), Math.round(entity.gy));
  const blockedY = isShelterAt(Math.round(entity.gx), Math.round(newGy)) || isWaterAt(Math.round(entity.gx), Math.round(newGy));
  if (!blockedX) {
    entity.gx = newGx;
  }
  if (!blockedY) {
    entity.gy = newGy;
  }
}

function updateWolves(dt) {
  const nightJustStarted = isNight() && !wasNight;
  const dayJustStarted = !isNight() && wasNight;
  wasNight = isNight();

  if (nightJustStarted) {
    if (dayCount >= MAX_DAYS) {
      triggerWin();
      return;
    }
    sfx.nightFall();
    if (!wolvesSpawnedThisNight) {
      spawnWolvesForNight(dayCount); // night N spawns N wolves
      wolvesSpawnedThisNight = true;
    }
  }
  if (dayJustStarted) {
    wolves = [];
    wolvesSpawnedThisNight = false;
    player.hunger = Math.min(MAX_HUNGER, player.hunger + SUNRISE_HUNGER_BONUS);
    player.warmth = Math.min(MAX_WARMTH, player.warmth + SUNRISE_WARMTH_BONUS);
  }

  for (const wolf of wolves) {
    const distToPlayer = Math.hypot(wolf.gx - player.gx, wolf.gy - player.gy);
    const isHunting = isNight() && distToPlayer <= WOLF_HUNT_RADIUS;

    if (isHunting && !wolf.hasAlerted) {
      wolf.hasAlerted = true;
      sfx.wolfSpotted();
    }
    if (!isHunting) wolf.hasAlerted = false;

    if (isHunting) {
      if (wolf.role === 'flanker' && distToPlayer > FLANK_CLOSE_DIST) {
        // circle to the side of the player before closing in, so the pack doesn't
        // arrive from a single direction
        const angleToPlayer = Math.atan2(player.gy - wolf.gy, player.gx - wolf.gx);
        const flankAngle = angleToPlayer + wolf.flankSide * (Math.PI / 2);
        const targetGx = player.gx + Math.cos(flankAngle) * FLANK_RADIUS;
        const targetGy = player.gy + Math.sin(flankAngle) * FLANK_RADIUS;
        moveTowards(wolf, targetGx, targetGy, WOLF_SPEED, dt);
      } else {
        moveTowards(wolf, player.gx, player.gy, WOLF_SPEED, dt);
      }
    } else {
      wolf.wanderTimer -= dt;
      if (!wolf.wanderTarget || wolf.wanderTimer <= 0) {
        wolf.wanderTarget = {
          gx: wolf.gx + (Math.random() - 0.5) * 10,
          gy: wolf.gy + (Math.random() - 0.5) * 10,
        };
        wolf.wanderTimer = 3 + Math.random() * 3;
      }
      moveTowards(wolf, wolf.wanderTarget.gx, wolf.wanderTarget.gy, WOLF_SPEED * 0.5, dt);
    }

    if (
      distToPlayer <= WOLF_ATTACK_RANGE &&
      !isPlayerSheltered() &&
      elapsedTime - wolf.lastAttack >= WOLF_ATTACK_COOLDOWN
    ) {
      wolf.lastAttack = elapsedTime;
      const dmg = inventory.armor > 0 ? WOLF_ATTACK_DAMAGE / 2 : WOLF_ATTACK_DAMAGE;
      player.health = Math.max(0, player.health - dmg);
      sfx.hit();
      if (player.health <= 0) {
        triggerDeath('Killed', `A wolf got you on Day ${dayCount}, ${formatClock()}`);
      }
    }
  }
}

function updateCombat() {
  if (!consumeKeyPress(' ')) return;
  if (!(inventory.spear > 0)) return;

  let nearestWolf = null;
  let nearestWolfDist = Infinity;
  for (const wolf of wolves) {
    const dist = Math.hypot(wolf.gx - player.gx, wolf.gy - player.gy);
    if (dist <= 1.2 && dist < nearestWolfDist) {
      nearestWolf = wolf;
      nearestWolfDist = dist;
    }
  }
  if (nearestWolf) {
    nearestWolf.hp -= 10;
    sfx.hit();
    if (nearestWolf.hp <= 0) {
      const idx = wolves.indexOf(nearestWolf);
      if (idx !== -1) wolves.splice(idx, 1);
      wolvesKilled += 1;
      inventory.bone += 1;
      inventory.leather += 1;
      inventory.meat += 1;
      updateInventoryUI();
      sfx.wolfDeath();
    }
    return;
  }

  let nearestSheep = null;
  let nearestSheepDist = Infinity;
  for (const sheep of sheepFlock) {
    const dist = Math.hypot(sheep.gx - player.gx, sheep.gy - player.gy);
    if (dist <= 1.2 && dist < nearestSheepDist) {
      nearestSheep = sheep;
      nearestSheepDist = dist;
    }
  }
  if (nearestSheep) {
    nearestSheep.hp -= 10;
    sfx.hit();
    if (nearestSheep.hp <= 0) {
      const idx = sheepFlock.indexOf(nearestSheep);
      if (idx !== -1) sheepFlock.splice(idx, 1);
      inventory.meat += 2;
      inventory.leather += 1;
      updateInventoryUI();
      sfx.wolfDeath();
    }
  }
}

function drawWolves(camX, camY) {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  for (const wolf of wolves) {
    const s = gridToScreen(wolf.gx, wolf.gy);
    const sx = s.x - camX + centerX;
    const sy = s.y - camY + centerY;

    if (sx < -30 || sx > canvas.width + 30) continue;
    if (sy < -30 || sy > canvas.height + 30) continue;

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 5, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.ellipse(sx, sy - 8, 13, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(sx - 4, sy - 12, 1.5, 0, Math.PI * 2);
    ctx.arc(sx + 4, sy - 12, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // hp bar
    const pct = wolf.hp / WOLF_MAX_HP;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(sx - 14, sy - 26, 28, 4);
    ctx.fillStyle = '#c9432e';
    ctx.fillRect(sx - 14, sy - 26, 28 * pct, 4);
  }
}

// ---------- Sheep (passive wildlife) ----------
const SHEEP_COUNT = 8;
const SHEEP_MAX_HP = 20; // 2 spear hits
const SHEEP_WANDER_SPEED = 0.35;
const SHEEP_FLEE_SPEED = 1.3;
const SHEEP_FLEE_RADIUS = 4; // tiles - sheep bolt when the player gets this close
const SHEEP_SPAWN_RADIUS = 20;

let sheepFlock = [];

function spawnSheep() {
  sheepFlock = [];
  let attempts = 0;
  while (sheepFlock.length < SHEEP_COUNT && attempts < SHEEP_COUNT * 60) {
    attempts++;
    const angle = Math.random() * Math.PI * 2;
    const dist = 3 + Math.random() * SHEEP_SPAWN_RADIUS;
    const gx = Math.round(Math.cos(angle) * dist);
    const gy = Math.round(Math.sin(angle) * dist);
    if (isWaterAt(gx, gy)) continue;
    sheepFlock.push({
      gx, gy, hp: SHEEP_MAX_HP,
      wanderTarget: null, wanderTimer: 0,
    });
  }
}

function updateSheep(dt) {
  for (const sheep of sheepFlock) {
    const distToPlayer = Math.hypot(sheep.gx - player.gx, sheep.gy - player.gy);

    if (distToPlayer <= SHEEP_FLEE_RADIUS) {
      // bolt directly away from the player
      const angle = Math.atan2(sheep.gy - player.gy, sheep.gx - player.gx);
      const targetGx = sheep.gx + Math.cos(angle) * 6;
      const targetGy = sheep.gy + Math.sin(angle) * 6;
      moveTowards(sheep, targetGx, targetGy, SHEEP_FLEE_SPEED, dt);
      sheep.wanderTarget = null;
    } else {
      sheep.wanderTimer -= dt;
      if (!sheep.wanderTarget || sheep.wanderTimer <= 0) {
        sheep.wanderTarget = {
          gx: sheep.gx + (Math.random() - 0.5) * 8,
          gy: sheep.gy + (Math.random() - 0.5) * 8,
        };
        sheep.wanderTimer = 3 + Math.random() * 4;
      }
      moveTowards(sheep, sheep.wanderTarget.gx, sheep.wanderTarget.gy, SHEEP_WANDER_SPEED, dt);
    }
  }
}

function drawSheep(camX, camY) {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  for (const sheep of sheepFlock) {
    const s = gridToScreen(sheep.gx, sheep.gy);
    const sx = s.x - camX + centerX;
    const sy = s.y - camY + centerY;

    if (sx < -30 || sx > canvas.width + 30) continue;
    if (sy < -30 || sy > canvas.height + 30) continue;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 5, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // woolly body
    ctx.fillStyle = '#f2ede1';
    ctx.beginPath();
    ctx.ellipse(sx, sy - 7, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // head
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.ellipse(sx + 10, sy - 8, 4.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // hp bar (only if damaged)
    if (sheep.hp < SHEEP_MAX_HP) {
      const pct = sheep.hp / SHEEP_MAX_HP;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(sx - 14, sy - 24, 28, 4);
      ctx.fillStyle = '#a9d94a';
      ctx.fillRect(sx - 14, sy - 24, 28 * pct, 4);
    }
  }
}

// ---------- Game state ----------
let gameState = 'playing'; // 'playing' | 'dead' | 'won'

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySubtitle = document.getElementById('overlay-subtitle');
const restartBtn = document.getElementById('restart-btn');

function computeScore() {
  return (
    (dayCount - 1) * 1000 +
    wolvesKilled * 100 +
    resourcesGathered * 10 +
    Math.floor(player.health) +
    Math.floor(player.warmth) * 2
  );
}

function triggerDeath(title, subtitle) {
  if (gameState !== 'playing') return;
  gameState = 'dead';
  overlayTitle.textContent = title;
  overlaySubtitle.textContent = `${subtitle} — Score: ${computeScore()}`;
  overlay.classList.remove('hidden');
}

function triggerWin() {
  if (gameState !== 'playing') return;
  gameState = 'won';
  overlayTitle.textContent = 'Escaped!';
  overlaySubtitle.textContent = `You survived all ${MAX_DAYS} days — Score: ${computeScore()}`;
  overlay.classList.add('victory');
  overlay.classList.remove('hidden');
}

function restartGame() {
  worldSeed = Math.floor(Math.random() * 1e9);
  terrainNoise = makeNoise2D(worldSeed);
  biomeNoise = makeNoise2D(worldSeed + 101);
  treeDensityNoise = makeNoise2D(worldSeed + 202);
  rockDensityNoise = makeNoise2D(worldSeed + 303);
  flowerDensityNoise = makeNoise2D(worldSeed + 404);

  player = makePlayer();
  gameTime = 0;
  dayCount = 1;
  spawnBerries();
  spawnResourceNodes();
  spawnSheep();
  inventory = makeEmptyInventory();
  updateInventoryUI();
  shelters = [];
  placedCampfires = [];
  wolves = [];
  wasNight = false;
  wolvesSpawnedThisNight = false;
  wolvesKilled = 0;
  resourcesGathered = 0;
  elapsedTime = 0;
  gathering = null;
  craftMenuOpen = false;
  craftMenu.classList.add('hidden');
  gameState = 'playing';
  overlay.classList.add('hidden');
  overlay.classList.remove('victory');
}

restartBtn.addEventListener('click', restartGame);

// ---------- Rendering ----------
function drawGround(camX, camY) {
  const currentRealm = REALMS[getRealmAt(Math.round(player.gx), Math.round(player.gy))];

  ctx.fillStyle = isNight() ? currentRealm.skyNight : currentRealm.skyDay;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  const waterColor = isNight() ? '#0d2438' : '#3d7ea6';
  const waterAlt = isNight() ? '#0f2c42' : '#4689b0';

  const RADIUS = 12;
  const pgx = Math.round(player.gx);
  const pgy = Math.round(player.gy);

  for (let gy = pgy - RADIUS; gy <= pgy + RADIUS; gy++) {
    for (let gx = pgx - RADIUS; gx <= pgx + RADIUS; gx++) {
      const s = gridToScreen(gx, gy);
      const sx = s.x - camX + centerX;
      const sy = s.y - camY + centerY;

      if (sx < -TILE_WIDTH || sx > canvas.width + TILE_WIDTH) continue;
      if (sy < -TILE_HEIGHT || sy > canvas.height + TILE_HEIGHT) continue;

      const checker = (gx + gy) % 2 === 0;
      if (isWaterAt(gx, gy)) {
        ctx.fillStyle = checker ? waterColor : waterAlt;
      } else {
        const realm = REALMS[getRealmAt(gx, gy)];
        const gDay = isNight() ? realm.groundNight : realm.groundDay;
        const gAlt = isNight() ? realm.groundNightAlt : realm.groundDayAlt;
        ctx.fillStyle = checker ? gDay : gAlt;
      }

      ctx.beginPath();
      ctx.moveTo(sx, sy - TILE_HEIGHT / 2);
      ctx.lineTo(sx + TILE_WIDTH / 2, sy);
      ctx.lineTo(sx, sy + TILE_HEIGHT / 2);
      ctx.lineTo(sx - TILE_WIDTH / 2, sy);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawPlayer(camX, camY) {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const s = gridToScreen(player.gx, player.gy);
  const sx = s.x - camX + centerX;
  const sy = s.y - camY + centerY;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 6, 12, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // body
  ctx.fillStyle = '#e0533d';
  ctx.beginPath();
  ctx.arc(sx, sy - 12, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function draw() {
  const camPos = gridToScreen(player.gx, player.gy);
  drawGround(camPos.x, camPos.y);
  drawBerries(camPos.x, camPos.y);
  drawResourceNodes(camPos.x, camPos.y);
  drawShelters(camPos.x, camPos.y);
  drawCampfires(camPos.x, camPos.y);
  drawSheep(camPos.x, camPos.y);
  drawWolves(camPos.x, camPos.y);
  drawPlayer(camPos.x, camPos.y);
}

// ---------- Game loop ----------
let lastTime = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;
let fps = 0;

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1); // clamp to avoid huge jumps
  lastTime = now;

  fpsAccum += dt;
  fpsFrames += 1;
  if (fpsAccum >= 0.5) {
    fps = Math.round(fpsFrames / fpsAccum);
    fpsAccum = 0;
    fpsFrames = 0;
  }

  update(dt);
  draw();
  updateHUD();

  requestAnimationFrame(loop);
}

function update(dt) {
  if (consumeKeyPress('c') && gameState === 'playing') {
    toggleCraftMenu();
  }

  if (gameState !== 'playing' || craftMenuOpen) return;

  elapsedTime += dt;

  updatePlayer(dt);
  updateTime(dt);
  updateHunger(dt);
  updateWarmth(dt);
  if (gameState !== 'playing') return;

  updateBerries();
  updateGathering(dt);
  updateCampfirePlacement();
  updateCooking();
  updateSheep(dt);
  updateWolves(dt);
  if (gameState !== 'playing') return;

  updateCombat();
}

// ---------- Touch controls (iPad / mobile) ----------
function bindHoldButton(el, key) {
  const press = (e) => { e.preventDefault(); ensureAudio(); keys[key] = true; };
  const release = (e) => { e.preventDefault(); keys[key] = false; };
  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', release);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function bindTapButton(el, key) {
  const press = (e) => {
    e.preventDefault();
    ensureAudio();
    if (!keys[key]) keysPressed[key] = true;
    keys[key] = true;
  };
  const release = (e) => { e.preventDefault(); keys[key] = false; };
  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

document.querySelectorAll('.touch-hold[data-key]').forEach((el) => bindHoldButton(el, el.dataset.key));
document.querySelectorAll('.touch-tap[data-key]').forEach((el) => bindTapButton(el, el.dataset.key));

const touchShelterBtn = document.getElementById('touch-shelter-btn');
touchShelterBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  ensureAudio();
  placeShelterAt(Math.round(player.gx), Math.round(player.gy));
});
touchShelterBtn.addEventListener('contextmenu', (e) => e.preventDefault());

const touchToggleBtn = document.getElementById('touch-toggle-btn');
const touchControls = document.getElementById('touch-controls');

function setTouchControlsEnabled(enabled) {
  touchControls.classList.toggle('hidden', !enabled);
  touchToggleBtn.textContent = enabled ? '📱 Touch Controls: On' : '📱 Touch Controls';
  localStorage.setItem('touchControlsEnabled', enabled ? '1' : '0');
}

touchToggleBtn.addEventListener('click', () => {
  setTouchControlsEnabled(touchControls.classList.contains('hidden'));
});

setTouchControlsEnabled(localStorage.getItem('touchControlsEnabled') === '1');

spawnBerries();
spawnResourceNodes();
spawnSheep();
updateInventoryUI();
requestAnimationFrame(loop);
