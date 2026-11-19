import { BEDROCK } from '../config';
import { Rng, clamp } from './rng';
import type { RGB, Theme } from './themes';

/** Hill shape for a new battlefield. */
export type TerrainStyle = 'rolling' | 'mountains' | 'flat' | 'valley';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Packed snow: bright white with faint blue speckle, so it reads as snow wherever it ends up. */
const snowPixel = (x: number, y: number) => {
  const n = hash2(x, y);
  const k = 0.95 + 0.05 * n;
  return pack(246 * k, 250 * k, 255);
};
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
  private top: RGB = [120, 160, 80];
  private deep: RGB = [60, 90, 40];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.mask = new Uint8Array(w * h);
    this.color = new Uint32Array(w * h);
    this.colSpeed = new Float32Array(w);
  }

  static generate(w: number, h: number, rng: Rng, theme: Theme, flatSpots: number[] = [], style?: TerrainStyle): Terrain {
    const t = new Terrain(w, h);
    t.top = theme.top;
    t.deep = theme.deep;
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
    // Smooth rolling hills: two broad octaves, no small bumps.
    const pickedStyle = rng.int(0, 3); // always drawn so the seed sequence doesn't depend on the option
    const st: TerrainStyle = style ?? (['rolling', 'mountains', 'flat', 'valley'] as const)[pickedStyle];
    const amp = st === 'mountains' ? 0.23 : st === 'flat' ? 0.05 : st === 'valley' ? 0.08 : 0.14;
    const o1 = octave(rng.range(300, 460), h * amp);
    const o2 = octave(rng.range(130, 190), h * (st === 'flat' ? 0.02 : 0.045));
    const base = h * rng.range(0.56, 0.66);
    const heights = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      // valley: high ground at both ends, a deep basin in the middle
      const v = st === 'valley' ? -Math.cos(((x / w) * 2 - 1) * Math.PI * 0.5) * h * 0.2 + h * 0.08 : 0;
      heights[x] = clamp(base + o1(x) + o2(x) - v, h * 0.3, h * 0.88);
    }
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
    for (let x = 0; x < w; x++) {
      const top = Math.round(heights[x]);
      for (let y = top; y < h; y++) {
        const i = y * w + x;
        t.mask[i] = 1;
        t.color[i] = t.groundColor(y);
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
    return this.mask[y * this.w + x] !== 0;
  }

  /** Springy rubber (mask value 2): solid, never falls, shrugs off small blasts, and shells bounce off it. */
  rubber(x: number, y: number): boolean {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return false;
    return this.mask[y * this.w + x] === 2;
  }

  /** Paint a thick straight band of rubber from (x0,y0) to (x1,y1). */
  addRubberLine(x0: number, y0: number, x1: number, y1: number, thickness: number) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const h = thickness / 2;
    for (let s = 0; s <= len; s += 1.5) {
      const x = x0 + ((x1 - x0) * s) / len,
        y = y0 + ((y1 - y0) * s) / len;
      this.addRubber(x - h, y - h, x + h, y + h);
    }
  }

  /** Paint a filled rectangle of rubber (over air or dirt). */
  addRubber(x0: number, y0: number, x1: number, y1: number) {
    x0 = clamp(Math.floor(x0), 0, this.w - 1);
    x1 = clamp(Math.ceil(x1), 0, this.w - 1);
    y0 = clamp(Math.floor(y0), 0, this.h - BEDROCK - 1);
    y1 = clamp(Math.ceil(y1), 0, this.h - BEDROCK - 1);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * this.w + x;
        this.mask[i] = 2;
        // teal rubber with soft diagonal bands and a lighter rim
        const band = ((x + y) >> 3) & 1 ? 1 : 0.86;
        const rim = y - y0 < 2 || x - x0 < 1 || x1 - x < 1 ? 1.25 : 1;
        const k = band * rim;
        this.color[i] = pack(Math.min(255, 52 * k), Math.min(255, 214 * k), Math.min(255, 190 * k));
      }
    this.markDirty(x0 - 1, y0 - 2, x1 + 1, y1 + 2);
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
        if (mask[i] === 1 || (mask[i] === 2 && r >= 26 && (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 < r2 * 0.2)) {
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

  /** Classic solid ground: one colour per row, lighter near the top of the field, darker toward the bottom. */
  groundColor(y: number, dim = 1): number {
    const k = clamp((y - this.h * 0.3) / (this.h * 0.7), 0, 1);
    const a = this.top,
      b = this.deep;
    return pack((a[0] + (b[0] - a[0]) * k) * dim, (a[1] + (b[1] - a[1]) * k) * dim, (a[2] + (b[2] - a[2]) * k) * dim);
  }

  /** Added dirt: same ground colour, a touch darker so new dirt reads as fresh. */
  private dirtPixel(_x: number, y: number): number {
    return this.groundColor(y, 0.86);
  }

  /** Add dirt in a circle. */
  /** `wake` lets unsupported dirt fall; domes pass false so the arch stands. */
  fillCircle(cx: number, cy: number, r: number, wake = true, snow = false): number {
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
          this.color[i] = snow ? snowPixel(x, y) : this.dirtPixel(x, y);
          added++;
        }
      }
    }
    if (added) {
      this.markDirty(cx - r - 1, cy - r - 4, cx + r + 1, cy + r + 4);
      if (wake) this.wake(x0, x1);
    }
    return added;
  }

  /** Raise a smooth hill of dirt on the surface, centred at cx. */
  addMound(cx: number, width: number, height: number, snow = false) {
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
        this.color[i] = snow ? snowPixel(x, y) : this.dirtPixel(x, y);
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
          if (mask[i] === 2) {
            floor = y; // rubber is anchored where it was placed
            continue;
          }
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
