import { BARREL_LEN, PIVOT_HEIGHT, TANK_SCALE, WORLD_H, WORLD_W } from '../config';
import { DEG } from '../core/rng';
import type { Game, Tank } from '../game/game';
import type { Effects } from './effects';

/** Draws the world: sky, terrain, tanks, projectiles and the effects layers. */
export class Renderer {
  private bg: HTMLCanvasElement;
  private terrainCanvas: HTMLCanvasElement;
  private terrainCtx: CanvasRenderingContext2D;
  private img: ImageData;
  private img32: Uint32Array;
  private edge = 0;
  scale = 1;
  ox = 0;
  oy = 0;
  private dpr = 1;
  /** When set, the pointer position in world coords (for the aim guide). */
  aimPointer: { x: number; y: number } | null = null;

  constructor(private canvas: HTMLCanvasElement, private game: Game, private fx: Effects) {
    this.bg = document.createElement('canvas');
    this.terrainCanvas = document.createElement('canvas');
    this.terrainCanvas.width = WORLD_W;
    this.terrainCanvas.height = WORLD_H;
    this.terrainCtx = this.terrainCanvas.getContext('2d')!;
    this.img = this.terrainCtx.createImageData(WORLD_W, WORLD_H);
    this.img32 = new Uint32Array(this.img.data.buffer);
    const e = game.theme.edge;
    this.edge = e[0] | (e[1] << 8) | (e[2] << 16);
    this.buildBackground();
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.scale = Math.min(r.width / WORLD_W, r.height / WORLD_H);
    this.ox = (r.width - WORLD_W * this.scale) / 2;
    this.oy = (r.height - WORLD_H * this.scale) / 2;
    // tall screens: sit the battlefield just above the controls, leaving the sky on top for the HUD
    if (r.height > r.width) this.oy = Math.max(this.oy, r.height - WORLD_H * this.scale - 34);
  }

  /** Screen (CSS px relative to canvas) to world coordinates. */
  toWorld(sx: number, sy: number) {
    return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale };
  }

  /** Clean vertical gradient sky (plus stars on night themes). */
  private buildBackground() {
    const th = this.game.theme;
    const c = this.bg;
    c.width = WORLD_W;
    c.height = WORLD_H;
    const g = c.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, WORLD_H);
    th.sky.forEach((col, i) => grd.addColorStop((i / (th.sky.length - 1)) * 0.92, col));
    g.fillStyle = grd;
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    if (th.stars) {
      for (let i = 0; i < 220; i++) {
        const x = Math.random() * WORLD_W,
          y = Math.random() * WORLD_H * 0.65;
        g.globalAlpha = Math.random() * 0.7 + 0.2;
        g.fillStyle = '#fff';
        const s = Math.random() < 0.08 ? 2 : 1;
        g.fillRect(x, y, s, s);
      }
      g.globalAlpha = 1;
    }
  }

  /** Copy changed terrain pixels into the terrain bitmap, with lit edges and shaded overhangs. */
  private syncTerrain() {
    const t = this.game.terrain;
    const d = t.dirty;
    if (!d) return;
    t.dirty = null;
    const { w, mask, color } = t;
    const out = this.img32;
    const edge = this.edge;
    const blend = (c: number, e: number, k: number) => {
      const r = (c & 255) * (1 - k) + (e & 255) * k;
      const g = ((c >>> 8) & 255) * (1 - k) + ((e >>> 8) & 255) * k;
      const b = ((c >>> 16) & 255) * (1 - k) + ((e >>> 16) & 255) * k;
      return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    };
    const y0 = Math.max(0, d.y0 - 2);
    const y1 = Math.min(t.h - 1, d.y1 + 6);
    for (let y = y0; y <= y1; y++) {
      for (let x = d.x0; x <= d.x1; x++) {
        const i = y * w + x;
        if (!mask[i]) {
          out[i] = 0;
          continue;
        }
        let c = color[i];
        // distance to open air above (0..4) gives a lit rim; air below gives a dark underside
        let up = 0;
        while (up < 2 && y - up - 1 >= 0 && mask[i - (up + 1) * w]) up++;
        if (up < 2) c = blend(c, edge, up === 0 ? 0.75 : 0.35);
        else if (y + 1 < t.h && !mask[i + w]) c = blend(c, 0, 0.35);
        out[i] = c;
      }
    }
    this.terrainCtx.putImageData(this.img, 0, 0, d.x0, y0, d.x1 - d.x0 + 1, y1 - y0 + 1);
  }

  draw(dt: number) {
    const ctx = this.canvas.getContext('2d')!;
    const g = this.game;
    this.syncTerrain();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = g.theme.sky[0];
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const cam = this.fx.cameraShake();
    const s = this.scale * this.dpr;
    ctx.setTransform(s, 0, 0, s, this.ox * this.dpr, this.oy * this.dpr);
    ctx.translate(WORLD_W / 2 + cam.x, WORLD_H / 2 + cam.y);
    ctx.rotate(cam.rot);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-WORLD_W / 2, -WORLD_H / 2);

    ctx.drawImage(this.bg, -400, -60, WORLD_W + 800, WORLD_H + 120);
    ctx.drawImage(this.terrainCanvas, 0, 0);
    this.drawFlameGlow(ctx);
    this.fx.drawBack(ctx);
    g.tanks.forEach((t, i) => this.drawTank(ctx, t, i));
    if ((g.phase === 'aim' || g.phase === 'moving') && !g.player.cpuLevel) this.drawAimGuide(ctx);
    this.fx.drawRibbons(ctx);
    this.drawProjectiles(ctx);
    this.fx.drawFront(ctx);
    this.drawOffscreen(ctx);
    this.fx.drawFlash(ctx);
    // soft vignette in screen space
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.vignette || this.vignette.width !== this.canvas.width || this.vignette.height !== this.canvas.height) this.buildVignette();
    ctx.drawImage(this.vignette!, 0, 0);
  }

  private vignette: HTMLCanvasElement | null = null;
  private buildVignette() {
    const v = (this.vignette = document.createElement('canvas'));
    v.width = this.canvas.width;
    v.height = this.canvas.height;
    const g = v.getContext('2d')!;
    const cx = v.width / 2,
      cy = v.height / 2;
    const grd = g.createRadialGradient(cx, cy, Math.min(cx, cy) * 0.6, cx, cy, Math.hypot(cx, cy));
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = grd;
    g.fillRect(0, 0, v.width, v.height);
  }

  private drawFlameGlow(ctx: CanvasRenderingContext2D) {
    if (!this.game.flames.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.game.flames) {
      const k = Math.min(1, f.life);
      const r = 34 * k;
      const grd = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      grd.addColorStop(0, 'rgba(255,140,40,0.35)');
      grd.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(f.x - r, f.y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawTank(ctx: CanvasRenderingContext2D, t: Tank, i: number) {
    const g = this.game;
    const p = g.players[i];
    const active = g.current === i && (g.phase === 'aim' || g.phase === 'moving');
    const time = this.fx.time;
    ctx.save();
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(t.x, t.y + 1, 20 * TANK_SCALE, 4 * TANK_SCALE, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(t.x, t.y);
    ctx.rotate(t.tilt);
    ctx.scale(TANK_SCALE, TANK_SCALE);
    const recoil = t.recoil * t.recoil * 5;

    // barrel (drawn first so the turret covers its base)
    const pivotY = -PIVOT_HEIGHT / TANK_SCALE;
    const a = -p.angle * DEG - t.tilt;
    ctx.save();
    ctx.translate(0, pivotY);
    ctx.rotate(a);
    const bl = BARREL_LEN / TANK_SCALE - recoil;
    const bgrd = ctx.createLinearGradient(0, -3, 0, 3);
    bgrd.addColorStop(0, '#e9eef2');
    bgrd.addColorStop(0.5, '#8a96a0');
    bgrd.addColorStop(1, '#3c444b');
    ctx.fillStyle = bgrd;
    ctx.fillRect(2, -2.6, bl, 5.2);
    ctx.fillStyle = '#2a3036';
    ctx.fillRect(bl - 1, -3.4, 4, 6.8);
    ctx.restore();

    // treads
    const tg = ctx.createLinearGradient(0, -8, 0, 0);
    tg.addColorStop(0, '#3a3f45');
    tg.addColorStop(1, '#15181b');
    ctx.fillStyle = tg;
    roundRect(ctx, -19, -8, 38, 9, 4.5);
    ctx.fill();
    ctx.fillStyle = '#5b636b';
    const roll = (t.x * 0.4) % 7;
    for (let k = -14; k <= 14; k += 7) {
      ctx.beginPath();
      ctx.arc(k + (roll - 3.5) * 0.15, -3.5, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // hull
    const hg = ctx.createLinearGradient(0, -16, 0, -6);
    hg.addColorStop(0, lighten(p.color, 0.35));
    hg.addColorStop(1, darken(p.color, 0.35));
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(-17, -7);
    ctx.lineTo(-13, -15);
    ctx.lineTo(13, -15);
    ctx.lineTo(18, -7);
    ctx.closePath();
    ctx.fill();
    // turret dome
    const dg = ctx.createRadialGradient(-3, pivotY - 4, 1, 0, pivotY, 10);
    dg.addColorStop(0, lighten(p.color, 0.6));
    dg.addColorStop(1, darken(p.color, 0.2));
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.arc(0, pivotY + 1, 8.5, Math.PI, 0);
    ctx.fill();
    // highlight line
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-12, -14.5);
    ctx.lineTo(12, -14.5);
    ctx.stroke();

    if (t.hitFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = t.hitFlash;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -10, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // name tag + turn marker
    ctx.save();
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const ny = t.y - 58 - (active ? 6 + Math.sin(time * 5) * 3 : 0);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(p.name, t.x, ny);
    ctx.fillStyle = active ? '#fff' : 'rgba(255,255,255,0.75)';
    ctx.fillText(p.name, t.x, ny);
    if (active) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(t.x - 7, ny + 6);
      ctx.lineTo(t.x + 7, ny + 6);
      ctx.lineTo(t.x, ny + 13);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawAimGuide(ctx: CanvasRenderingContext2D) {
    const g = this.game;
    const p = g.player;
    const pv = g.pivot(g.current);
    const len = 52 + p.power * 1.3;
    const a = p.angle * DEG;
    ctx.save();
    ctx.setLineDash([2, 7]);
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(pv.x + Math.cos(a) * 42, pv.y - Math.sin(a) * 42);
    ctx.lineTo(pv.x + Math.cos(a) * len, pv.y - Math.sin(a) * len);
    ctx.stroke();
    ctx.setLineDash([]);
    // power arc
    ctx.strokeStyle = p.color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pv.x, pv.y, 46, -a - 0.2, -a + 0.2);
    ctx.stroke();
    ctx.restore();
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D) {
    for (const p of this.game.projectiles) {
      if (p.mode === 'burrow') continue;
      const d = p.def;
      const r = d.radius ?? 3.5;
      const y = p.mode === 'roll' ? p.y - r : p.y;
      ctx.globalCompositeOperation = 'lighter';
      const glow = d.glow ?? d.color;
      const grd = ctx.createRadialGradient(p.x, y, 0, p.x, y, r * 4);
      grd.addColorStop(0, glow);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = grd;
      ctx.fillRect(p.x - r * 4, y - r * 4, r * 8, r * 8);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(p.x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(p.x - r * 0.3, y - r * 0.3, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Markers for shells above the top of the screen: drawn below the HUD, shrinking as the shell climbs. */
  private drawOffscreen(ctx: CanvasRenderingContext2D) {
    for (const p of this.game.projectiles) {
      if (p.y >= -4) continue;
      const h = Math.round(-p.y);
      const k = Math.max(0.55, 1 - h / 1600);
      ctx.save();
      ctx.translate(Math.max(20, Math.min(WORLD_W - 20, p.x)), 140);
      ctx.scale(k * 1.6, k * 1.6);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.markerGlow(p.def.glow ?? p.def.color), -16, -12, 32, 32);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.def.glow ?? p.def.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(-9, 9);
      ctx.lineTo(9, 9);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeText(`${h}`, 0, 24);
      ctx.fillStyle = '#fff';
      ctx.fillText(`${h}`, 0, 24);
      ctx.restore();
    }
  }

  private glowCache = new Map<string, HTMLCanvasElement>();
  private markerGlow(color: string) {
    let c = this.glowCache.get(color);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 32;
      const g = c.getContext('2d')!;
      const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grd.addColorStop(0, color);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 32, 32);
      this.glowCache.set(color, c);
    }
    return c;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexRgb(h: string) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function lighten(h: string, k: number) {
  const [r, g, b] = hexRgb(h);
  return `rgb(${r + (255 - r) * k | 0},${g + (255 - g) * k | 0},${b + (255 - b) * k | 0})`;
}
function darken(h: string, k: number) {
  const [r, g, b] = hexRgb(h);
  return `rgb(${(r * (1 - k)) | 0},${(g * (1 - k)) | 0},${(b * (1 - k)) | 0})`;
}
