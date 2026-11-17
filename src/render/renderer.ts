import { BARREL_LEN, PIVOT_HEIGHT, WORLD_H, WORLD_W } from '../config';
import { DEG } from '../core/rng';
import type { Game, Tank } from '../game/game';
import type { Effects } from './effects';

/** Draws the world: sky, parallax hills, clouds, terrain, tanks, projectiles and the effects layers. */
export class Renderer {
  private bg: HTMLCanvasElement;
  private terrainCanvas: HTMLCanvasElement;
  private terrainCtx: CanvasRenderingContext2D;
  private img: ImageData;
  private img32: Uint32Array;
  private clouds: { x: number; y: number; s: number; v: number }[] = [];
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
    for (let i = 0; i < 7; i++) this.clouds.push({ x: Math.random() * WORLD_W, y: 40 + Math.random() * 260, s: 0.6 + Math.random() * 1.2, v: 0.6 + Math.random() * 0.8 });
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
  }

  /** Screen (CSS px relative to canvas) to world coordinates. */
  toWorld(sx: number, sy: number) {
    return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale };
  }

  private buildBackground() {
    const th = this.game.theme;
    const c = this.bg;
    c.width = WORLD_W;
    c.height = WORLD_H;
    const g = c.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, WORLD_H);
    th.sky.forEach((col, i) => grd.addColorStop(i / (th.sky.length - 1), col));
    g.fillStyle = grd;
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    if (th.stars) {
      for (let i = 0; i < 260; i++) {
        const x = Math.random() * WORLD_W,
          y = Math.random() * WORLD_H * 0.7;
        g.globalAlpha = Math.random() * 0.8 + 0.2;
        g.fillStyle = '#fff';
        g.fillRect(x, y, Math.random() < 0.1 ? 2 : 1, Math.random() < 0.1 ? 2 : 1);
      }
      g.globalAlpha = 1;
    }
    if (th.sun) {
      const sx = th.sun.x * WORLD_W,
        sy = th.sun.y * WORLD_H;
      const halo = g.createRadialGradient(sx, sy, 0, sx, sy, th.sun.r * 6);
      halo.addColorStop(0, th.sun.color);
      halo.addColorStop(0.15, th.sun.color + '88');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.55;
      g.fillStyle = halo;
      g.fillRect(0, 0, WORLD_W, WORLD_H);
      g.globalAlpha = 1;
      g.fillStyle = th.sun.color;
      g.beginPath();
      g.arc(sx, sy, th.sun.r, 0, Math.PI * 2);
      g.fill();
    }
    // parallax-style mountain silhouettes with atmospheric fog between layers
    th.mountains.forEach((col, layer) => {
      const base = WORLD_H * (0.42 + layer * 0.09);
      const amp = 120 - layer * 25;
      const ph = Math.random() * 1000;
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, WORLD_H);
      for (let x = 0; x <= WORLD_W; x += 6) {
        const y =
          base -
          amp * (0.5 + 0.5 * Math.sin((x + ph) * 0.004 * (1 + layer * 0.4))) * (0.6 + 0.4 * Math.sin((x + ph * 2) * 0.0113)) -
          Math.abs(Math.sin((x + ph) * 0.021)) * 18;
        g.lineTo(x, y);
      }
      g.lineTo(WORLD_W, WORLD_H);
      g.fill();
      g.fillStyle = th.fog;
      g.fillRect(0, 0, WORLD_W, WORLD_H);
    });
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
        while (up < 5 && y - up - 1 >= 0 && mask[i - (up + 1) * w]) up++;
        if (up < 5) c = blend(c, edge, up === 0 ? 0.85 : up === 1 ? 0.55 : up === 2 ? 0.3 : 0.12);
        else if (y + 1 < t.h && !mask[i + w]) c = blend(c, 0, 0.45);
        else if (y + 2 < t.h && !mask[i + 2 * w]) c = blend(c, 0, 0.25);
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
    this.drawClouds(ctx, dt);
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

  private drawClouds(ctx: CanvasRenderingContext2D, dt: number) {
    const col = this.game.theme.cloud;
    ctx.fillStyle = col;
    for (const c of this.clouds) {
      c.x += this.game.wind * 4 * c.v * dt + 3 * dt;
      if (c.x > WORLD_W + 200) c.x = -200;
      if (c.x < -200) c.x = WORLD_W + 200;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const r = (26 + ((k * 17) % 13)) * c.s;
        ctx.moveTo(c.x + (k - 2) * 28 * c.s + r, c.y + Math.sin(k * 1.7) * 8 * c.s);
        ctx.arc(c.x + (k - 2) * 28 * c.s, c.y + Math.sin(k * 1.7) * 8 * c.s, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
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
    ctx.ellipse(t.x, t.y + 1, 20, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(t.x, t.y);
    ctx.rotate(t.tilt);
    const recoil = t.recoil * t.recoil * 5;

    // barrel (drawn first so the turret covers its base)
    const pivotY = -PIVOT_HEIGHT;
    const a = -p.angle * DEG - t.tilt;
    ctx.save();
    ctx.translate(0, pivotY);
    ctx.rotate(a);
    const bl = BARREL_LEN - recoil;
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
    const ny = t.y - 44 - (active ? 6 + Math.sin(time * 5) * 3 : 0);
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
    const len = 40 + p.power * 1.3;
    const a = p.angle * DEG;
    ctx.save();
    ctx.setLineDash([2, 7]);
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(pv.x + Math.cos(a) * 30, pv.y - Math.sin(a) * 30);
    ctx.lineTo(pv.x + Math.cos(a) * len, pv.y - Math.sin(a) * len);
    ctx.stroke();
    ctx.setLineDash([]);
    // power arc
    ctx.strokeStyle = p.color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pv.x, pv.y, 34, -a - 0.25, -a + 0.25);
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

  /** Arrow markers for shells that are above the top of the screen. */
  private drawOffscreen(ctx: CanvasRenderingContext2D) {
    for (const p of this.game.projectiles) {
      if (p.y >= -4) continue;
      const h = Math.round(-p.y);
      ctx.save();
      ctx.translate(Math.max(14, Math.min(WORLD_W - 14, p.x)), 10);
      ctx.fillStyle = p.def.glow ?? p.def.color;
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(-8, 10);
      ctx.lineTo(8, 10);
      ctx.closePath();
      ctx.fill();
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(`${h}`, 0, 26);
      ctx.restore();
    }
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
