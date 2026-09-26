// Plano de la pizzería (metros). Norte = -Z. La oficina está en el origen.
// Todo lo demás (geometría, cámaras, rutas de la IA, mapa del monitor) se deriva de aquí.

export const PLAYER_EYE = [0, 1.3, 1.25];

export const ROOMS = {
  office: { x0: -3.5, x1: 3.5, z0: -2.5, z1: 2.5, h: 3.0 },
  westHall: { x0: -6.2, x1: -3.8, z0: -20.3, z1: 2.5, h: 3.0 },
  eastHall: { x0: 3.8, x1: 6.2, z0: -20.3, z1: 2.5, h: 3.0 },
  dining: { x0: -11, x1: 11, z0: -37, z1: -20.3, h: 4.4 },
  cove: { x0: -15, x1: -11.3, z0: -28, z1: -22, h: 3.2 },
  backstage: { x0: -16.5, x1: -11.3, z0: -37, z1: -30, h: 3.2 },
  restrooms: { x0: 11.3, x1: 17, z0: -37, z1: -30, h: 3.2 },
  kitchen: { x0: 11.3, x1: 17, z0: -28, z1: -21, h: 3.2 },
  closet: { x0: -3.5, x1: -0.5, z0: -11, z1: -7.5, h: 3.0 },
};

export const DOOR = { z0: -1.9, z1: -0.5, h: 2.4 };
export const WINDOW = { z0: 0.15, z1: 1.55, y0: 1.0, y1: 2.05 };
export const STAGE = { x0: -6.5, x1: 6.5, z0: -37, z1: -32, h: 0.9 };

// Puntos de paso del grafo de navegación [x, y, z].
export const WAYPOINTS = {
  stB: [0, 0.9, -34.9],
  stL: [-2.7, 0.9, -34.5],
  stR: [2.7, 0.9, -34.5],
  stF: [0, 0.9, -32.05],
  stS: [0, 0, -30.75],
  dC: [0, 0, -26],
  dS: [0, 0, -21.6],
  dNW: [-8.4, 0, -30.8],
  dW: [-8.4, 0, -26],
  dSW: [-8.4, 0, -21.6],
  dNE: [8.4, 0, -30.8],
  dE: [8.4, 0, -26],
  dSE: [8.4, 0, -21.6],
  dBun: [-8.7, 0, -28.2],
  dChi: [8.7, 0, -27.6],
  dBear: [0, 0, -24.2],
  bsD: [-10.3, 0, -33.5],
  bsIn: [-12.2, 0, -33.5],
  bs: [-14.2, 0, -34.2],
  rrD: [10.3, 0, -33.5],
  rrIn: [12.2, 0, -33.5],
  rrC: [14.8, 0, -33.8],
  rrB: [13.6, 0, -32.2],
  kD: [10.3, 0, -24.5],
  kIn: [12.2, 0, -24.5],
  k: [14.2, 0, -24.8],
  cvD: [-10.1, 0, -25],
  cv: [-13.1, 0.3, -25],
  whN: [-5, 0, -21.4],
  wh: [-5, 0, -13],
  clD: [-5, 0, -9.3],
  cl: [-2, 0, -9.3],
  wc: [-5.1, 0, -3.8],
  ld: [-4.5, 0, -1.2],
  foxD: [-4.75, 0, -0.85],
  ol: [-2.3, 0, -1.0],
  ehN: [5, 0, -21.4],
  eh: [5, 0, -13],
  ecC: [5.1, 0, -3.8],
  ecB: [4.85, 0, -5.2],
  rd: [4.5, 0, -1.2],
  or: [2.3, 0, -1.0],
};

export const EDGES = [
  ['stB', 'stF'], ['stL', 'stF'], ['stR', 'stF'], ['stF', 'stS'],
  ['stS', 'dC'], ['dC', 'dBear'], ['dBear', 'dS'], ['dC', 'dS'],
  ['stS', 'dNW'], ['stS', 'dNE'],
  ['dNW', 'dW'], ['dW', 'dSW'], ['dW', 'dBun'], ['dBun', 'dNW'],
  ['dNE', 'dE'], ['dE', 'dSE'], ['dE', 'dChi'], ['dChi', 'dNE'],
  ['dSW', 'whN'], ['dS', 'whN'], ['dS', 'ehN'], ['dSE', 'ehN'],
  ['dNW', 'bsD'], ['bsD', 'bsIn'], ['bsIn', 'bs'],
  ['dNE', 'rrD'], ['rrD', 'rrIn'], ['rrIn', 'rrC'], ['rrIn', 'rrB'],
  ['dE', 'kD'], ['kD', 'kIn'], ['kIn', 'k'],
  ['dW', 'cvD'], ['dSW', 'cvD'], ['cvD', 'cv'],
  ['whN', 'wh'], ['wh', 'clD'], ['clD', 'cl'], ['clD', 'wc'], ['wc', 'ld'], ['wc', 'foxD'], ['ld', 'ol'], ['foxD', 'ol'],
  ['ehN', 'eh'], ['eh', 'ecC'], ['eh', 'ecB'], ['ecC', 'rd'], ['ecB', 'rd'], ['ecC', 'ecB'], ['rd', 'or'],
];

// Salas lógicas (como en el juego original) -> punto de paso de cada personaje y hacia dónde mira.
export const SPOTS = {
  STAGE: { bear: ['stB', [0, -20]], bunny: ['stL', [-1.5, -20]], chicken: ['stR', [1.5, -20]] },
  DINING: { bunny: ['dBun', [-10.4, -20.9]], chicken: ['dChi', [-2, -21]], bear: ['dBear', [0, -20]] },
  BACKSTAGE: { any: ['bs', [-11.6, -36.6]] },
  RESTROOMS: { chicken: ['rrC', [11.6, -30.3]], bear: ['rrB', [11.6, -30.3]] },
  KITCHEN: { any: ['k', [11.3, -24.5]] },
  WEST_HALL: { any: ['wh', [-5.9, -5.5]] },
  CLOSET: { any: ['cl', [-0.7, -7.7]] },
  WEST_CORNER: { any: ['wc', [-3.95, 2.3]] },
  LEFT_DOOR: { any: ['ld', [0, -1.2]], fox: ['foxD', [0, -1]] },
  EAST_HALL: { any: ['eh', [5.9, -5.5]] },
  EAST_CORNER: { chicken: ['ecC', [3.95, 2.3]], bear: ['ecB', [3.95, 2.3]] },
  RIGHT_DOOR: { any: ['rd', [0, -1.2]] },
  COVE: { fox: ['cv', [-8, -25]] },
  OFFICE_L: { any: ['ol', [0, 1.2]] },
  OFFICE_R: { any: ['or', [0, 1.2]] },
};

export function spotFor(room, who) {
  const s = SPOTS[room];
  if (!s) return null;
  return s[who] || s.any;
}

// Cámaras de seguridad. `rooms`: salas lógicas que se ven desde esa cámara.
export const CAMS = [
  { id: '1A', name: 'Escenario', pos: [0.4, 3.9, -21.3], look: [0, 1.95, -34.6], fov: 34, pan: 0.08, rooms: ['STAGE'], lights: ['stageL', 'stageC', 'stageR', 'dining1', 'signGlow'], map: [0, -33] },
  { id: '1B', name: 'Comedor', pos: [-10.5, 3.9, -20.8], look: [1.5, 0.6, -29], fov: 62, pan: 0.22, rooms: ['DINING'], lights: ['stageL', 'stageC', 'stageR', 'dining1', 'dining2', 'dining3', 'signGlow'], map: [-2, -26] },
  { id: '1C', name: 'Cueva pirata', pos: [-7.2, 3.5, -21.0], look: [-12.6, 1.1, -25], fov: 50, pan: 0.1, rooms: ['COVE'], lights: ['coveSpot', 'coveGlow', 'dining2'], map: [-12.8, -25] },
  { id: '2A', name: 'Pasillo oeste', pos: [-5.95, 2.78, -5.6], look: [-5.0, 0.9, -20.5], fov: 58, pan: 0.0, rooms: ['WEST_HALL'], lights: ['wh1', 'wh2', 'whC'], map: [-5, -13] },
  { id: '2B', name: 'Esquina oeste', pos: [-3.98, 2.78, 2.3], look: [-5.3, 0.9, -4.6], fov: 60, pan: 0.08, rooms: ['WEST_CORNER'], lights: ['whC', 'wh2', 'doorL'], map: [-5, -3.5] },
  { id: '3', name: 'Armario', pos: [-0.72, 2.75, -7.72], look: [-2.6, 0.7, -10.2], fov: 68, pan: 0.1, rooms: ['CLOSET'], lights: ['closetBulb'], map: [-2, -9.2] },
  { id: '4A', name: 'Pasillo este', pos: [5.95, 2.78, -5.6], look: [5.0, 0.9, -20.5], fov: 58, pan: 0.0, rooms: ['EAST_HALL'], lights: ['eh1', 'eh2', 'ehC'], map: [5, -13] },
  { id: '4B', name: 'Esquina este', pos: [3.98, 2.78, 2.3], look: [5.3, 0.9, -4.6], fov: 60, pan: 0.08, rooms: ['EAST_CORNER'], lights: ['ehC', 'eh2', 'doorR'], map: [5, -3.5] },
  { id: '5', name: 'Tras bastidores', pos: [-11.6, 3.0, -36.6], look: [-14.8, 1.0, -32.2], fov: 64, pan: 0.12, rooms: ['BACKSTAGE'], lights: ['bsBulb'], map: [-14, -33.5] },
  { id: '7', name: 'Baños', pos: [11.6, 3.0, -30.4], look: [15.6, 0.9, -35.2], fov: 64, pan: 0.12, rooms: ['RESTROOMS'], lights: ['restroom'], map: [14, -33.5] },
];

// Definiciones de luces virtuales. El LightRig asigna las de cada vista a un pool fijo
// de luces reales (así nunca cambia el número de luces y no se recompilan shaders).
export const LIGHTS = {
  // Oficina
  officeLamp: { type: 'point', pos: [0, 2.45, -0.4], color: 0xffd9a0, intensity: 4.4, distance: 9, flicker: 'bulb' },
  deskLamp: { type: 'spot', pos: [1.18, 1.3, -1.95], target: [0.5, 0.75, -1.55], angle: 0.85, penumbra: 0.7, color: 0xffcf8a, intensity: 7, distance: 5, shadow: true },
  monitorGlow: { type: 'point', pos: [-0.1, 1.15, -1.35], color: 0x86b4ff, intensity: 0.9, distance: 3.5, flicker: 'screen' },
  doorL: { type: 'spot', pos: [-5.6, 2.9, -0.2], target: [-4.5, 0.9, -1.3], angle: 0.72, penumbra: 0.45, color: 0xfff1d0, intensity: 60, distance: 9, shadow: true, toggle: 'lightL', flicker: 'buzz' },
  doorR: { type: 'spot', pos: [5.6, 2.9, -0.2], target: [4.5, 0.9, -1.3], angle: 0.72, penumbra: 0.45, color: 0xfff1d0, intensity: 60, distance: 9, shadow: true, toggle: 'lightR', flicker: 'buzz' },
  whC: { type: 'point', pos: [-5.0, 2.8, -4.2], color: 0xcfe8dc, intensity: 0.55, distance: 7, flicker: 'fluoro', seed: 3 },
  ehC: { type: 'point', pos: [5.0, 2.8, -4.2], color: 0xcfe8dc, intensity: 0.55, distance: 7, flicker: 'fluoro', seed: 4 },
  moon: { type: 'point', pos: [0, 2.6, 2.0], color: 0x4a5a8a, intensity: 0.25, distance: 8, battery: true },
  faceLight: { type: 'spot', pos: [-3.2, 0.9, -0.6], target: [-4.5, 2.2, -1.2], angle: 0.5, penumbra: 0.8, color: 0xffb070, intensity: 14, distance: 5, shadow: true, battery: true },
  scare: { type: 'point', pos: [0, 1.5, 0.6], color: 0xffd8b0, intensity: 1.8, distance: 5, flicker: 'scare', battery: true },

  // Pasillos
  wh1: { type: 'point', pos: [-5.0, 2.8, -17.5], color: 0xd8f0e2, intensity: 2.2, distance: 9, flicker: 'fluoro', seed: 1 },
  wh2: { type: 'point', pos: [-5.0, 2.8, -10.5], color: 0xd8f0e2, intensity: 2.0, distance: 9, flicker: 'fluoro', seed: 2 },
  eh1: { type: 'point', pos: [5.0, 2.8, -17.5], color: 0xd8f0e2, intensity: 2.2, distance: 9, flicker: 'fluoro', seed: 5 },
  eh2: { type: 'point', pos: [5.0, 2.8, -10.5], color: 0xd8f0e2, intensity: 2.0, distance: 9, flicker: 'fluoro', seed: 6 },

  // Comedor y escenario
  stageL: { type: 'spot', pos: [-4.2, 4.1, -30.2], target: [-2.6, 1.6, -34.6], angle: 0.42, penumbra: 0.55, color: 0xffb3d0, intensity: 60, distance: 16, shadow: true },
  stageC: { type: 'spot', pos: [0, 4.2, -29.6], target: [0, 1.8, -35], angle: 0.36, penumbra: 0.5, color: 0xffe2b0, intensity: 70, distance: 16, shadow: true },
  stageR: { type: 'spot', pos: [4.2, 4.1, -30.2], target: [2.6, 1.6, -34.6], angle: 0.42, penumbra: 0.55, color: 0xa8c8ff, intensity: 60, distance: 16, shadow: true },
  dining1: { type: 'point', pos: [0, 4.0, -26], color: 0xffe6c0, intensity: 5, distance: 14, flicker: 'bulb', seed: 7 },
  dining2: { type: 'point', pos: [-7.5, 4.0, -25], color: 0xffe6c0, intensity: 4, distance: 12, flicker: 'bulb', seed: 8 },
  dining3: { type: 'point', pos: [7.5, 4.0, -25], color: 0xffe6c0, intensity: 4, distance: 12, flicker: 'bulb', seed: 9 },
  signGlow: { type: 'point', pos: [0, 3.2, -35.8], color: 0xff8a3a, intensity: 3, distance: 7 },

  // Otras salas
  coveSpot: { type: 'spot', pos: [-9.2, 4.1, -24.0], target: [-11.4, 1.0, -25], angle: 0.6, penumbra: 0.6, color: 0xd0a0ff, intensity: 30, distance: 10, shadow: true },
  coveGlow: { type: 'point', pos: [-13.2, 2.8, -25], color: 0x8a50c0, intensity: 1.4, distance: 6, flicker: 'bulb', seed: 10 },
  closetBulb: { type: 'point', pos: [-2.0, 2.55, -9.3], color: 0xffd8a0, intensity: 2.2, distance: 6, flicker: 'bulb', seed: 11 },
  bsBulb: { type: 'point', pos: [-13.8, 2.6, -33.4], color: 0xffcf90, intensity: 5, distance: 9, flicker: 'bulb', seed: 12 },
  restroom: { type: 'point', pos: [14.2, 2.9, -33.5], color: 0xe8fff4, intensity: 3.2, distance: 9, flicker: 'fluoro', seed: 13 },
  kitchen: { type: 'point', pos: [14.2, 2.9, -24.5], color: 0xffe0b0, intensity: 1.2, distance: 8, flicker: 'fluoro', seed: 14 },

  // Menú y galería
  menuKey: { type: 'spot', pos: [1.4, 1.6, -31.2], target: [0, 2.9, -34.9], angle: 0.55, penumbra: 0.8, color: 0xffd0a0, intensity: 38, distance: 8, flicker: 'menu', shadow: true },
  galKey: { type: 'spot', pos: [2.6, 4.2, -29.6], target: [0, 1.9, -33.6], angle: 0.5, penumbra: 0.7, color: 0xfff0dc, intensity: 38, distance: 12, shadow: true },
  galRim: { type: 'spot', pos: [-2.8, 4.0, -36.5], target: [0, 2.0, -33.6], angle: 0.6, penumbra: 0.6, color: 0x9ab8ff, intensity: 30, distance: 10, shadow: true },
  galFill: { type: 'point', pos: [-3, 2.2, -29.5], color: 0xffb88a, intensity: 3, distance: 12 },
};

export const VIEW_LIGHTS = {
  office: ['officeLamp', 'deskLamp', 'monitorGlow', 'doorL', 'doorR', 'whC', 'ehC', 'moon', 'faceLight'],
  menu: ['menuKey', 'stageL', 'stageR', 'signGlow', 'dining1'],
  gallery: ['galKey', 'galRim', 'stageC', 'galFill', 'signGlow', 'dining1'],
};
