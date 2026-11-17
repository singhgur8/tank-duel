import { DT, GRAVITY, MAX_SPEED, WIND_ACCEL, WORLD_W, BARREL_LEN, PIVOT_HEIGHT, TANK_HIT_RADIUS } from '../config';
import { DEG } from '../core/rng';
import type { Terrain } from '../core/terrain';
import type { ProjectileDef } from './types';

/**
 * Shared projectile physics. The live game and the CPU's aiming both call `flightStep`, so a shot the
 * CPU predicts lands exactly where it will land in play.
 */

export interface FlightState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

export interface TankLike {
  x: number;
  y: number;
}

export interface FlightCtx {
  terrain: Terrain;
  tanks: TankLike[];
  wind: number;
  owner: number;
}

export type FlightHit =
  | { kind: 'terrain'; x: number; y: number; ax: number; ay: number }
  | { kind: 'tank'; x: number; y: number; tank: number }
  | { kind: 'out' };

export const tankCenter = (t: TankLike) => ({ x: t.x, y: t.y - PIVOT_HEIGHT + 3 });

export function muzzle(t: TankLike, angleDeg: number) {
  const px = t.x,
    py = t.y - PIVOT_HEIGHT;
  return { x: px + Math.cos(angleDeg * DEG) * BARREL_LEN, y: py - Math.sin(angleDeg * DEG) * BARREL_LEN };
}

export function launchVelocity(angleDeg: number, power: number, def?: ProjectileDef) {
  const sp = (power / 100) * MAX_SPEED * (def?.speedScale ?? 1);
  return { vx: Math.cos(angleDeg * DEG) * sp, vy: -Math.sin(angleDeg * DEG) * sp };
}

/** First solid pixel along a segment, plus the last air point before it. */
export function marchTerrain(t: Terrain, x0: number, y0: number, x1: number, y1: number) {
  const dx = x1 - x0,
    dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const n = Math.max(1, Math.ceil(len / 0.7));
  let ax = x0,
    ay = y0;
  for (let i = 1; i <= n; i++) {
    const f = i / n;
    const x = x0 + dx * f,
      y = y0 + dy * f;
    if (t.solid(x, y)) return { x, y, ax, ay, f };
    ax = x;
    ay = y;
  }
  return null;
}

/** Segment vs circle; returns the param t in [0,1] of first contact or -1. */
export function segCircle(x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, r: number) {
  const dx = x1 - x0,
    dy = y1 - y0;
  const fx = x0 - cx,
    fy = y0 - cy;
  const a = dx * dx + dy * dy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  if (a < 1e-9) return -1;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

/** Index of the nearest tank that is not the owner. */
export function nearestEnemy(ctx: FlightCtx, x: number, y: number) {
  let best = -1,
    bd = Infinity;
  ctx.tanks.forEach((t, i) => {
    if (i === ctx.owner) return;
    const d = Math.hypot(t.x - x, t.y - y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Advance one fixed step. Mutates p. Returns a hit, or null if still flying. */
export function flightStep(p: FlightState, def: ProjectileDef, ctx: FlightCtx): FlightHit | null {
  const dt = DT;
  if (def.homing && p.age >= def.homing.delay && p.vy > 0) {
    const e = nearestEnemy(ctx, p.x, p.y);
    if (e >= 0) {
      const c = tankCenter(ctx.tanks[e]);
      const want = Math.atan2(c.y - p.y, c.x - p.x);
      const cur = Math.atan2(p.vy, p.vx);
      let d = want - cur;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const maxTurn = def.homing.turnRate * dt;
      const turn = Math.max(-maxTurn, Math.min(maxTurn, d));
      const sp = Math.hypot(p.vx, p.vy);
      const na = cur + turn;
      p.vx = Math.cos(na) * sp;
      p.vy = Math.sin(na) * sp;
    }
  }
  p.vx += ctx.wind * WIND_ACCEL * (def.windScale ?? 1) * dt;
  p.vy += GRAVITY * (def.gravityScale ?? 1) * dt;
  const nx = p.x + p.vx * dt,
    ny = p.y + p.vy * dt;

  // tanks
  let tankT = 2,
    tankI = -1;
  for (let i = 0; i < ctx.tanks.length; i++) {
    if (i === ctx.owner && p.age < 0.12) continue;
    const c = tankCenter(ctx.tanks[i]);
    const t = segCircle(p.x, p.y, nx, ny, c.x, c.y, TANK_HIT_RADIUS);
    if (t >= 0 && t < tankT) {
      tankT = t;
      tankI = i;
    }
  }
  const th = marchTerrain(ctx.terrain, p.x, p.y, nx, ny);
  p.age += dt;
  if (tankI >= 0 && (!th || tankT <= th.f)) {
    p.x = p.x + (nx - p.x) * tankT;
    p.y = p.y + (ny - p.y) * tankT;
    return { kind: 'tank', x: p.x, y: p.y, tank: tankI };
  }
  if (th) {
    p.x = th.ax;
    p.y = th.ay;
    return { kind: 'terrain', x: th.x, y: th.y, ax: th.ax, ay: th.ay };
  }
  p.x = nx;
  p.y = ny;
  if (p.x < -60 || p.x > WORLD_W + 60) return { kind: 'out' };
  return null;
}
