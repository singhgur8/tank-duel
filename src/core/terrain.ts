import { BEDROCK } from '../config';
import { Rng, clamp } from './rng';
import type { RGB, Theme } from './themes';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const pack = (r: number, g: number, b: number) =>
  ((255 << 24) | (clamp(b | 0, 0, 255) << 16) | (clamp(g | 0, 0, 255) << 8) | clamp(r | 0, 0, 255)) >>> 0;

/** Cheap deterministic per-pixel hash in [0,1). */
const hash2 = (x: number, y: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * Pixel-mask terrain. `mask` is 1 for solid ground, `color` stores each pixel's colour so dirt keeps its
 * look while it falls. Everything that changes the mask marks a dirty rect for the renderer and wakes the
 * columns that might now have floating dirt, which then settle a few pixels per step.
 */
export class Terrain {
  readonly w: number;
  readonly h: number;
  readonly mask: Uint8Array;
  readonly color: Uint32Array;
  dirty: Rect | null = null;
  private active = new Set<number>();
  private colSpeed: Float32Array;
  private dirtColor: RGB = [120, 90, 60];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.mask = new Uint8Array(w * h);
    this.color = new Uint32Array(w * h);
    this.colSpeed = new Float32Array(w);
  }

  static generate(w: number, h: number, rng: Rng, theme: Theme, flatSpots: number[] = []): Terrain {
    const t = new Terrain(w, h);
    t.dirtColor = theme.dirt;
    // Layered smooth value noise for the skyline.
    const octave = (spacing: number, amp: number) => {
      const n = Math.ceil(w / spacing) + 2;
      const pts = Array.from({ length: n }, () => rng.range(-1, 1));
      return (x: number) => {
        const f = x / spacing;
        const i = Math.floor(f);
        const u = f - i;
        const s = (1 - Math.cos(u * Math.PI)) / 2;
        return (pts[i] * (1 - s) + pts[i + 1] * s) * amp;
      };
    };
    const style = rng.int(0, 2);
    const o1 = octave(rng.range(260, 420), h * (style === 0 ? 0.16 : style === 1 ? 0.22 : 0.12));
    const o2 = octave(rng.range(90, 150), h * 0.06);
    const o3 = octave(28, h * 0.012);
    const base = h * rng.range(0.56, 0.66);
    const heights = new Float32Array(w);
    for (let x = 0; x < w; x++) heights[x] = clamp(base + o1(x) + o2(x) + o3(x), h * 0.28, h * 0.86);
    // Soften the ground where tanks start so they sit nicely.
    for (const fx of flatSpots) {
      const cx = Math.round(fx);
      const target = heights[clamp(cx, 0, w - 1)];
      for (let x = cx - 40; x <= cx + 40; x++) {
        if (x < 0 || x >= w) continue;
        const k = 1 - Math.abs(x - cx) / 40;
        const s = k * k * (3 - 2 * k);
        heights[x] = heights[x] * (1 - s) + target * s;
      }
    }
    const strata = octave(60, 14);
    // Depth shading is measured from a smoothed skyline so cliffs don't leave vertical seams.
    const smooth = new Float32Array(w);
    const R = 70;
    for (let x = 0; x < w; x++) {
      let s = 0,
        n = 0;
      for (let k = Math.max(0, x - R); k <= Math.min(w - 1, x + R); k += 5) {
        s += heights[k];
        n++;
      }
      smooth[x] = Math.min(heights[x] + 40, s / n);
    }
    for (let x = 0; x < w; x++) {
      const top = Math.round(heights[x]);
      const ref = smooth[x];
      const sx = strata(x);
      for (let y = top; y < h; y++) {
        const i = y * w + x;
        t.mask[i] = 1;
        const d = y - Math.min(top, ref);
        const k = clamp(d / 300, 0, 1);
        const kk = k * k * (3 - 2 * k);
        const band = 1 + 0.07 * Math.sin((y + sx) * 0.11) + 0.04 * Math.sin((y - sx) * 0.031);
        const grain = 1 + (hash2(x, y) - 0.5) * 0.12;
        const m = band * grain;
        t.color[i] = pack(
          (theme.top[0] * (1 - kk) + theme.deep[0] * kk) * m,
          (theme.top[1] * (1 - kk) + theme.deep[1] * kk) * m,
          (theme.top[2] * (1 - kk) + theme.deep[2] * kk) * m,
        );
      }
    }
    t.dirty = { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
    return t;
  }

  solid(x: number, y: number): boolean {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || x >= this.w || y < 0) return false;
    if (y >= this.h) return true;
    return this.mask[y * this.w + x] === 1;
  }

  /** First solid row in a column (h if empty). */
  surfaceY(x: number): number {
    x = clamp(Math.floor(x), 0, this.w - 1);
    for (let y = 0; y < this.h; y++) if (this.mask[y * this.w + x]) return y;
    return this.h;
  }

  /** First solid row at or below y. */
  surfaceBelow(x: number, y: number): number {
    x = Math.floor(x);
    if (x < 0 || x >= this.w) return this.h;
    for (let yy = Math.max(0, Math.floor(y)); yy < this.h; yy++) if (this.mask[yy * this.w + x]) return yy;
    return this.h;
  }

  get settling(): boolean {
    return this.active.size > 0;
  }

  markDirty(x0: number, y0: number, x1: number, y1: number) {
    x0 = clamp(Math.floor(x0), 0, this.w - 1);
    x1 = clamp(Math.ceil(x1), 0, this.w - 1);
    y0 = clamp(Math.floor(y0), 0, this.h - 1);
    y1 = clamp(Math.ceil(y1), 0, this.h - 1);
    if (x1 < x0 || y1 < y0) return;
    const d = this.dirty;
    if (!d) this.dirty = { x0, y0, x1, y1 };
    else {
      d.x0 = Math.min(d.x0, x0);
      d.y0 = Math.min(d.y0, y0);
      d.x1 = Math.max(d.x1, x1);
      d.y1 = Math.max(d.y1, y1);
    }
  }

  private wake(x0: number, x1: number) {
    for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) this.active.add(x);
  }

  /**
   * Remove ground in a circle. Returns number of pixels removed.
   * `wake` lets dirt above the hole collapse; tunnels pass false so they stay open.
   */
  carveCircle(cx: number, cy: number, r: number, wake = true): number {
    if (r <= 0) return 0;
    const { w, h, mask } = this;
    const maxY = h - BEDROCK;
    let removed = 0;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(w - 1, Math.ceil(cx + r));
    const r2 = r * r;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const span = r2 - dx * dx;
      if (span < 0) continue;
      const s = Math.sqrt(span);
      const ya = Math.max(0, Math.floor(cy - s));
      const yb = Math.min(maxY - 1, Math.ceil(cy + s));
      for (let y = ya; y <= yb; y++) {
        const i = y * w + x;
        if (mask[i]) {
          mask[i] = 0;
          removed++;
        }
      }
    }
    if (removed) {
      this.markDirty(cx - r - 1, cy - r - 4, cx + r + 1, cy + r + 4);
      if (wake) this.wake(x0, x1);
    }
    return removed;
  }

  private dirtPixel(x: number, y: number): number {
    const c = this.dirtColor;
    const m = 1 + (hash2(x * 3 + 7, y * 5 + 1) - 0.5) * 0.22 + 0.05 * Math.sin(y * 0.2);
    return pack(c[0] * m, c[1] * m, c[2] * m);
  }

  /** Add dirt in a circle. */
  fillCircle(cx: number, cy: number, r: number): number {
    const { w, h, mask } = this;
    let added = 0;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(w - 1, Math.ceil(cx + r));
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const span = r * r - dx * dx;
      if (span < 0) continue;
      const s = Math.sqrt(span);
      const ya = Math.max(0, Math.floor(cy - s));
      const yb = Math.min(h - 1, Math.ceil(cy + s));
      for (let y = ya; y <= yb; y++) {
        const i = y * w + x;
        if (!mask[i]) {
          mask[i] = 1;
          this.color[i] = this.dirtPixel(x, y);
          added++;
        }
      }
    }
    if (added) {
      this.markDirty(cx - r - 1, cy - r - 4, cx + r + 1, cy + r + 4);
      this.wake(x0, x1);
    }
    return added;
  }

  /** Raise a smooth hill of dirt on the surface, centred at cx. */
  addMound(cx: number, width: number, height: number) {
    const half = width / 2;
    let minY = this.h;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      if (x < 0 || x >= this.w) continue;
      const k = Math.cos(((x - cx) / half) * (Math.PI / 2));
      const add = Math.round(height * k * k);
      if (add <= 0) continue;
      const top = this.surfaceY(x);
      for (let y = top - 1; y >= Math.max(0, top - add); y--) {
        const i = y * this.w + x;
        this.mask[i] = 1;
        this.color[i] = this.dirtPixel(x, y);
      }
      minY = Math.min(minY, top - add);
    }
    this.markDirty(cx - half - 1, minY - 2, cx + half + 1, this.h - 1);
  }

  /** Level the ground around cx to height y. */
  flatten(cx: number, y: number, width: number) {
    const half = width / 2;
    y = Math.round(clamp(y, 40, this.h - BEDROCK - 1));
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      if (x < 0 || x >= this.w) continue;
      // feather the edges so the plateau blends in
      const e = Math.abs(x - cx) / half;
      const top = this.surfaceY(x);
      const target = Math.round(e > 0.75 ? y + (top - y) * ((e - 0.75) / 0.25) : y);
      for (let yy = 0; yy < target; yy++) this.mask[yy * this.w + x] = 0;
      for (let yy = target; yy < top; yy++) {
        const i = yy * this.w + x;
        this.mask[i] = 1;
        this.color[i] = this.dirtPixel(x, yy);
      }
    }
    this.markDirty(cx - half - 1, 0, cx + half + 1, this.h - 1);
    this.wake(Math.floor(cx - half), Math.ceil(cx + half));
  }

  /** Darken ground around a point (scorch marks). Purely cosmetic. */
  scorch(cx: number, cy: number, r: number, strength = 0.45) {
    const { w, h, mask, color } = this;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d >= 1) continue;
        const k = 1 - strength * (1 - d) * (0.8 + 0.4 * hash2(x, y));
        const c = color[i];
        color[i] = pack((c & 255) * k, ((c >>> 8) & 255) * k, ((c >>> 16) & 255) * k);
      }
    this.markDirty(x0, y0, x1, y1);
  }

  /**
   * Let unsupported dirt fall. Each column accelerates while it has something falling, so collapses look
   * like gravity rather than a constant slide. Deterministic, runs in the fixed step.
   */
  settle(): boolean {
    if (!this.active.size) return false;
    const { w, h, mask, color } = this;
    const bottom = h - BEDROCK;
    const done: number[] = [];
    for (const x of this.active) {
      const sp = (this.colSpeed[x] = Math.min(this.colSpeed[x] + 0.12, 9));
      const k = Math.max(1, Math.floor(sp));
      let top = -1;
      for (let y = 0; y < bottom; y++)
        if (mask[y * w + x]) {
          top = y;
          break;
        }
      let moved = false;
      let lowMoved = -1;
      if (top >= 0) {
        // floor = y of the highest supported solid pixel placed so far (scanning bottom-up)
        let floor = bottom;
        for (let y = bottom - 1; y >= top; y--) {
          const i = y * w + x;
          if (!mask[i]) continue;
          const target = Math.min(y + k, floor - 1);
          if (target > y) {
            const j = target * w + x;
            mask[j] = 1;
            color[j] = color[i];
            mask[i] = 0;
            moved = true;
            if (lowMoved < 0) lowMoved = target;
            floor = target;
          } else floor = y;
        }
      }
      if (moved) this.markDirty(x, top - 1, x, lowMoved + 4);
      else {
        this.colSpeed[x] = 0;
        done.push(x);
      }
    }
    for (const x of done) this.active.delete(x);
    return this.active.size > 0;
  }

  /** Approximate outward surface normal at a point, from nearby solid pixels. */
  normalAt(x: number, y: number): { nx: number; ny: number } {
    let sx = 0,
      sy = 0;
    const R = 5;
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        if (this.solid(x + dx, y + dy)) {
          sx -= dx;
          sy -= dy;
        }
      }
    const l = Math.hypot(sx, sy);
    if (l < 1e-6) return { nx: 0, ny: -1 };
    return { nx: sx / l, ny: sy / l };
  }
}
