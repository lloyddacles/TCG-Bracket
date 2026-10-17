// Fighter-card themes. Keys must match CARD_THEMES in server/src/services/users.js.
export const CARD_THEMES = {
  kagero: {
    label: 'Kagero',
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
  'royal-paladin': {
    label: 'Royal Paladin',
    tagline: 'Order of the Holy Blade',
    emblem: '⚜️',
    accent: '#4d8bff',
    accent2: '#ffd966',
    ink: '#0a1c44',
    frame: 'linear-gradient(150deg, #061034 0%, #123a8f 45%, #4d8bff 75%, #ffd966 100%)',
    panel: 'rgba(238, 244, 255, 0.95)',
    glow: 'rgba(77, 139, 255, 0.55)',
    text: '#eef3ff',
  },
  'oracle-think-tank': {
    label: 'Oracle Think Tank',
    tagline: 'Weavers of Fate',
    emblem: '🔮',
    accent: '#b06bff',
    accent2: '#ff8fd4',
    ink: '#2b0a47',
    frame: 'linear-gradient(150deg, #200634 0%, #5b1a8f 45%, #b06bff 75%, #ff8fd4 100%)',
    panel: 'rgba(248, 240, 255, 0.95)',
    glow: 'rgba(176, 107, 255, 0.55)',
    text: '#f6ecff',
  },
  'dimension-police': {
    label: 'Dimension Police',
    tagline: 'Guardians of the Cosmos',
    emblem: '🛡️',
    accent: '#2fd0ff',
    accent2: '#9aa8ff',
    ink: '#062033',
    frame: 'linear-gradient(150deg, #03121f 0%, #0b4f7a 45%, #2fd0ff 75%, #9aa8ff 100%)',
    panel: 'rgba(236, 250, 255, 0.95)',
    glow: 'rgba(47, 208, 255, 0.55)',
    text: '#e8fbff',
  },
  granblue: {
    label: 'Granblue',
    tagline: 'Ghost Ship Armada',
    emblem: '⚓',
    accent: '#19c2a8',
    accent2: '#ffcf7a',
    ink: '#04211d',
    frame: 'linear-gradient(150deg, #02110f 0%, #0a4a48 45%, #19c2a8 75%, #ffcf7a 100%)',
    panel: 'rgba(236, 252, 249, 0.94)',
    glow: 'rgba(25, 194, 168, 0.5)',
    text: '#e6fff9',
  },
  narukami: {
    label: 'Narukami',
    tagline: 'Thunder Dragons of Storm',
    emblem: '⚡',
    accent: '#ffb02e',
    accent2: '#ff4d4d',
    ink: '#331500',
    frame: 'linear-gradient(150deg, #1c0a00 0%, #7a3200 42%, #ffb02e 76%, #ff4d4d 100%)',
    panel: 'rgba(255, 246, 230, 0.94)',
    glow: 'rgba(255, 176, 46, 0.55)',
    text: '#fff4e2',
  },
  'gold-paladin': {
    label: 'Gold Paladin',
    tagline: 'Sunlit Legion',
    emblem: '🦁',
    accent: '#ffd76a',
    accent2: '#f2a83b',
    ink: '#3a2600',
    frame: 'linear-gradient(150deg, #4a3200 0%, #b8860b 45%, #ffd76a 74%, #fff7dc 100%)',
    panel: 'rgba(255, 252, 240, 0.95)',
    glow: 'rgba(255, 215, 106, 0.6)',
    text: '#fff9e8',
  },
  'shadow-paladin': {
    label: 'Shadow Paladin',
    tagline: 'Black Knights of Vengeance',
    emblem: '☠️',
    accent: '#39e08f',
    accent2: '#7a4dff',
    ink: '#06160d',
    frame: 'linear-gradient(150deg, #030604 0%, #0b3d24 45%, #1f8f57 74%, #39e08f 100%)',
    panel: 'rgba(233, 250, 240, 0.93)',
    glow: 'rgba(57, 224, 143, 0.5)',
    text: '#e8fff3',
  },
  'gear-chronicle': {
    label: 'Gear Chronicle',
    tagline: 'Time Corps of the Cog',
    emblem: '⚙️',
    accent: '#e0a45a',
    accent2: '#8f6b3a',
    ink: '#2a1a06',
    frame: 'linear-gradient(150deg, #1a1206 0%, #6b4a1e 45%, #c98f45 74%, #f3d9a8 100%)',
    panel: 'rgba(255, 248, 236, 0.94)',
    glow: 'rgba(224, 164, 90, 0.55)',
    text: '#fdf3e2',
  },
  'aqua-force': {
    label: 'Aqua Force',
    tagline: 'Tidal Blitz Fleet',
    emblem: '🌊',
    accent: '#33b7ff',
    accent2: '#28e0d0',
    ink: '#02202f',
    frame: 'linear-gradient(150deg, #021722 0%, #0a5a86 45%, #33b7ff 74%, #28e0d0 100%)',
    panel: 'rgba(234, 249, 255, 0.95)',
    glow: 'rgba(51, 183, 255, 0.5)',
    text: '#e6f7ff',
  },
};

export const CARD_THEME_ORDER = Object.keys(CARD_THEMES);

export function getTheme(key) {
  return CARD_THEMES[key] || CARD_THEMES.kagero;
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
