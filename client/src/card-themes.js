// Fighter-card themes. Keys must match CARD_THEMES in server/src/services/users.js.
// Two groups: the six Vanguard nations, then collaboration sets.
export const DEFAULT_THEME = 'keter-sanctuary';

export const CARD_THEMES = {
  // --- Nations -------------------------------------------------------------
  'keter-sanctuary': {
    label: 'Keter Sanctuary',
    code: 'KS',
    group: 'nation',
    tagline: 'Sanctuary of the Sky',
    emblem: '⚜️',
    accent: '#5c8dff',
    accent2: '#ffe08a',
    ink: '#0a1733',
    frame: 'linear-gradient(150deg, #050b1f 0%, #183b7a 45%, #5c8dff 75%, #ffe08a 100%)',
    panel: 'rgba(240, 245, 255, 0.95)',
    glow: 'rgba(92, 141, 255, 0.55)',
    text: '#eef3ff',
  },
  'dragon-empire': {
    label: 'Dragon Empire',
    code: 'DE',
    group: 'nation',
    tagline: 'Blazing Dragon Empire',
    emblem: '🐉',
    accent: '#ff5a3c',
    accent2: '#ffd23c',
    ink: '#3a0b04',
    frame: 'linear-gradient(150deg, #2a0505 0%, #7a1307 42%, #ff5a3c 78%, #ffd23c 100%)',
    panel: 'rgba(255, 244, 238, 0.94)',
    glow: 'rgba(255, 90, 60, 0.55)',
    text: '#fff3ee',
  },
  stoicheia: {
    label: 'Stoicheia',
    code: 'ST',
    group: 'nation',
    tagline: 'Forces of Nature',
    emblem: '🌿',
    accent: '#2ecf7a',
    accent2: '#c8ff9e',
    ink: '#052116',
    frame: 'linear-gradient(150deg, #03120b 0%, #0d4a2c 45%, #2ecf7a 75%, #c8ff9e 100%)',
    panel: 'rgba(236, 252, 244, 0.95)',
    glow: 'rgba(46, 207, 122, 0.5)',
    text: '#e9fff2',
  },
  'brandt-gate': {
    label: 'Brandt Gate',
    code: 'BG',
    group: 'nation',
    tagline: 'Gate of Tomorrow',
    emblem: '🛡️',
    accent: '#2fd0ff',
    accent2: '#b8c6ff',
    ink: '#062033',
    frame: 'linear-gradient(150deg, #03121f 0%, #0b4f7a 45%, #2fd0ff 75%, #b8c6ff 100%)',
    panel: 'rgba(236, 250, 255, 0.95)',
    glow: 'rgba(47, 208, 255, 0.55)',
    text: '#e8fbff',
  },
  'dark-states': {
    label: 'Dark States',
    code: 'DS',
    group: 'nation',
    tagline: 'Lawless Nightmare',
    emblem: '☠️',
    accent: '#c04bff',
    accent2: '#ff4d9d',
    ink: '#1c0326',
    frame: 'linear-gradient(150deg, #0b0214 0%, #3a0a5c 45%, #a02bd4 74%, #ff4d9d 100%)',
    panel: 'rgba(250, 240, 255, 0.94)',
    glow: 'rgba(192, 75, 255, 0.55)',
    text: '#f9ecff',
  },
  'lyrical-monasterio': {
    label: 'Lyrical Monasterio',
    code: 'LM',
    group: 'nation',
    tagline: 'Academy of Song',
    emblem: '🎼',
    accent: '#ff7bc4',
    accent2: '#b59bff',
    ink: '#2a0620',
    frame: 'linear-gradient(150deg, #1a0416 0%, #7a1a5c 45%, #ff7bc4 75%, #b59bff 100%)',
    panel: 'rgba(255, 240, 250, 0.95)',
    glow: 'rgba(255, 123, 196, 0.55)',
    text: '#fff0f8',
  },

  // --- Collabs -------------------------------------------------------------
  buddyfight: {
    label: 'Buddyfight',
    code: 'BF',
    group: 'collab',
    tagline: 'Future Card Buddyfight',
    emblem: '🥊',
    accent: '#ff8a2b',
    accent2: '#ffd447',
    ink: '#2a1200',
    frame: 'linear-gradient(150deg, #1a0a00 0%, #7a3a00 45%, #ff8a2b 75%, #ffd447 100%)',
    panel: 'rgba(255, 247, 235, 0.95)',
    glow: 'rgba(255, 138, 43, 0.55)',
    text: '#fff4e6',
  },
  'quintessential-quintuplets': {
    label: 'Quintessential Quintuplets',
    code: 'QQ',
    group: 'collab',
    tagline: 'Five Sisters, One Heart',
    emblem: '🌸',
    accent: '#ff6fa8',
    accent2: '#ffc2a1',
    ink: '#2c0816',
    frame: 'linear-gradient(150deg, #1c0510 0%, #7a1f45 45%, #ff6fa8 75%, #ffc2a1 100%)',
    panel: 'rgba(255, 242, 247, 0.95)',
    glow: 'rgba(255, 111, 168, 0.55)',
    text: '#fff0f5',
  },
  'frieren-journey-ends': {
    label: 'Frieren Journey Ends',
    code: 'FJE',
    group: 'collab',
    tagline: 'Beyond the Journey',
    emblem: '🧝',
    accent: '#4fd6c4',
    accent2: '#ffe6a3',
    ink: '#042522',
    frame: 'linear-gradient(150deg, #021412 0%, #0d4a45 45%, #4fd6c4 75%, #ffe6a3 100%)',
    panel: 'rgba(238, 255, 252, 0.95)',
    glow: 'rgba(79, 214, 196, 0.5)',
    text: '#e9fffb',
  },
  'shaman-king': {
    label: 'Shaman King',
    code: 'SK',
    group: 'collab',
    tagline: 'The Shaman Fight',
    emblem: '👻',
    accent: '#7bd44a',
    accent2: '#b06bff',
    ink: '#0b1a04',
    frame: 'linear-gradient(150deg, #040d02 0%, #224a0d 45%, #7bd44a 75%, #b06bff 100%)',
    panel: 'rgba(244, 255, 236, 0.95)',
    glow: 'rgba(123, 212, 74, 0.5)',
    text: '#f1ffe8',
  },
  'touken-ranbu': {
    label: 'Touken Ranbu',
    code: 'TR',
    group: 'collab',
    tagline: 'Sword Warriors',
    emblem: '🗡️',
    accent: '#7a7bff',
    accent2: '#ff9ac4',
    ink: '#0a0a2e',
    frame: 'linear-gradient(150deg, #04040f 0%, #22246b 45%, #7a7bff 75%, #ff9ac4 100%)',
    panel: 'rgba(240, 240, 255, 0.95)',
    glow: 'rgba(122, 123, 255, 0.55)',
    text: '#eeeefe',
  },
  'bang-dream': {
    label: 'BanG Dream!',
    code: 'BD',
    group: 'collab',
    tagline: 'Girls Band Party',
    emblem: '🎸',
    accent: '#a26bff',
    accent2: '#63e6ff',
    ink: '#14042a',
    frame: 'linear-gradient(150deg, #090214 0%, #3a1370 45%, #a26bff 75%, #63e6ff 100%)',
    panel: 'rgba(246, 240, 255, 0.95)',
    glow: 'rgba(162, 107, 255, 0.55)',
    text: '#f4ecff',
  },
  corocoro: {
    label: 'Corocoro',
    code: 'CC',
    group: 'collab',
    tagline: 'Corocoro Comic',
    emblem: '⭐',
    accent: '#ffca2b',
    accent2: '#ff5a3c',
    ink: '#2a1a00',
    frame: 'linear-gradient(150deg, #1a1200 0%, #7a5a00 45%, #ffca2b 75%, #ff5a3c 100%)',
    panel: 'rgba(255, 251, 235, 0.96)',
    glow: 'rgba(255, 202, 43, 0.6)',
    text: '#fff8e6',
  },
  persona: {
    label: 'Persona',
    code: 'P',
    group: 'collab',
    tagline: 'Persona Series',
    emblem: '🎭',
    accent: '#ff3b4e',
    accent2: '#ffd23c',
    ink: '#0a0a0a',
    frame: 'linear-gradient(150deg, #000000 0%, #2a0508 45%, #ff3b4e 75%, #ffd23c 100%)',
    panel: 'rgba(245, 240, 240, 0.95)',
    glow: 'rgba(255, 59, 78, 0.55)',
    text: '#fdecee',
  },
  'record-of-ragnarok': {
    label: 'Record of Ragnarok',
    code: 'ROR',
    group: 'collab',
    tagline: 'Ragnarok',
    emblem: '⚔️',
    accent: '#e01f3d',
    accent2: '#f0c75e',
    ink: '#1a0206',
    frame: 'linear-gradient(150deg, #0a0002 0%, #4a0710 45%, #e01f3d 75%, #f0c75e 100%)',
    panel: 'rgba(255, 240, 242, 0.95)',
    glow: 'rgba(224, 31, 61, 0.55)',
    text: '#ffeef0',
  },
};

export const CARD_THEME_ORDER = Object.keys(CARD_THEMES);

export const THEME_GROUPS = [
  {
    id: 'nation',
    label: 'Nations',
    keys: CARD_THEME_ORDER.filter((key) => CARD_THEMES[key].group === 'nation'),
  },
  {
    id: 'collab',
    label: 'Collabs',
    keys: CARD_THEME_ORDER.filter((key) => CARD_THEMES[key].group === 'collab'),
  },
];

export function getTheme(key) {
  return CARD_THEMES[key] || CARD_THEMES[DEFAULT_THEME];
}

export function qrPayload(token) {
  return token ? `TCGBRACKET:${token}` : '';
}

// Short, stable-looking serial derived from the token (not reversible).
export function cardSerial(id, token) {
  const base = `${id || 0}-${token || ''}`;
  let h = 2166136261;
  for (let i = 0; i < base.length; i += 1) {
    h ^= base.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = Math.abs(h) % 1000000;
  return `VG-${String(n).padStart(6, '0')}`;
}
