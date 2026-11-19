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
  excavator: (c) => {
    ground(c, 20);
    c.fillStyle = '#1e140c';
    c.beginPath();
    c.ellipse(32, 20, 26, 24, 0, 0, Math.PI);
    c.fill();
    c.strokeStyle = '#d8a46a';
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(32, 20, 26, 24, 0, 0, Math.PI);
    c.stroke();
    // bucket
    c.save();
    c.translate(40, 14);
    c.rotate(0.5);
    c.fillStyle = '#f2b632';
    c.beginPath();
    c.moveTo(-10, -8);
    c.lineTo(10, -8);
    c.lineTo(6, 8);
    c.lineTo(-8, 8);
    c.closePath();
    c.fill();
    c.fillStyle = '#6b5a2a';
    for (const x of [-6, -1, 4]) c.fillRect(x, 8, 3, 4);
    c.restore();
    for (const [x, y] of [[14, 10], [22, 6], [54, 8]] as const) ball(c, x, y, 3, '#c9996a', '#5a3a20');
  },
  thunderbolt: (c) => {
    c.fillStyle = '#5a6478';
    for (const [x, y, r] of [[20, 14, 10], [32, 10, 12], [44, 14, 10], [32, 18, 10]] as const) {
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
    }
    glow(c, 32, 40, 26, '#7fb8ff', 0.8);
    c.fillStyle = '#fff6b0';
    c.strokeStyle = '#ffd400';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(34, 20);
    c.lineTo(24, 40);
    c.lineTo(32, 40);
    c.lineTo(27, 60);
    c.lineTo(42, 34);
    c.lineTo(34, 34);
    c.lineTo(40, 20);
    c.closePath();
    c.fill();
    c.stroke();
  },
  earthquake: (c) => {
    ground(c, 34);
    c.strokeStyle = '#1e140c';
    c.lineWidth = 3;
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(32, 34);
    c.lineTo(28, 42);
    c.lineTo(35, 48);
    c.lineTo(30, 60);
    c.moveTo(28, 42);
    c.lineTo(18, 50);
    c.moveTo(35, 48);
    c.lineTo(46, 56);
    c.stroke();
    c.strokeStyle = '#ffd36b';
    c.lineWidth = 2.5;
    c.lineCap = 'round';
    for (const k of [0, 1, 2]) {
      c.beginPath();
      c.arc(32, 34, 10 + k * 8, Math.PI * 1.15, Math.PI * 1.85);
      c.stroke();
    }
  },
  'chain-gun': (c) => {
    c.strokeStyle = '#8a6a2a';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(6, 58);
    c.lineTo(52, 12);
    c.stroke();
    for (let k = 0; k < 6; k++) shell(c, 10 + k * 8, 54 - k * 8, 14, UP_RIGHT, '#f2c94c', '#e8c060');
  },
  scattergun: (c) => {
    c.fillStyle = '#4a4f57';
    c.save();
    c.translate(14, 46);
    c.rotate(-0.6);
    c.fillRect(-10, -5, 22, 10);
    c.restore();
    glow(c, 24, 38, 12, '#ffb347', 0.9);
    for (let i = 0; i < 7; i++) {
      const a = -1.15 + i * 0.14;
      const r = 20 + (i % 3) * 7;
      ball(c, 24 + Math.cos(a) * r * 1.3, 38 + Math.sin(a) * r * 1.1, 3.2, '#fff1c0', '#c98a1e');
    }
  },
  fireworks: (c) => {
    const cols = ['#ff5ac8', '#5ae8ff', '#ffd84a'];
    for (const [x, y, r, k] of [[22, 22, 15, 0], [44, 26, 13, 1], [32, 44, 12, 2]] as const) {
      glow(c, x, y, r, cols[k], 0.7);
      c.strokeStyle = cols[k];
      c.lineWidth = 2;
      c.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        c.beginPath();
        c.moveTo(x + Math.cos(a) * r * 0.35, y + Math.sin(a) * r * 0.35);
        c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        c.stroke();
      }
      ball(c, x, y, 2.5, '#ffffff', cols[k]);
    }
  },
  airstrike: (c) => {
    // plane silhouette
    c.fillStyle = '#c9ced4';
    c.beginPath();
    c.moveTo(6, 14);
    c.lineTo(52, 12);
    c.quadraticCurveTo(60, 13, 52, 16);
    c.lineTo(6, 18);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(24, 15);
    c.lineTo(36, 4);
    c.lineTo(40, 4);
    c.lineTo(34, 15);
    c.moveTo(24, 16);
    c.lineTo(34, 26);
    c.lineTo(38, 26);
    c.lineTo(34, 16);
    c.fill();
    c.fillRect(6, 8, 4, 8);
    for (let k = 0; k < 4; k++) shell(c, 14 + k * 11, 30 + k * 7, 14, Math.PI / 2, '#d9472b', '#9aa1a8');
  },
  'acid-rain': (c) => {
    glow(c, 32, 20, 26, '#7dff3a', 0.5);
    c.fillStyle = '#4e6b36';
    for (const [x, y, r] of [[20, 18, 10], [32, 13, 12], [44, 18, 10], [32, 22, 10]] as const) {
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
    }
    c.fillStyle = '#a6ff4d';
    for (const [x, y] of [[16, 38], [28, 46], [40, 38], [50, 50], [22, 56], [36, 58]] as const) {
      c.beginPath();
      c.moveTo(x, y - 7);
      c.quadraticCurveTo(x + 4, y, x, y + 3);
      c.quadraticCurveTo(x - 4, y, x, y - 7);
      c.fill();
    }
  },
  swarm: (c) => {
    dashedArc(c, [[6, 54], [14, 20], [30, 24]], '#ffb0b0');
    for (const [x, y, a] of [[40, 16, 0.3], [46, 32, 0.7], [36, 44, 1.1]] as const) {
      glow(c, x, y, 9, '#ff3b3b', 0.7);
      shell(c, x, y, 16, a, '#ff3b3b', '#e0e4e8');
    }
    c.strokeStyle = '#ff6b6b';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(52, 54, 7, 0, TAU);
    c.stroke();
  },
  'triple-roller': (c) => {
    ground(c, 48);
    ball(c, 14, 40, 8, '#ffffff', '#7d8085');
    ball(c, 32, 40, 8, '#ffffff', '#7d8085');
    ball(c, 50, 40, 8, '#ffffff', '#7d8085');
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(4, 26);
    c.lineTo(20, 26);
    c.moveTo(24, 22);
    c.lineTo(38, 22);
    c.stroke();
  },
  'wild-ball': (c) => {
    ground(c, 54, '#3b3b5a', '#8a8adf');
    dashedArc(c, [[4, 10], [8, 34], [12, 54], [18, 20], [24, 54], [30, 30], [36, 54], [41, 38], [46, 54]], '#ffe066');
    glow(c, 52, 46, 12, '#ffc400', 0.9);
    ball(c, 52, 46, 7, '#fffbe0', '#e0a400');
  },
  'pile-driver': (c) => {
    ground(c, 30, '#5d4a3a', '#9a8068');
    c.fillStyle = '#1e140c';
    c.fillRect(28, 30, 8, 18);
    starburst(c, 32, 50, 12, 8, '#ffb347', 'rgba(255,74,18,0.9)');
    shell(c, 32, 16, 30, Math.PI / 2, '#e8e8e8', '#9aa1a8');
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 2;
    for (const x of [22, 42]) {
      c.beginPath();
      c.moveTo(x, 2);
      c.lineTo(x, 16);
      c.stroke();
    }
  },
  'mole-swarm': (c) => {
    ground(c, 14);
    c.strokeStyle = '#1e140c';
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(32, 14);
    c.lineTo(32, 30);
    for (const a of [0.6, 1.2, 1.9, 2.5]) {
      c.moveTo(32, 30);
      c.lineTo(32 + Math.cos(a) * 24, 30 + Math.sin(a) * 24);
    }
    c.stroke();
    for (const a of [0.6, 1.2, 1.9, 2.5]) ball(c, 32 + Math.cos(a) * 24, 30 + Math.sin(a) * 24, 4, '#fff3d0', '#a8823a');
  },
  tracer: (c) => {
    dashedArc(c, [[6, 56], [24, -6], [54, 44]], '#9effc8');
    c.strokeStyle = '#4dff9a';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(54, 48, 6, 0, TAU);
    c.moveTo(54, 38);
    c.lineTo(54, 58);
    c.moveTo(44, 48);
    c.lineTo(64, 48);
    c.stroke();
    glow(c, 18, 26, 10, '#4dff9a', 0.9);
    ball(c, 18, 26, 3.5, '#eafff2', '#4dff9a');
  },
  volcano: (c) => {
    glow(c, 32, 22, 26, '#ff5a1a', 0.7);
    c.fillStyle = '#4a3a30';
    c.beginPath();
    c.moveTo(4, 60);
    c.lineTo(24, 26);
    c.lineTo(40, 26);
    c.lineTo(60, 60);
    c.closePath();
    c.fill();
    c.fillStyle = '#ff6a1a';
    c.beginPath();
    c.moveTo(24, 26);
    c.lineTo(40, 26);
    c.lineTo(36, 36);
    c.lineTo(33, 32);
    c.lineTo(29, 40);
    c.lineTo(27, 32);
    c.closePath();
    c.fill();
    for (const [x, y, r] of [[18, 12, 3.5], [32, 6, 4], [46, 12, 3.5], [26, 16, 2.5], [40, 18, 2.5]] as const) ball(c, x, y, r, '#fff1c0', '#ff4a12');
  },
  spire: (c) => {
    ground(c, 54);
    c.fillStyle = '#9a6a3e';
    c.beginPath();
    c.moveTo(22, 54);
    c.lineTo(28, 14);
    c.quadraticCurveTo(32, 4, 36, 14);
    c.lineTo(42, 54);
    c.closePath();
    c.fill();
    c.strokeStyle = '#d8a46a';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(25, 52);
    c.lineTo(30, 14);
    c.stroke();
  },
  ripple: (c) => rippleIcon(c, 2, '#ffd36b'),
  'big-ripple': (c) => rippleIcon(c, 3, '#ffb347'),
  'ripple-storm': (c) => rippleIcon(c, 4, '#ff7a3d'),
  'fuse-grenade': (c) => {
    ball(c, 30, 38, 16, '#c8f0a8', '#3f7a2a');
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = 1.5;
    for (const y of [30, 38, 46]) {
      c.beginPath();
      c.moveTo(16, y);
      c.lineTo(44, y);
      c.stroke();
    }
    c.fillStyle = '#6b7078';
    c.fillRect(25, 18, 10, 6);
    c.strokeStyle = '#d9c08a';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(30, 18);
    c.quadraticCurveTo(36, 8, 46, 10);
    c.stroke();
    glow(c, 47, 10, 9, '#ffd36b', 1);
    ball(c, 47, 10, 2.5, '#ffffff', '#ffb347');
  },
  'prox-shell': (c) => {
    c.strokeStyle = 'rgba(255,228,107,0.8)';
    c.lineWidth = 2;
    c.setLineDash([3, 4]);
    c.beginPath();
    c.arc(34, 30, 24, 0, TAU);
    c.stroke();
    c.setLineDash([]);
    glow(c, 34, 30, 16, '#ffc400', 0.7);
    shell(c, 34, 30, 30, UP_RIGHT, '#ffc400');
  },
  crawler: (c) => {
    ground(c, 46);
    c.fillStyle = '#9aa1a8';
    c.beginPath();
    c.moveTo(14, 44);
    c.lineTo(18, 32);
    c.lineTo(42, 32);
    c.quadraticCurveTo(52, 34, 52, 44);
    c.closePath();
    c.fill();
    c.fillStyle = '#2b2f35';
    for (const x of [20, 30, 40, 48]) {
      c.beginPath();
      c.arc(x, 45, 3.5, 0, TAU);
      c.fill();
    }
    glow(c, 50, 36, 8, '#ff5a5a', 1);
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(2, 36);
    c.lineTo(10, 36);
    c.moveTo(4, 42);
    c.lineTo(11, 42);
    c.stroke();
  },
  boomerang: (c) => {
    dashedArc(c, [[10, 54], [40, -10], [54, 30], [62, 54], [26, 44]], '#ffcf6b');
    c.save();
    c.translate(28, 30);
    c.rotate(-0.5);
    c.fillStyle = '#ff9f1a';
    c.beginPath();
    c.moveTo(-14, 6);
    c.quadraticCurveTo(0, -14, 14, 6);
    c.quadraticCurveTo(0, -4, -14, 6);
    c.fill();
    c.restore();
  },
  breaker: (c) => {
    c.fillStyle = '#4a4f57';
    c.fillRect(4, 26, 16, 12);
    const g = c.createLinearGradient(20, 0, 60, 0);
    g.addColorStop(0, 'rgba(255,240,200,1)');
    g.addColorStop(1, 'rgba(255,120,30,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(20, 28);
    c.lineTo(60, 14);
    c.lineTo(60, 50);
    c.lineTo(20, 36);
    c.closePath();
    c.fill();
    for (const [x, y] of [[50, 10], [56, 54], [44, 52]] as const) ball(c, x, y, 3, '#c9996a', '#5a3a20');
  },
  'warp-shell': (c) => {
    for (const [x, y] of [[16, 46], [48, 18]] as const) {
      glow(c, x, y, 16, '#9a6bff', 0.9);
      c.strokeStyle = '#d8c8ff';
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(x, y, 12, 5, 0, 0, TAU);
      c.stroke();
    }
    c.strokeStyle = 'rgba(199,168,255,0.8)';
    c.setLineDash([3, 4]);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(16, 40);
    c.quadraticCurveTo(20, 14, 44, 18);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#c9ced4';
    c.fillRect(42, 10, 12, 6);
  },
  gust: (c) => {
    c.strokeStyle = '#cfeaff';
    c.lineWidth = 3;
    c.lineCap = 'round';
    for (const [y, l] of [[20, 40], [32, 50], [44, 34]] as const) {
      c.beginPath();
      c.moveTo(6, y);
      c.lineTo(6 + l, y);
      c.arc(6 + l, y - 6, 6, Math.PI / 2, -Math.PI / 2, true);
      c.stroke();
    }
    ball(c, 52, 50, 5, '#ffffff', '#6fbfff');
  },
  vortex: (c) => {
    glow(c, 32, 32, 30, '#7c4dff', 0.8);
    c.strokeStyle = '#d8c8ff';
    c.lineWidth = 2.5;
    c.beginPath();
    for (let k = 0; k < 120; k++) {
      const a = k * 0.16;
      const r = 26 - k * 0.2;
      c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    c.stroke();
  },
  'lucky-dip': (c) => {
    c.fillStyle = '#ff8ad8';
    c.beginPath();
    c.moveTo(12, 26);
    c.lineTo(52, 26);
    c.lineTo(46, 58);
    c.lineTo(18, 58);
    c.closePath();
    c.fill();
    c.fillStyle = '#ffd36b';
    c.fillRect(10, 22, 44, 6);
    c.fillStyle = '#ffffff';
    c.font = '900 26px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('?', 32, 52);
    starburst(c, 24, 14, 9, 6, '#fff3a0', 'rgba(255,180,40,0.9)');
    ball(c, 42, 12, 5, '#c8f0a8', '#3f7a2a');
  },
  'long-shot': (c) => {
    c.fillStyle = '#2b2f35';
    c.beginPath();
    c.arc(32, 34, 24, 0, TAU);
    c.fill();
    c.fillStyle = '#ffd400';
    c.beginPath();
    c.moveTo(32, 34);
    c.arc(32, 34, 24, -Math.PI / 2, 0);
    c.closePath();
    c.fill();
    c.fillStyle = '#ffffff';
    c.font = '900 16px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('1:4', 32, 40);
    glow(c, 44, 20, 12, '#fff36a', 0.8);
  },
  dome: (c) => {
    ground(c, 50);
    c.strokeStyle = '#9a6a3e';
    c.lineWidth = 8;
    c.beginPath();
    c.arc(32, 50, 22, Math.PI, 0);
    c.stroke();
    c.strokeStyle = '#d8a46a';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(32, 50, 26, Math.PI, 0);
    c.stroke();
    c.fillStyle = '#38c6ff';
    c.fillRect(25, 42, 14, 7);
  },
  mudslide: (c) => {
    ground(c, 48);
    c.fillStyle = '#6b4a2b';
    c.beginPath();
    c.moveTo(4, 20);
    c.quadraticCurveTo(26, 22, 36, 40);
    c.quadraticCurveTo(44, 50, 60, 48);
    c.lineTo(60, 50);
    c.lineTo(4, 50);
    c.closePath();
    c.fill();
    for (const [x, y] of [[16, 18], [28, 28], [40, 38], [52, 44]] as const) ball(c, x, y, 4, '#b8865a', '#5a3a20');
  },
  'kettle-pop': (c) => {
    glow(c, 32, 36, 28, '#ffcc55', 0.55);
    // popped kernels: lumpy white puffs
    const puff = (x: number, y: number, r: number) => {
      for (const [dx, dy, k] of [[0, 0, 1], [-r * 0.6, r * 0.3, 0.7], [r * 0.6, r * 0.25, 0.75], [0, -r * 0.55, 0.7]] as const) ball(c, x + dx, y + dy, r * k, '#fffdf4', '#e8c98a');
      c.fillStyle = '#f2b544';
      c.beginPath();
      c.arc(x + r * 0.2, y + r * 0.55, r * 0.3, 0, TAU);
      c.fill();
    };
    puff(22, 40, 9);
    puff(42, 30, 8);
    puff(36, 50, 6);
    for (const [x, y] of [[12, 18], [52, 12], [56, 46], [28, 14]] as const) starburst(c, x, y, 5, 5, '#fff3a0', 'rgba(255,140,30,0.9)');
  },
  singularity: (c) => {
    glow(c, 32, 32, 30, '#9b5cff', 0.9);
    c.strokeStyle = 'rgba(214,190,255,0.9)';
    c.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      c.beginPath();
      c.ellipse(32, 32, 24 - k * 5, 9 - k * 2, -0.35, 0, TAU);
      c.stroke();
    }
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 10);
    g.addColorStop(0, '#000000');
    g.addColorStop(0.8, '#120624');
    g.addColorStop(1, '#c9a6ff');
    c.fillStyle = g;
    c.beginPath();
    c.arc(32, 32, 10, 0, TAU);
    c.fill();
  },
  'phase-shell': (c) => {
    c.fillStyle = '#8a5a34';
    c.fillRect(24, 14, 16, 46);
    c.fillStyle = '#c48a52';
    c.fillRect(24, 14, 16, 4);
    c.globalAlpha = 0.35;
    shell(c, 32, 34, 30, 0, '#5ce1ff', '#bff9ff');
    c.globalAlpha = 1;
    glow(c, 50, 34, 14, '#5ce1ff', 0.8);
    shell(c, 50, 34, 22, 0, '#5ce1ff', '#e6fdff');
    glow(c, 12, 34, 10, '#5ce1ff', 0.6);
  },
  'mirror-shell': (c) => {
    dashedArc(c, [[8, 56], [32, 8], [56, 56]], '#9fd0ff');
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(32, 6);
    c.lineTo(32, 60);
    c.stroke();
    glow(c, 32, 12, 12, '#9fd0ff', 0.9);
    shell(c, 16, 30, 20, Math.PI * 0.65, '#9fd0ff');
    shell(c, 48, 30, 20, Math.PI * 0.35, '#9fd0ff');
  },
  pickpocket: (c) => {
    glow(c, 32, 34, 26, '#ffd84a', 0.6);
    for (const [x, y] of [[20, 44], [32, 38], [44, 44], [26, 28], [40, 26]] as const) {
      ball(c, x, y, 7, '#fff2a8', '#c98a1a');
      c.strokeStyle = '#a8700f';
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(x, y, 4.5, 0, TAU);
      c.stroke();
    }
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2.5;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(8, 14);
    c.quadraticCurveTo(20, 8, 26, 16);
    c.stroke();
  },
  switcheroo: (c) => {
    glow(c, 32, 32, 28, '#c9a6ff', 0.6);
    c.strokeStyle = '#e6d6ff';
    c.fillStyle = '#e6d6ff';
    c.lineWidth = 3.5;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(32, 34, 18, Math.PI * 1.1, Math.PI * 1.9);
    c.stroke();
    c.beginPath();
    c.arc(32, 30, 18, Math.PI * 0.1, Math.PI * 0.9);
    c.stroke();
    for (const [x, y, d] of [[49, 26, 1], [15, 38, -1]] as const) {
      c.beginPath();
      c.moveTo(x, y + 6 * d);
      c.lineTo(x - 6 * d, y - 2 * d);
      c.lineTo(x + 6 * d, y - 2 * d);
      c.closePath();
      c.fill();
    }
  },
  'orbital-lance': (c) => {
    ground(c, 46);
    const g = c.createLinearGradient(26, 0, 38, 0);
    g.addColorStop(0, 'rgba(255,60,60,0)');
    g.addColorStop(0.5, '#ffe0e0');
    g.addColorStop(1, 'rgba(255,60,60,0)');
    glow(c, 32, 46, 20, '#ff3b3b', 0.9);
    c.fillStyle = g;
    c.fillRect(26, 0, 12, 60);
    c.fillStyle = '#1a0f0f';
    c.fillRect(29, 47, 6, 17);
  },
  'echo-charge': (c) => {
    for (const [r, a] of [[26, 0.35], [18, 0.6], [10, 1]] as const) {
      c.globalAlpha = a;
      starburst(c, 32, 34, r, 8, '#ffd27a', 'rgba(255,90,20,0.9)');
    }
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(255,220,180,0.8)';
    c.lineWidth = 1.5;
    for (const r of [22, 28]) {
      c.beginPath();
      c.arc(32, 34, r, 0, TAU);
      c.stroke();
    }
  },
  'twin-crawlers': (c) => {
    ground(c, 46);
    for (const [x, d] of [[16, -1], [48, 1]] as const) {
      c.fillStyle = '#c0c6cc';
      c.fillRect(x - 8, 36, 16, 8);
      c.fillStyle = '#2b2f35';
      c.fillRect(x - 9, 43, 18, 4);
      glow(c, x + d * 8, 38, 6, '#ff5a5a', 0.9);
      c.strokeStyle = '#ffffff';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x + d * 12, 30);
      c.lineTo(x + d * 18, 30);
      c.stroke();
    }
  },
  'brain-fog': (c) => {
    glow(c, 32, 32, 30, '#ff7ae6', 0.7);
    c.strokeStyle = '#ffd6f6';
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.beginPath();
    for (let k = 0; k < 90; k++) {
      const a = k * 0.2;
      const r = 4 + k * 0.24;
      c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r * 0.8);
    }
    c.stroke();
    c.fillStyle = '#ffffff';
    c.font = '800 16px system-ui, sans-serif';
    c.fillText('?', 44, 16);
    c.fillText('?', 8, 54);
  },
  springwall: (c) => {
    ground(c, 50);
    glow(c, 32, 30, 26, '#2fd9b8', 0.5);
    const g = c.createLinearGradient(24, 0, 40, 0);
    g.addColorStop(0, '#2aa893');
    g.addColorStop(0.5, '#7ff7e2');
    g.addColorStop(1, '#2aa893');
    c.fillStyle = g;
    c.fillRect(25, 8, 14, 44);
    dashedArc(c, [[4, 40], [18, 18], [24, 22]], '#ffffff');
    dashedArc(c, [[24, 22], [14, 30], [6, 46]], '#ffd27a');
    shell(c, 10, 40, 12, Math.PI * 0.7);
  },
  'rubber-coat': (c) => {
    ground(c, 44);
    c.fillStyle = '#5ff0d6';
    c.fillRect(0, 40, 64, 6);
    glow(c, 32, 42, 22, '#2fd9b8', 0.5);
    dashedArc(c, [[10, 8], [26, 40], [46, 10]], '#ffffff');
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(26, 38, 3, 0, TAU);
    c.fill();
  },
};

function rippleIcon(c: Ctx, rings: number, color: string) {
  glow(c, 32, 40, 28, color, 0.5);
  c.strokeStyle = color;
  c.lineWidth = 2;
  for (let k = 0; k < rings; k++) {
    c.globalAlpha = 1 - k * 0.18;
    c.beginPath();
    c.arc(32, 46, 8 + k * 7, Math.PI, 0);
    c.stroke();
  }
  c.globalAlpha = 1;
  const pts: [number, number][] = [[32, 40]];
  for (let k = 1; k < rings; k++) pts.push([32 - k * 9, 44 - k * 4], [32 + k * 9, 44 - k * 4]);
  for (const [x, y] of pts) starburst(c, x, y, 7, 6, '#fff3a0', 'rgba(255,90,20,0.9)');
}

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
