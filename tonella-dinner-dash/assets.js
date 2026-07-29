// ---------- SVG asset generators ----------
// Every function returns an inline SVG markup string. Keeping these as flat
// vector shapes (no external images) so the whole game is self-contained.

const FOOD_EMOJI = {
  pancakes: '🥞',
  eggs: '🍳',
  bacon: '🥓',
  coffee: '☕',
};

const FOOD_LABEL = {
  pancakes: 'Pancakes',
  eggs: 'Eggs',
  bacon: 'Bacon',
  coffee: 'Coffee',
};

function svgCustomer(shirtColor, skinColor) {
  return `
  <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="32" cy="58" rx="16" ry="4" fill="#00000022"/>
    <path d="M14 60 C14 40 20 34 32 34 C44 34 50 40 50 60 Z" fill="${shirtColor}"/>
    <circle cx="32" cy="22" r="14" fill="${skinColor}"/>
    <path d="M18 18 C18 8 46 8 46 18 C46 12 36 10 32 10 C28 10 18 12 18 18 Z" fill="#4a3222"/>
    <circle cx="26" cy="23" r="2.2" fill="#2b2b2b"/>
    <circle cx="38" cy="23" r="2.2" fill="#2b2b2b"/>
    <path d="M26 30 Q32 34 38 30" stroke="#2b2b2b" stroke-width="2" fill="none" stroke-linecap="round"/>
  </svg>`;
}

function svgWaiter() {
  return `
  <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="32" cy="60" rx="16" ry="4" fill="#00000022"/>
    <path d="M14 62 C14 42 20 36 32 36 C44 36 50 42 50 62 Z" fill="#ffffff"/>
    <rect x="14" y="46" width="36" height="8" fill="#2b6cb0"/>
    <circle cx="32" cy="22" r="14" fill="#f2c197"/>
    <path d="M17 20 C17 6 47 6 47 20 L44 20 C44 12 20 12 20 20 Z" fill="#333"/>
    <circle cx="26" cy="23" r="2.2" fill="#2b2b2b"/>
    <circle cx="38" cy="23" r="2.2" fill="#2b2b2b"/>
    <path d="M25 29 Q32 35 39 29" stroke="#2b2b2b" stroke-width="2" fill="none" stroke-linecap="round"/>
  </svg>`;
}

function svgTable() {
  return `
  <svg viewBox="0 0 90 76" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="45" cy="70" rx="34" ry="5" fill="#00000022"/>
    <rect x="10" y="30" width="70" height="10" rx="3" class="table-top" fill="#c98a4b"/>
    <rect x="16" y="40" width="6" height="26" fill="#8a5a34"/>
    <rect x="68" y="40" width="6" height="26" fill="#8a5a34"/>
  </svg>`;
}

function svgStation(kind) {
  const colors = {
    griddle: '#555',
    stove: '#444',
    coffee: '#6b4226',
  };
  const base = colors[kind] || '#555';
  return `
  <svg viewBox="0 0 90 80" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="45" cy="74" rx="32" ry="5" fill="#00000022"/>
    <rect x="10" y="34" width="70" height="34" rx="6" fill="${base}"/>
    <rect x="10" y="34" width="70" height="10" rx="4" fill="#777"/>
    <circle cx="26" cy="52" r="6" fill="#222"/>
    <circle cx="64" cy="52" r="6" fill="#222"/>
    <rect x="34" y="14" width="22" height="20" rx="3" fill="#999"/>
  </svg>`;
}

function foodEmoji(kind) {
  return FOOD_EMOJI[kind] || '❓';
}

function foodLabel(kind) {
  return FOOD_LABEL[kind] || kind;
}
