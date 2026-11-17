import type { WeaponDef } from '../game/types';

/**
 * Weapon icons, drawn in code (no image files). Each weapon uses `icon` from its definition, or its id.
 * A new weapon can reuse any key below; an unknown key falls back to a shell in the weapon's colour.
 */

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const SIZE = 64;

function glow(c: Ctx, x: number, y: number, r: number, color: string, a = 0.7) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.save();
  c.globalAlpha = a;
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
  c.restore();
}

/** Artillery shell pointing along `ang` (radians), centred at x,y, length len. */
function shell(c: Ctx, x: number, y: number, len: number, ang: number, band = '#d9472b', body = '#c9ced4') {
  const w = len * 0.36;
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  const g = c.createLinearGradient(0, -w / 2, 0, w / 2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, body);
  g.addColorStop(1, '#4a5058');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(-len / 2, -w / 2);
  c.lineTo(len * 0.12, -w / 2);
  c.quadraticCurveTo(len / 2, -w / 2, len / 2, 0);
  c.quadraticCurveTo(len / 2, w / 2, len * 0.12, w / 2);
  c.lineTo(-len / 2, w / 2);
  c.closePath();
  c.fill();
  c.fillStyle = band;
  c.fillRect(-len * 0.2, -w / 2, len * 0.12, w);
  c.fillStyle = '#2b2f35';
  c.fillRect(-len / 2, -w / 2, len * 0.08, w);
  c.restore();
}

function starburst(c: Ctx, x: number, y: number, r: number, points: number, inner: string, outer: string) {
  c.save();
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, '#fffbe0');
  g.addColorStop(0.35, inner);
  g.addColorStop(1, outer);
  c.fillStyle = g;
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * 0.55 : r;
    const a = (i / (points * 2)) * TAU - Math.PI / 2;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
  c.restore();
}

function flame(c: Ctx, x: number, y: number, h: number) {
  const w = h * 0.62;
  const path = (k: number) => {
    c.beginPath();
    c.moveTo(x, y - h * k);
    c.bezierCurveTo(x + w * 0.15 * k, y - h * 0.6 * k, x + w * 0.62 * k, y - h * 0.45 * k, x + w * 0.5 * k, y - h * 0.12 * k);
    c.bezierCurveTo(x + w * 0.42 * k, y + h * 0.05, x + w * 0.2 * k, y + h * 0.1, x, y + h * 0.1);
    c.bezierCurveTo(x - w * 0.2 * k, y + h * 0.1, x - w * 0.42 * k, y + h * 0.05, x - w * 0.5 * k, y - h * 0.12 * k);
    c.bezierCurveTo(x - w * 0.6 * k, y - h * 0.4 * k, x - w * 0.1 * k, y - h * 0.5 * k, x, y - h * k);
    c.closePath();
  };
  const g = c.createLinearGradient(0, y - h, 0, y + h * 0.1);
  g.addColorStop(0, '#ffdf5a');
  g.addColorStop(0.5, '#ff7a1a');
  g.addColorStop(1, '#c41e0a');
  c.fillStyle = g;
  path(1);
  c.fill();
  const g2 = c.createLinearGradient(0, y - h * 0.55, 0, y + h * 0.1);
  g2.addColorStop(0, '#fffbe0');
  g2.addColorStop(1, '#ffc23a');
  c.fillStyle = g2;
  path(0.55);
  c.fill();
}

function ball(c: Ctx, x: number, y: number, r: number, light: string, dark: string) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
}

function ground(c: Ctx, y: number, color = '#8a5a34', top = '#c48a52') {
  c.fillStyle = color;
  c.fillRect(4, y, 56, 60 - y);
  c.fillStyle = top;
  c.fillRect(4, y, 56, 3);
}

function dashedArc(c: Ctx, pts: [number, number][], color: string) {
  c.save();
  c.strokeStyle = color;
  c.lineWidth = 2.5;
  c.lineCap = 'round';
  c.setLineDash([2, 5]);
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i + 1 < pts.length; i += 2) c.quadraticCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  c.stroke();
  c.restore();
}

const UP_RIGHT = -Math.PI / 4;

const DRAW: Record<string, (c: Ctx, w: WeaponDef) => void> = {
  shell: (c) => shell(c, 32, 32, 44, UP_RIGHT),
  'heavy-shell': (c) => shell(c, 32, 32, 56, UP_RIGHT, '#e8a21c'),
  megaton: (c) => {
    starburst(c, 40, 24, 22, 9, '#ffb347', 'rgba(255,74,18,0.9)');
    shell(c, 26, 38, 42, UP_RIGHT, '#e8a21c', '#9aa1a8');
  },
  doomsday: (c) => {
    glow(c, 32, 32, 32, '#fff36a', 0.8);
    c.fillStyle = '#ffd400';
    c.beginPath();
    c.arc(32, 32, 25, 0, TAU);
    c.fill();
    c.fillStyle = '#1a1a1a';
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 3;
      c.beginPath();
      c.moveTo(32, 32);
      c.arc(32, 32, 21, a - 0.52, a + 0.52);
      c.closePath();
      c.fill();
    }
    c.fillStyle = '#ffd400';
    c.beginPath();
    c.arc(32, 32, 7.5, 0, TAU);
    c.fill();
    c.fillStyle = '#1a1a1a';
    c.beginPath();
    c.arc(32, 32, 5, 0, TAU);
    c.fill();
  },
  'rail-slug': (c) => {
    c.strokeStyle = 'rgba(111,227,255,0.8)';
    c.lineWidth = 2;
    for (const [y, l] of [[22, 22], [30, 30], [38, 18]] as const) {
      c.beginPath();
      c.moveTo(6, y);
      c.lineTo(6 + l, y);
      c.stroke();
    }
    glow(c, 44, 30, 18, '#6fe3ff');
    shell(c, 42, 30, 30, 0, '#6fe3ff', '#e6fbff');
  },
  'ion-orb': (c) => {
    glow(c, 32, 32, 30, '#3fb6ff', 0.9);
    ball(c, 32, 32, 13, '#ffffff', '#3fb6ff');
    c.strokeStyle = '#d6f7ff';
    c.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      c.beginPath();
      c.moveTo(32 + Math.cos(a) * 13, 32 + Math.sin(a) * 13);
      c.lineTo(32 + Math.cos(a + 0.25) * 20, 32 + Math.sin(a + 0.25) * 20);
      c.lineTo(32 + Math.cos(a - 0.1) * 24, 32 + Math.sin(a - 0.1) * 24);
      c.lineTo(32 + Math.cos(a + 0.15) * 29, 32 + Math.sin(a + 0.15) * 29);
      c.stroke();
    }
  },
  'frost-bomb': (c) => {
    glow(c, 32, 32, 30, '#9fe8ff', 0.6);
    c.strokeStyle = '#eafcff';
    c.lineCap = 'round';
    c.lineWidth = 3.5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const dx = Math.cos(a),
        dy = Math.sin(a);
      c.beginPath();
      c.moveTo(32, 32);
      c.lineTo(32 + dx * 24, 32 + dy * 24);
      for (const s of [-1, 1]) {
        const b = a + s * 0.7;
        c.moveTo(32 + dx * 15, 32 + dy * 15);
        c.lineTo(32 + dx * 15 + Math.cos(b) * 8, 32 + dy * 15 + Math.sin(b) * 8);
      }
      c.stroke();
    }
  },
  trio: (c) => [-0.5, 0, 0.5].forEach((d) => shell(c, 26 + Math.cos(UP_RIGHT + d) * 16, 38 + Math.sin(UP_RIGHT + d) * 16, 30, UP_RIGHT + d)),
  quintet: (c) => [-0.84, -0.42, 0, 0.42, 0.84].forEach((d) => shell(c, 24 + Math.cos(UP_RIGHT + d) * 20, 40 + Math.sin(UP_RIGHT + d) * 20, 24, UP_RIGHT + d)),
  burst: (c) => [0, 1, 2, 3].forEach((k) => shell(c, 12 + k * 13, 52 - k * 13, 22, UP_RIGHT, '#f2c94c')),
  splitter: (c) => {
    shell(c, 18, 40, 28, UP_RIGHT + 0.2, '#e8a21c');
    c.strokeStyle = '#ffd36b';
    c.lineWidth = 2.5;
    c.lineCap = 'round';
    for (const a of [-0.9, -0.45, 0, 0.45]) {
      c.beginPath();
      c.moveTo(30, 28);
      c.lineTo(30 + Math.cos(a - 0.3) * 26, 28 + Math.sin(a - 0.3) * 26);
      c.stroke();
      ball(c, 30 + Math.cos(a - 0.3) * 27, 28 + Math.sin(a - 0.3) * 27, 4, '#fff1c0', '#d98a1e');
    }
  },
  cluster: (c) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      ball(c, 32 + Math.cos(a) * 21, 32 + Math.sin(a) * 21, 5, '#ffe3a0', '#c9781e');
    }
    ball(c, 32, 32, 12, '#6b7078', '#22262b');
    c.fillStyle = '#ffb35a';
    c.fillRect(29, 17, 6, 6);
  },
  hailstorm: (c) => {
    c.fillStyle = '#d7e6f5';
    for (const [x, y, r] of [[22, 22, 11], [34, 18, 13], [45, 23, 10], [32, 26, 11]] as const) {
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
    }
    for (const [x, y] of [[18, 44], [28, 52], [38, 42], [48, 50], [24, 36], [44, 36]] as const) ball(c, x, y, 3.5, '#ffffff', '#8fc8ee');
  },
  'jumping-jack': (c) => {
    ground(c, 52);
    dashedArc(c, [[6, 52], [13, 26], [20, 52], [28, 32], [36, 52], [43, 38], [50, 52]], '#ff8fe9');
    for (const x of [20, 36, 50]) glow(c, x, 50, 9, '#ff4fd8', 0.9);
    ball(c, 50, 47, 4.5, '#ffd6f6', '#ff4fd8');
  },
  roller: (c) => {
    ground(c, 46);
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 2;
    for (const y of [32, 38]) {
      c.beginPath();
      c.moveTo(8, y);
      c.lineTo(22, y);
      c.stroke();
    }
    ball(c, 36, 35, 11, '#ffffff', '#7d8085');
  },
  'heavy-roller': (c) => {
    ground(c, 50);
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 2;
    for (const y of [30, 38]) {
      c.beginPath();
      c.moveTo(4, y);
      c.lineTo(16, y);
      c.stroke();
    }
    ball(c, 36, 34, 16, '#ffffff', '#5f6267');
    c.strokeStyle = '#3a3c40';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(36, 34, 9, 0.4, 2.4);
    c.stroke();
  },
  bouncer: (c) => {
    ground(c, 52, '#3b5a35', '#7fc46a');
    dashedArc(c, [[6, 14], [12, 40], [16, 52], [24, 26], [32, 52], [38, 34], [44, 52]], '#7dff9a');
    glow(c, 50, 44, 12, '#3dff7a', 0.8);
    ball(c, 50, 44, 6.5, '#e2ffe8', '#2ecf62');
  },
  seeker: (c) => {
    c.strokeStyle = '#ff6b6b';
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(42, 40, 13, 0, TAU);
    c.moveTo(42, 22);
    c.lineTo(42, 31);
    c.moveTo(42, 49);
    c.lineTo(42, 58);
    c.moveTo(24, 40);
    c.lineTo(33, 40);
    c.moveTo(51, 40);
    c.lineTo(60, 40);
    c.stroke();
    dashedArc(c, [[6, 40], [10, 8], [30, 20]], '#ffb0b0');
    shell(c, 30, 22, 22, 0.75, '#ff3b3b');
  },
  tunneler: (c) => {
    ground(c, 18);
    c.fillStyle = '#2a1a10';
    c.save();
    c.translate(32, 36);
    c.rotate(0.5);
    c.fillRect(-30, -7, 30, 14);
    c.restore();
    c.save();
    c.translate(36, 38);
    c.rotate(0.5);
    const g = c.createLinearGradient(0, -8, 0, 8);
    g.addColorStop(0, '#fff3d0');
    g.addColorStop(1, '#a8823a');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-10, -8);
    c.lineTo(14, 0);
    c.lineTo(-10, 8);
    c.closePath();
    c.fill();
    c.strokeStyle = '#6b4a20';
    c.lineWidth = 1.5;
    for (const x of [-6, 0, 6]) {
      c.beginPath();
      c.moveTo(x, -6 + (x + 10) * 0.3);
      c.lineTo(x + 3, 6 - (x + 10) * 0.3);
      c.stroke();
    }
    c.restore();
  },
  'bunker-buster': (c) => {
    ground(c, 22, '#5d4a3a', '#9a8068');
    starburst(c, 36, 46, 15, 8, '#ffb347', 'rgba(255,74,18,0.9)');
    shell(c, 26, 22, 34, 1.0, '#e8a21c', '#9aa1a8');
  },
  laser: (c) => {
    glow(c, 34, 30, 30, '#ff3df0', 0.5);
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(255,61,240,0.45)';
    c.lineWidth = 10;
    c.beginPath();
    c.moveTo(14, 46);
    c.lineTo(58, 10);
    c.stroke();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(14, 46);
    c.lineTo(58, 10);
    c.stroke();
    c.fillStyle = '#4a4f57';
    c.save();
    c.translate(12, 48);
    c.rotate(-0.68);
    c.fillRect(-10, -6, 16, 12);
    c.restore();
  },
  napalm: (c) => {
    glow(c, 32, 40, 30, '#ff5a1a', 0.6);
    flame(c, 32, 46, 38);
  },
  inferno: (c) => {
    glow(c, 32, 40, 32, '#ff3a0a', 0.75);
    flame(c, 18, 50, 26);
    flame(c, 46, 50, 28);
    flame(c, 32, 50, 42);
  },
  'dirt-ball': (c) => {
    ball(c, 32, 32, 18, '#c9996a', '#5a3a20');
    for (const [x, y, r] of [[14, 48, 4], [52, 46, 3.5], [48, 16, 3], [12, 20, 3]] as const) ball(c, x, y, r, '#b8865a', '#5a3a20');
  },
  'earth-wall': (c) => {
    ground(c, 54);
    c.fillStyle = '#9a6a3e';
    c.beginPath();
    c.moveTo(6, 54);
    c.quadraticCurveTo(32, -4, 58, 54);
    c.closePath();
    c.fill();
    c.strokeStyle = '#d8a46a';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(10, 50);
    c.quadraticCurveTo(32, -2, 54, 50);
    c.stroke();
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(32, 20);
    c.lineTo(25, 30);
    c.lineTo(39, 30);
    c.closePath();
    c.fill();
    c.fillRect(29.5, 29, 5, 12);
  },
  'dirt-shower': (c) => {
    ball(c, 32, 14, 9, '#c9996a', '#5a3a20');
    for (const [x, y] of [[16, 30], [26, 38], [38, 34], [48, 42], [20, 50], [34, 54], [46, 56]] as const) ball(c, x, y, 3.8, '#b8865a', '#5a3a20');
  },
  leveler: (c) => {
    c.fillStyle = 'rgba(154,106,62,0.35)';
    c.beginPath();
    c.moveTo(4, 40);
    c.quadraticCurveTo(20, 12, 34, 30);
    c.quadraticCurveTo(46, 44, 60, 22);
    c.lineTo(60, 40);
    c.closePath();
    c.fill();
    c.fillStyle = '#9a6a3e';
    c.fillRect(4, 40, 56, 20);
    c.fillStyle = '#e8d6a8';
    c.fillRect(4, 38, 56, 4);
    c.fillStyle = '#fff';
    for (const x of [18, 46]) {
      c.beginPath();
      c.moveTo(x, 34);
      c.lineTo(x - 6, 24);
      c.lineTo(x + 6, 24);
      c.closePath();
      c.fill();
    }
  },
};

const cache = new Map<string, string>();

/** Data URL of a weapon's icon (cached). */
export function weaponIcon(w: WeaponDef): string {
  const key = w.icon ?? w.id;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE * 2;
  const c = canvas.getContext('2d')!;
  c.scale(2, 2);
  const draw = DRAW[key];
  if (draw) draw(c, w);
  else {
    const col = w.projectile?.glow ?? w.projectile?.color ?? w.beam?.color ?? '#ffd27a';
    glow(c, 32, 32, 26, col, 0.6);
    shell(c, 32, 32, 36, UP_RIGHT, col);
  }
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

export const ICON_KEYS = Object.keys(DRAW);
