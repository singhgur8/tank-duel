import { WORLD_H, WORLD_W } from '../config';
import type { Fx, Game } from '../game/game';
import type { ExplosionStyle, TrailStyle, WeaponDef } from '../game/types';
import type { Audio } from './audio';

/**
 * Visual effects: particles, lights, shockwaves, beams, damage numbers, camera shake and hit-stop.
 * Uses Math.random freely because none of this affects gameplay.
 */

const R = Math.random;
const rr = (a: number, b: number) => a + (b - a) * R();

const enum K {
  Spark,
  Smoke,
  Fire,
  Debris,
  Glow,
  Shard,
}

interface Particle {
  k: K;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  s0: number;
  s1: number;
  color: string;
  drag: number;
  grav: number;
  rot: number;
  vr: number;
  a: number;
  delay: number;
}

interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  max: number;
  color: string;
  width: number;
}

interface Light {
  x: number;
  y: number;
  r: number;
  color: string;
  life: number;
  max: number;
  a: number;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  big: boolean;
}

interface Beam {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  width: number;
  life: number;
  max: number;
}

interface Fireball {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  core: string;
  mid: string;
  outer: string;
}

const shade = (hex: string, k: number) => {
  const n = (i: number) => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k));
  return `rgb(${n(1)},${n(3)},${n(5)})`;
};

interface Arc {
  pts: number[];
  life: number;
  color: string;
}

interface Ribbon {
  tracer?: boolean;
  pts: { x: number; y: number }[];
  color: string;
  width: number;
  life: number; // >0 once detached from its projectile
  style: TrailStyle;
}

const PALETTE: Record<ExplosionStyle, { core: string; mid: string; outer: string; smoke: string; spark: string }> = {
  small: { core: '#fff7d6', mid: '#ffbe55', outer: '#ff6a1f', smoke: '#3d3632', spark: '#ffd27a' },
  standard: { core: '#fff7d6', mid: '#ffb347', outer: '#ff5a1f', smoke: '#38302c', spark: '#ffcc66' },
  big: { core: '#ffffff', mid: '#ffc35a', outer: '#ff4a12', smoke: '#2e2724', spark: '#ffd27a' },
  nuke: { core: '#ffffff', mid: '#fff1a8', outer: '#ff7a1a', smoke: '#4a3b34', spark: '#fff3b0' },
  plasma: { core: '#ffffff', mid: '#8af3ff', outer: '#b44dff', smoke: '#28284a', spark: '#9ef0ff' },
  fire: { core: '#fff2c0', mid: '#ff9a2e', outer: '#ff3d0a', smoke: '#2a201c', spark: '#ffb24a' },
  dirt: { core: '#e8d2a8', mid: '#a9825a', outer: '#6b4a2b', smoke: '#6e5a45', spark: '#d9b98a' },
  ice: { core: '#ffffff', mid: '#c9f6ff', outer: '#59c8ff', smoke: '#9ab8cc', spark: '#e8fdff' },
  acid: { core: '#f4ffd6', mid: '#a6ff4d', outer: '#3fbf1f', smoke: '#2c3a22', spark: '#c8ff7a' },
};

interface Bolt {
  pts: number[];
  life: number;
  max: number;
}

/** Soft round sprites, cached per colour, used for glows, fire and smoke. */
const spriteCache = new Map<string, HTMLCanvasElement>();
function soft(color: string): HTMLCanvasElement {
  let c = spriteCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, color);
  grd.addColorStop(0.35, color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  // fade the colour itself out at the edge
  g.fillStyle = grd;
  g.globalAlpha = 1;
  g.beginPath();
  g.arc(32, 32, 32, 0, Math.PI * 2);
  g.fill();
  const out = document.createElement('canvas');
  out.width = out.height = 64;
  const o = out.getContext('2d')!;
  const mask = o.createRadialGradient(32, 32, 0, 32, 32, 32);
  mask.addColorStop(0, 'rgba(255,255,255,1)');
  mask.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  o.fillStyle = mask;
  o.fillRect(0, 0, 64, 64);
  o.globalCompositeOperation = 'source-in';
  o.drawImage(c, 0, 0);
  spriteCache.set(color, out);
  return out;
}

export class Effects implements Fx {
  particles: Particle[] = [];
  rings: Ring[] = [];
  lights: Light[] = [];
  popups: Popup[] = [];
  beams: Beam[] = [];
  arcs: Arc[] = [];
  fireballs: Fireball[] = [];
  ribbons = new Map<number, Ribbon>();
  oldRibbons: Ribbon[] = [];
  tracers: Ribbon[] = [];
  bolts: Bolt[] = [];
  trauma = 0;
  lightScale = 1;
  flash = 0;
  flashColor = '#ffffff';
  zoom = 0;
  hitStopT = 0;
  time = 0;
  game: Game | null = null;

  constructor(private audio: Audio) {}

  reset(game: Game) {
    this.game = game;
    this.particles = [];
    this.rings = [];
    this.lights = [];
    this.popups = [];
    this.beams = [];
    this.arcs = [];
    this.fireballs = [];
    this.ribbons.clear();
    this.oldRibbons = [];
    this.tracers = [];
    this.bolts = [];
    this.trauma = this.flash = this.zoom = this.hitStopT = 0;
  }

  /** Simulation speed multiplier (hit-stop slows time briefly on big hits). */
  get timeScale() {
    return this.hitStopT > 0 ? 0.18 : 1;
  }

  private add(p: Partial<Particle> & { k: K; x: number; y: number }) {
    if (this.particles.length > 2600) return;
    this.particles.push({
      vx: 0, vy: 0, life: 1, max: 1, s0: 4, s1: 4, color: '#fff', drag: 0, grav: 0, rot: R() * 6.28, vr: 0, a: 1, delay: 0,
      ...p,
    } as Particle);
  }

  private terrainColorAt(x: number, y: number): string {
    const t = this.game?.terrain;
    if (!t) return '#7a5a3a';
    for (let k = 0; k < 12; k++) {
      const xx = Math.floor(x + rr(-6, 6)),
        yy = Math.floor(y + rr(-6, 6));
      if (xx >= 0 && xx < t.w && yy >= 0 && yy < t.h && t.mask[yy * t.w + xx]) {
        const c = t.color[yy * t.w + xx];
        return `rgb(${c & 255},${(c >>> 8) & 255},${(c >>> 16) & 255})`;
      }
    }
    const e = this.game!.theme.dirt;
    return `rgb(${e[0]},${e[1]},${e[2]})`;
  }

  // ── Fx interface ──
  explosion(x: number, y: number, radius: number, style: ExplosionStyle, damage: number) {
    const P = PALETTE[style];
    const s = radius;
    const big = style === 'nuke';
    // sample terrain colour before the crater is visible
    const debrisCols = Array.from({ length: 4 }, () => this.terrainColorAt(x, y + s * 0.3));

    this.lights.push({ x, y, r: s * (big ? 7 : 3.4), color: P.mid, life: big ? 1.4 : 0.5, max: big ? 1.4 : 0.5, a: big ? 1 : 0.85 });
    this.lights.push({ x, y, r: s * 1.4, color: P.core, life: 0.18, max: 0.18, a: 1 });
    this.rings.push({ x, y, r0: s * 0.3, r1: s * (big ? 3.2 : 1.9), life: big ? 0.9 : 0.42, max: big ? 0.9 : 0.42, color: P.core, width: big ? 10 : 4 });
    if (s > 40) this.rings.push({ x, y, r0: s * 0.2, r1: s * 1.3, life: 0.6, max: 0.6, color: P.outer, width: 2 });

    // one solid fireball core that swells and fades, so the blast reads as a single mass
    if (style !== 'dirt') this.fireballs.push({ x, y, r: s * (big ? 1.1 : 0.95), life: big ? 0.7 : 0.32, max: big ? 0.7 : 0.32, core: P.core, mid: P.mid, outer: P.outer });
    // licks of flame around it
    const nFire = Math.round(8 + s * (style === 'fire' ? 0.6 : 0.4));
    if (style !== 'dirt')
      for (let i = 0; i < nFire; i++) {
        const a = R() * Math.PI * 2,
          d = Math.sqrt(R()) * s * 0.35,
          sp = rr(30, 110) * (s / 50);
        this.add({
          k: K.Fire, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
          life: rr(0.3, 0.7) * (big ? 2 : 1), max: 0, s0: s * rr(0.3, 0.55), s1: s * 0.1, color: i % 3 === 0 ? P.core : i % 3 === 1 ? P.mid : P.outer,
          drag: 2.5, grav: -50,
        });
      }
    // sparks
    const nSpark = Math.round(10 + s * 0.6);
    for (let i = 0; i < nSpark; i++) {
      const a = -Math.PI / 2 + rr(-1.6, 1.6) * (R() < 0.8 ? 1 : 2),
        sp = rr(150, 520) * Math.min(1.8, 0.6 + s / 80);
      this.add({ k: style === 'ice' ? K.Shard : K.Spark, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rr(0.35, 1.1), max: 0, s0: rr(1.2, 2.6), s1: 0.5, color: P.spark, drag: 1.4, grav: 520 });
    }
    // debris chunks thrown out of the crater
    const nDebris = Math.round(6 + s * 0.45);
    for (let i = 0; i < nDebris; i++) {
      const a = -Math.PI / 2 + rr(-1.3, 1.3),
        sp = rr(120, 420) * Math.min(1.6, 0.6 + s / 90);
      this.add({ k: K.Debris, x: x + rr(-s, s) * 0.3, y: y + rr(-s, s) * 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rr(1, 2.2), max: 0, s0: rr(1.5, 4.5), s1: 1, color: style === 'ice' ? '#e6fbff' : debrisCols[i % 4], drag: 0.4, grav: 700, vr: rr(-12, 12) });
    }
    // smoke that lingers after the fire
    const nSmoke = Math.round(8 + s * 0.3);
    const tints = [P.smoke, shade(P.smoke, 1.35), shade(P.smoke, 1.7)];
    for (let i = 0; i < nSmoke; i++) {
      const a = R() * Math.PI * 2,
        d = Math.sqrt(R()) * s * 0.8,
        out = rr(20, 70) * (s / 60);
      this.add({ k: K.Smoke, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7, vx: Math.cos(a) * out, vy: Math.sin(a) * out * 0.5 - rr(15, 50), life: rr(1.2, 2.8) * (big ? 1.8 : 1), max: 0, s0: s * rr(0.15, 0.3), s1: s * rr(0.55, 1.0), color: tints[i % 3], drag: 1.1, grav: -18, a: style === 'dirt' ? 0.5 : rr(0.25, 0.42), delay: rr(0.08, 0.3) });
    }
    if (style === 'plasma') for (let i = 0; i < 5; i++) this.arc(x, y, s * rr(0.8, 1.6), P.mid);
    if (style === 'ice') this.rings.push({ x, y, r0: 2, r1: s * 1.1, life: 0.7, max: 0.7, color: '#bff3ff', width: 2 });
    if (big) this.mushroom(x, y, s, P);

    this.addTrauma(big ? 1 : Math.min(0.75, 0.1 + s / 120));
    this.zoom = Math.max(this.zoom, big ? 0.06 : s > 60 ? 0.025 : 0.01);
    if (big) {
      this.flash = 1;
      this.flashColor = '#fff6e0';
    } else if (s >= 55) {
      this.flash = Math.max(this.flash, 0.25);
      this.flashColor = '#ffe6c0';
    }
    if (s < 25 && damage === 0) this.audio.small();
    else this.audio.explosion(s, style);
  }

  private mushroom(x: number, y: number, s: number, P: (typeof PALETTE)['nuke']) {
    for (let i = 0; i < 40; i++) {
      const h = rr(0, 1);
      this.add({ k: K.Smoke, x: x + rr(-s * 0.15, s * 0.15), y: y - 10, vx: rr(-10, 10), vy: -rr(120, 260) * (0.4 + h), life: rr(2.5, 4), max: 0, s0: s * 0.25, s1: s * rr(0.6, 1.1), color: P.smoke, drag: 1.2, grav: 0, a: 0.5, delay: rr(0.1, 0.5) });
      this.add({ k: K.Fire, x: x + rr(-s * 0.1, s * 0.1), y: y - 10, vx: rr(-15, 15), vy: -rr(140, 300) * (0.4 + h), life: rr(0.8, 1.6), max: 0, s0: s * 0.3, s1: s * 0.1, color: R() < 0.5 ? P.mid : P.outer, drag: 1.3, grav: 0, delay: rr(0, 0.3) });
    }
    for (let i = 0; i < 30; i++) {
      const a = R() * Math.PI * 2;
      this.add({ k: K.Smoke, x, y: y - s * 1.4, vx: Math.cos(a) * rr(60, 140), vy: Math.sin(a) * rr(20, 50) - 30, life: rr(2.5, 4), max: 0, s0: s * 0.3, s1: s * 0.9, color: P.smoke, drag: 1, grav: -5, a: 0.45, delay: rr(0.6, 1) });
    }
  }

  private arc(x: number, y: number, len: number, color: string) {
    const pts = [x, y];
    let a = R() * Math.PI * 2,
      cx = x,
      cy = y;
    const n = 7;
    for (let i = 0; i < n; i++) {
      a += rr(-0.9, 0.9);
      cx += (Math.cos(a) * len) / n;
      cy += (Math.sin(a) * len) / n;
      pts.push(cx, cy);
    }
    this.arcs.push({ pts, life: rr(0.12, 0.3), color });
  }

  muzzle(x: number, y: number, angleDeg: number, power: number, w: WeaponDef) {
    const a = (-angleDeg * Math.PI) / 180;
    const col = w.projectile?.glow ?? w.projectile?.color ?? w.beam?.color ?? '#ffd27a';
    this.lights.push({ x, y, r: 70, color: col, life: 0.15, max: 0.15, a: 0.9 });
    for (let i = 0; i < 10; i++) {
      const aa = a + rr(-0.35, 0.35),
        sp = rr(150, 420);
      this.add({ k: K.Spark, x, y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, life: rr(0.1, 0.25), max: 0, s0: 2, s1: 0.5, color: '#ffe2a0', drag: 4, grav: 0 });
    }
    for (let i = 0; i < 6; i++) {
      const aa = a + rr(-0.6, 0.6),
        sp = rr(30, 120);
      this.add({ k: K.Smoke, x, y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, life: rr(0.6, 1.2), max: 0, s0: 4, s1: rr(14, 22), color: '#8a8580', drag: 2.5, grav: -20, a: 0.35 });
    }
    this.addTrauma(0.08 + power / 1500);
    if (w.beam) this.audio.laser();
    else this.audio.fire(power);
  }

  bounce(x: number, y: number, color: string) {
    this.rings.push({ x, y, r0: 2, r1: 22, life: 0.25, max: 0.25, color, width: 2 });
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + rr(-1.2, 1.2);
      this.add({ k: K.Debris, x, y, vx: Math.cos(a) * rr(60, 180), vy: Math.sin(a) * rr(60, 180), life: rr(0.5, 1), max: 0, s0: rr(1, 2.5), s1: 1, color: this.terrainColorAt(x, y + 3), grav: 600, drag: 0.5, vr: rr(-10, 10) });
    }
    this.audio.bounce();
  }

  private digT = 0;
  dig(x: number, y: number) {
    for (let i = 0; i < 2; i++) {
      this.add({ k: K.Debris, x, y, vx: rr(-120, 120), vy: rr(-200, -40), life: rr(0.4, 0.9), max: 0, s0: rr(1, 3), s1: 1, color: this.terrainColorAt(x, y), grav: 600, drag: 0.5, vr: rr(-10, 10) });
    }
    this.add({ k: K.Smoke, x, y, vx: rr(-15, 15), vy: rr(-30, -5), life: rr(0.5, 1), max: 0, s0: 4, s1: 14, color: '#6e5a45', drag: 1, grav: -10, a: 0.25 });
    this.trauma = Math.min(0.35, this.trauma + 0.02);
    if (this.time - this.digT > 0.08) {
      this.digT = this.time;
      this.audio.dig();
    }
  }

  dirt(x: number, y: number, radius: number) {
    const col = this.game ? `rgb(${this.game.theme.dirt.join(',')})` : '#7a5a3a';
    for (let i = 0; i < 20 + radius * 0.4; i++) {
      const a = R() * Math.PI * 2;
      this.add({ k: K.Debris, x: x + Math.cos(a) * radius * R(), y: y + Math.sin(a) * radius * R(), vx: rr(-80, 80), vy: rr(-180, -20), life: rr(0.6, 1.3), max: 0, s0: rr(1.5, 4), s1: 1, color: col, grav: 600, drag: 0.5, vr: rr(-8, 8) });
    }
    for (let i = 0; i < 8; i++)
      this.add({ k: K.Smoke, x: x + rr(-radius, radius), y: y + rr(-radius, radius) * 0.5, vx: rr(-20, 20), vy: rr(-25, -5), life: rr(1, 2), max: 0, s0: radius * 0.3, s1: radius * 0.8, color: '#8a7058', drag: 1, grav: -5, a: 0.3 });
    this.addTrauma(0.2);
    this.audio.dirt();
  }

  beam(x0: number, y0: number, x1: number, y1: number, color: string, width: number) {
    this.beams.push({ x0, y0, x1, y1, color, width, life: 0.7, max: 0.7 });
    const len = Math.hypot(x1 - x0, y1 - y0);
    for (let d = 0; d < len; d += 14) {
      const f = d / len;
      const x = x0 + (x1 - x0) * f,
        y = y0 + (y1 - y0) * f;
      this.add({ k: K.Glow, x, y, vx: rr(-30, 30), vy: rr(-40, 10), life: rr(0.3, 0.8), max: 0, s0: rr(6, 14), s1: 0, color, drag: 1, grav: 0 });
      if (this.game?.terrain.solid(x, y + width + 2) && R() < 0.5)
        this.add({ k: K.Spark, x, y, vx: rr(-150, 150), vy: rr(-260, -60), life: rr(0.2, 0.6), max: 0, s0: 1.6, s1: 0.4, color: '#ffd0f8', drag: 1, grav: 600 });
    }
    this.addTrauma(0.35);
  }

  damage(x: number, y: number, amount: number, color: string) {
    if (amount < 1) return;
    this.popups.push({ x, y, text: `+${Math.round(amount)}`, color, life: 1.6, max: 1.6, big: amount >= 40 });
  }

  tankLand(x: number, y: number, speed: number) {
    const s = Math.min(1, speed / 500);
    for (let i = 0; i < 10; i++)
      this.add({ k: K.Smoke, x: x + rr(-18, 18), y: y - 2, vx: rr(-60, 60), vy: rr(-20, -5), life: rr(0.5, 1), max: 0, s0: 4, s1: 16, color: '#8a7a6a', drag: 2, grav: -10, a: 0.35 });
    this.addTrauma(0.1 + s * 0.25);
    this.audio.thud();
  }

  shake(amount: number) {
    this.addTrauma(amount);
  }

  /** Overlapping blasts raise shake toward the biggest one instead of stacking without limit. */
  private addTrauma(a: number) {
    this.trauma = Math.min(1, Math.max(this.trauma, a) + a * 0.15);
  }

  hitStop(seconds: number) {
    this.hitStopT = Math.max(this.hitStopT, seconds);
  }

  napalm(x: number, y: number) {
    this.lights.push({ x, y, r: 160, color: '#ff7a2e', life: 0.6, max: 0.6, a: 0.8 });
    this.audio.sizzle();
  }

  lightning(x: number, yTop: number, yGround: number, radius: number) {
    // Main jagged bolt plus a few forks, drawn as layered glow lines.
    const bolt = (x0: number, y0: number, x1: number, y1: number, jag: number, life: number) => {
      const pts = [x0, y0];
      const n = Math.max(4, Math.round(Math.abs(y1 - y0) / 26));
      for (let i = 1; i < n; i++) pts.push(x0 + (x1 - x0) * (i / n) + rr(-jag, jag), y0 + (y1 - y0) * (i / n));
      pts.push(x1, y1);
      this.bolts.push({ pts, life, max: life });
      return pts;
    };
    const main = bolt(x + rr(-60, 60), yTop, x, yGround, 22, 0.55);
    for (let f = 0; f < 3; f++) {
      const k = 2 * Math.floor(rr(2, main.length / 2 - 2));
      bolt(main[k], main[k + 1], main[k] + rr(-90, 90), main[k + 1] + rr(40, 120), 12, 0.3);
    }
    for (let i = 0; i < 4; i++) this.arc(x, yGround, radius * rr(0.5, 1), '#bfe0ff');
    this.lights.push({ x, y: yGround, r: radius * 3, color: '#9cc8ff', life: 0.5, max: 0.5, a: 1 });
    this.rings.push({ x, y: yGround, r0: 4, r1: radius, life: 0.4, max: 0.4, color: '#d6ecff', width: 2 });
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI * rr(0.1, 0.9);
      const sp = rr(120, 420);
      this.add({ k: K.Spark, x, y: yGround, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rr(0.3, 0.8), max: 0, s0: rr(1.2, 2.2), s1: 0.4, color: R() < 0.5 ? '#ffffff' : '#9fd0ff', drag: 1.4, grav: 520 });
    }
    this.flash = Math.max(this.flash, 0.55);
    this.flashColor = '#dceeff';
    this.addTrauma(0.45);
    this.audio.thunder();
  }

  quake(x: number, y: number, radius: number) {
    const t = this.game?.terrain;
    for (let i = 0; i < 70; i++) {
      const px = x + rr(-radius, radius);
      const py = t ? t.surfaceBelow(px, 0) : y;
      this.add({ k: K.Debris, x: px, y: py - 1, vx: rr(-40, 40), vy: rr(-260, -60), life: rr(0.6, 1.3), max: 0, s0: rr(1.5, 3.5), s1: 1, color: this.terrainColorAt(px, py + 4), grav: 700, drag: 0.4, vr: rr(-10, 10) });
      if (i % 3 === 0) this.add({ k: K.Smoke, x: px, y: py - 4, vx: rr(-25, 25), vy: rr(-30, -8), life: rr(1, 2.2), max: 0, s0: 8, s1: 30, color: '#8a7058', drag: 1, grav: -6, a: 0.28, delay: rr(0, 0.4) });
    }
    for (let i = 0; i < 3; i++) this.rings.push({ x, y, r0: 6, r1: radius * (0.6 + i * 0.25), life: 0.6 + i * 0.15, max: 0.6 + i * 0.15, color: '#d9b98a', width: 3 - i });
    this.addTrauma(0.9);
    this.audio.explosion(radius * 0.8, 'dirt');
    this.audio.thud();
  }

  // ── per-frame ──
  /** `dt` is visual time (slowed during hit-stop); `realDt` is wall-clock time. */
  update(dt: number, game: Game, realDt = dt) {
    this.time += dt;
    this.hitStopT = Math.max(0, this.hitStopT - realDt);
    this.lightScale = game.theme.bright ? 0.45 : 1;
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.zoom = Math.max(0, this.zoom - dt * 0.12);
    const terrain = game.terrain;

    // projectile trails and ribbons
    const alive = new Set<number>();
    for (const p of game.projectiles) {
      alive.add(p.id);
      const d = p.def;
      let rb = this.ribbons.get(p.id);
      if (!rb) {
        rb = { pts: [], color: d.glow ?? d.color, width: (d.radius ?? 3) * 0.9, life: 0, style: d.trail ?? 'smoke', tracer: d.tracer };
        if (d.tracer) this.tracers = [];
        this.ribbons.set(p.id, rb);
      }
      if (p.mode === 'fly') {
        rb.pts.push({ x: p.x, y: p.y });
        if (rb.pts.length > 26 && !rb.tracer) rb.pts.shift();
      }
      this.emitTrail(p.x, p.y, p.vx, p.vy, d.trail ?? 'smoke', d.color, p.mode);
    }
    for (const [id, rb] of this.ribbons)
      if (!alive.has(id)) {
        rb.life = rb.tracer ? 14 : 0.35;
        (rb.tracer ? this.tracers : this.oldRibbons).push(rb);
        this.ribbons.delete(id);
      }
    this.oldRibbons = this.oldRibbons.filter((r) => (r.life -= dt) > 0);
    this.tracers = this.tracers.filter((r) => (r.life -= dt) > 0);
    for (const b of this.bolts) b.life -= dt;
    this.bolts = this.bolts.filter((b) => b.life > 0);

    // napalm flames
    for (const f of game.flames) {
      const k = Math.min(1, f.life / Math.min(1, f.maxLife));
      if (R() < 0.9)
        this.add({ k: K.Fire, x: f.x + rr(-5, 5), y: f.y - 3, vx: rr(-15, 15), vy: rr(-90, -40), life: rr(0.25, 0.6), max: 0, s0: rr(10, 18) * (0.4 + 0.6 * k), s1: 2, color: R() < 0.3 ? '#fff0b0' : R() < 0.6 ? '#ff9a2e' : '#ff4a12', drag: 1, grav: -60 });
      if (R() < 0.12)
        this.add({ k: K.Smoke, x: f.x, y: f.y - 14, vx: rr(-10, 10) + game.wind * 3, vy: rr(-50, -25), life: rr(1, 2), max: 0, s0: 6, s1: 22, color: '#2a221e', drag: 0.6, grav: -10, a: 0.35 });
      if (R() < 0.06) this.add({ k: K.Spark, x: f.x, y: f.y - 6, vx: rr(-40, 40), vy: rr(-200, -80), life: rr(0.4, 0.9), max: 0, s0: 1.4, s1: 0.3, color: '#ffc070', drag: 0.8, grav: 120 });
    }

    // particles
    const ps = this.particles;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.delay > 0) {
        p.delay -= dt;
        ps[w++] = p;
        continue;
      }
      if (p.max === 0) p.max = p.life;
      p.life -= dt;
      if (p.life <= 0) continue;
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vx = p.vx * dr + (p.k === K.Smoke ? game.wind * 4 * dt : 0);
      p.vy = p.vy * dr + p.grav * dt;
      const nx = p.x + p.vx * dt,
        ny = p.y + p.vy * dt;
      if ((p.k === K.Debris || p.k === K.Shard) && terrain.solid(nx, ny)) {
        p.vy *= -0.3;
        p.vx *= 0.55;
        p.vr *= 0.5;
        if (Math.abs(p.vy) < 30) {
          p.vy = 0;
          p.vx *= 0.8;
        }
      } else {
        p.x = nx;
        p.y = ny;
      }
      p.rot += p.vr * dt;
      ps[w++] = p;
    }
    ps.length = w;

    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const l of this.lights) l.life -= dt;
    this.lights = this.lights.filter((l) => l.life > 0);
    for (const p of this.popups) {
      p.life -= dt;
      p.y -= dt * 40 * (p.life / p.max);
    }
    this.popups = this.popups.filter((p) => p.life > 0);
    for (const b of this.beams) b.life -= dt;
    this.beams = this.beams.filter((b) => b.life > 0);
    for (const f of this.fireballs) f.life -= dt;
    this.fireballs = this.fireballs.filter((f) => f.life > 0);
    for (const a of this.arcs) a.life -= dt;
    this.arcs = this.arcs.filter((a) => a.life > 0);
  }

  private emitTrail(x: number, y: number, vx: number, vy: number, style: TrailStyle, color: string, mode: string) {
    if (mode === 'burrow') return;
    if (mode === 'roll') {
      if (R() < 0.5) this.add({ k: K.Spark, x, y: y - 1, vx: -vx * 0.3 + rr(-40, 40), vy: rr(-120, -30), life: rr(0.15, 0.35), max: 0, s0: 1.4, s1: 0.3, color: '#ffe0a0', drag: 2, grav: 400 });
      if (R() < 0.3) this.add({ k: K.Smoke, x, y: y - 2, vx: rr(-10, 10), vy: rr(-20, -5), life: rr(0.4, 0.8), max: 0, s0: 3, s1: 10, color: '#8a7a6a', drag: 1, grav: -10, a: 0.25 });
      return;
    }
    switch (style) {
      case 'smoke':
        this.add({ k: K.Smoke, x, y, vx: rr(-8, 8) - vx * 0.03, vy: rr(-8, 8) - vy * 0.03, life: rr(0.5, 1.1), max: 0, s0: 2, s1: rr(8, 13), color: '#9a948e', drag: 1.2, grav: -10, a: 0.28 });
        break;
      case 'fire':
        this.add({ k: K.Fire, x, y, vx: -vx * 0.1 + rr(-20, 20), vy: -vy * 0.1 + rr(-20, 20), life: rr(0.15, 0.35), max: 0, s0: rr(7, 12), s1: 1, color: R() < 0.5 ? '#ffb347' : '#ff5a1f', drag: 2, grav: -40 });
        if (R() < 0.5) this.add({ k: K.Smoke, x, y, vx: rr(-8, 8), vy: rr(-8, 8), life: rr(0.6, 1.2), max: 0, s0: 3, s1: 14, color: '#3a302c', drag: 1, grav: -15, a: 0.3, delay: 0.1 });
        break;
      case 'spark':
        this.add({ k: K.Spark, x, y, vx: -vx * 0.15 + rr(-50, 50), vy: -vy * 0.15 + rr(-50, 50), life: rr(0.15, 0.35), max: 0, s0: 1.4, s1: 0.3, color: '#fff1c0', drag: 2, grav: 200 });
        break;
      case 'plasma':
        this.add({ k: K.Glow, x, y, vx: rr(-15, 15), vy: rr(-15, 15), life: rr(0.2, 0.45), max: 0, s0: rr(6, 11), s1: 0, color, drag: 1, grav: 0 });
        if (R() < 0.15) this.arc(x, y, 18, color);
        break;
      case 'ice':
        this.add({ k: K.Glow, x, y, vx: rr(-10, 10), vy: rr(-10, 10), life: rr(0.3, 0.6), max: 0, s0: rr(3, 6), s1: 0, color: '#d8f8ff', drag: 1, grav: 30 });
        if (R() < 0.4) this.add({ k: K.Shard, x, y, vx: rr(-40, 40), vy: rr(-40, 20), life: rr(0.3, 0.6), max: 0, s0: 1.4, s1: 0.4, color: '#ffffff', drag: 1, grav: 200 });
        break;
      case 'dirt':
        if (R() < 0.6) this.add({ k: K.Debris, x, y, vx: rr(-30, 30), vy: rr(-30, 10), life: rr(0.3, 0.7), max: 0, s0: rr(1, 2.2), s1: 1, color: '#7a5a3a', drag: 1, grav: 400, vr: 6 });
        break;
      case 'none':
        break;
    }
  }

  // ── drawing (world space) ──
  drawBack(ctx: CanvasRenderingContext2D) {
    // smoke and debris under the additive layer
    for (const p of this.particles) {
      if (p.delay > 0) continue;
      const t = 1 - p.life / p.max;
      if (p.k === K.Smoke) {
        const s = p.s0 + (p.s1 - p.s0) * Math.sqrt(t);
        ctx.globalAlpha = p.a * (1 - t) * Math.min(1, t * 8 + 0.2);
        ctx.drawImage(soft(p.color), p.x - s, p.y - s, s * 2, s * 2);
      } else if (p.k === K.Debris) {
        ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.s0 / 2, -p.s0 / 2, p.s0, p.s0 * 0.8);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawRibbons(ctx: CanvasRenderingContext2D) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const draw = (rb: Ribbon, fade: number) => {
      const n = rb.pts.length;
      if (n < 2) return;
      for (let i = 1; i < n; i++) {
        const f = i / n;
        ctx.globalAlpha = f * 0.6 * fade;
        ctx.strokeStyle = rb.color;
        ctx.lineWidth = rb.width * (0.3 + f * 1.2);
        ctx.beginPath();
        ctx.moveTo(rb.pts[i - 1].x, rb.pts[i - 1].y);
        ctx.lineTo(rb.pts[i].x, rb.pts[i].y);
        ctx.stroke();
      }
    };
    // Tracer paths stay up as a dotted sight line.
    const dotted = (rb: Ribbon, fade: number) => {
      ctx.globalAlpha = 0.75 * fade;
      ctx.strokeStyle = rb.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 7]);
      ctx.beginPath();
      rb.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.setLineDash([]);
    };
    for (const rb of this.tracers) dotted(rb, Math.min(1, rb.life / 2));
    for (const rb of this.ribbons.values()) (rb.tracer ? dotted(rb, 1) : null, draw(rb, 1));
    for (const rb of this.oldRibbons) draw(rb, rb.life / 0.35);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawFront(ctx: CanvasRenderingContext2D) {
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lights) {
      const t = l.life / l.max;
      ctx.globalAlpha = l.a * t * t * 0.6 * this.lightScale;
      ctx.drawImage(soft(l.color), l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    for (const f of this.fireballs) {
      const t = 1 - f.life / f.max;
      const grow = 1 - (1 - t) * (1 - t);
      const r = f.r * (0.45 + 0.75 * grow);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, f.core);
      g.addColorStop(0.35 + 0.3 * t, f.mid);
      g.addColorStop(0.8, f.outer);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = (1 - t) * (1 - t) * this.lightScale + (1 - t) * 0.25;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of this.particles) {
      if (p.delay > 0) continue;
      const t = 1 - p.life / p.max;
      if (p.k === K.Fire || p.k === K.Glow) {
        const s = p.s0 + (p.s1 - p.s0) * t;
        if (s <= 0.2) continue;
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.drawImage(soft(p.color), p.x - s, p.y - s, s * 2, s * 2);
      } else if (p.k === K.Spark || p.k === K.Shard) {
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.s0 + (p.s1 - p.s0) * t;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
        ctx.stroke();
      }
    }
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      const e = 1 - (1 - t) * (1 - t) * (1 - t);
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const b of this.bolts) {
      const t = b.life / b.max;
      const flick = 0.65 + 0.35 * Math.sin(this.time * 90 + b.pts[0]);
      ctx.lineJoin = 'round';
      // Glow adds light on dark skies; the solid core keeps the bolt crisp on bright ones.
      for (const [w, col, a, op] of [[16, '#7fb8ff', 0.22, 'lighter'], [7, '#9cc8ff', 0.5, 'lighter'], [5, '#3a6bff', 0.55, 'source-over'], [2.4, '#ffffff', 1, 'source-over']] as const) {
        ctx.globalCompositeOperation = op;
        ctx.globalAlpha = a * t * flick;
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(b.pts[0], b.pts[1]);
        for (let i = 2; i < b.pts.length; i += 2) ctx.lineTo(b.pts[i], b.pts[i + 1]);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
    }
    for (const a of this.arcs) {
      ctx.globalAlpha = Math.min(1, a.life * 6);
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.pts[0], a.pts[1]);
      for (let i = 2; i < a.pts.length; i += 2) ctx.lineTo(a.pts[i] + rr(-2, 2), a.pts[i + 1] + rr(-2, 2));
      ctx.stroke();
    }
    for (const b of this.beams) {
      const t = b.life / b.max;
      const wob = 1 + Math.sin(this.time * 60) * 0.15;
      ctx.lineCap = 'round';
      const pass = (w: number, col: string, a: number) => {
        ctx.globalAlpha = a * t;
        ctx.strokeStyle = col;
        ctx.lineWidth = w * wob;
        ctx.beginPath();
        ctx.moveTo(b.x0, b.y0);
        ctx.lineTo(b.x1, b.y1);
        ctx.stroke();
      };
      pass(b.width * 6, b.color, 0.18);
      pass(b.width * 2.6, b.color, 0.5);
      pass(b.width * 0.9, '#ffffff', 1);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    for (const p of this.popups) {
      const t = 1 - p.life / p.max;
      const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.7 : t < 0.22 ? 1.3 - ((t - 0.12) / 0.1) * 0.3 : 1;
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(pop, pop);
      ctx.font = `800 ${p.big ? 34 : 24}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** Camera offset/rotation from trauma (squared for a nice falloff), using smooth noise. */
  cameraShake() {
    const s = this.trauma * this.trauma;
    const t = this.time * 38;
    const n = (k: number) => Math.sin(t * 1.0 + k) * 0.6 + Math.sin(t * 2.3 + k * 2.1) * 0.4;
    return { x: n(1) * 26 * s, y: n(5) * 22 * s, rot: n(9) * 0.018 * s, zoom: 1 + this.zoom };
  }

  drawFlash(ctx: CanvasRenderingContext2D) {
    if (this.flash <= 0) return;
    ctx.globalAlpha = this.flash * this.flash * 0.85;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(-100, -100, WORLD_W + 200, WORLD_H + 200);
    ctx.globalAlpha = 1;
  }
}
