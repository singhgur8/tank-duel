import { DEG, Rng, clamp } from '../core/rng';
import type { Controller } from '../net/commands';
import { flightStep, launchVelocity, muzzle, tankCenter } from './flight';
import type { Game } from './game';
import { getWeapon } from './weapons';
import type { ProjectileDef, WeaponDef } from './types';

/**
 * CPU opponent. It aims by running the real projectile physics (same fixed step, same wind) and searching
 * angle and power for a hit, then adds aiming error that shrinks with difficulty. Level 10 has no error,
 * so whenever a trajectory to the target exists it lands on the tank.
 */

export interface ShotResult {
  x: number;
  y: number;
  tank: number; // tank index hit directly, or -1
}

const MAX_SIM_TIME = 12;

/** Where would this shot first land? Mirrors the live rules for apex splits. */
export function predictShot(game: Game, owner: number, def: ProjectileDef, angle: number, power: number): ShotResult {
  const t = game.tanks[owner];
  const m = muzzle(t, angle);
  const v = launchVelocity(angle, power, def);
  const p = { x: m.x, y: m.y, vx: v.vx, vy: v.vy, age: 0 };
  const ctx = game.flightCtx(owner);
  let d = def;
  let apexDone = false;
  const steps = Math.ceil(MAX_SIM_TIME * 120);
  for (let i = 0; i < steps; i++) {
    const vyPrev = p.vy;
    const hit = flightStep(p, d, ctx);
    if (hit) {
      if (hit.kind === 'out') return { x: p.x, y: p.y, tank: -1 };
      if (hit.kind === 'tank') return { x: hit.x, y: hit.y, tank: hit.tank };
      return { x: hit.x, y: hit.y, tank: -1 };
    }
    if (!apexDone && d.onApex && vyPrev < 0 && p.vy >= 0) {
      apexDone = true;
      if (d.consumeOnApex) {
        const sp = d.onApex.find((a) => a.type === 'spawn');
        if (sp && sp.type === 'spawn' && (sp.direction ?? 'velocity') === 'velocity' && sp.count % 2 === 1 && !sp.angleJitter && !sp.speedJitter) {
          d = sp.projectile; // the middle warhead keeps the parent's path
        } else {
          // rains down from the apex: estimate the landing spot straight below
          return { x: p.x, y: game.terrain.surfaceY(p.x), tank: -1 };
        }
      }
    }
  }
  return { x: p.x, y: p.y, tank: -1 };
}

export interface Plan {
  weaponIndex: number;
  angle: number;
  power: number;
  miss: number;
}

function missOf(game: Game, owner: number, target: number, r: ShotResult) {
  if (r.tank === target) return 0;
  if (r.tank === owner) return 9999;
  const c = tankCenter(game.tanks[target]);
  return Math.hypot(r.x - c.x, r.y - c.y);
}

/** Best (angle, power) for a projectile weapon, searched with the real physics. */
export function solveShot(game: Game, owner: number, def: ProjectileDef) {
  const target = 1 - owner;
  const me = game.tanks[owner];
  const c = tankCenter(game.tanks[target]);
  const dir = c.x >= me.x ? 1 : -1;
  let best = { angle: 45, power: 50, miss: Infinity };
  const signedErr = (r: ShotResult) => (r.tank === target ? 0 : (r.x - c.x) * dir);

  const tryAngle = (a: number) => {
    let prevP = -1,
      prevS = 0;
    for (let pw = 8; pw <= 100; pw += 4) {
      const r = predictShot(game, owner, def, a, pw);
      const m = missOf(game, owner, target, r);
      if (m < best.miss) best = { angle: a, power: pw, miss: m };
      if (m === 0) return;
      const s = signedErr(r);
      if (prevP >= 0 && prevS < 0 && s >= 0) {
        // bisect between prevP and pw
        let lo = prevP,
          hi = pw;
        for (let k = 0; k < 16; k++) {
          const mid = (lo + hi) / 2;
          const rm = predictShot(game, owner, def, a, mid);
          const mm = missOf(game, owner, target, rm);
          if (mm < best.miss) best = { angle: a, power: mid, miss: mm };
          if (mm === 0) return;
          if (signedErr(rm) < 0) lo = mid;
          else hi = mid;
        }
      }
      prevP = pw;
      prevS = s;
    }
  };

  const angles: number[] = [];
  for (let a = 4; a <= 86; a += 1.5) angles.push(dir > 0 ? a : 180 - a);
  // Try mid-height arcs first; they clear hills most often.
  angles.sort((a, b) => Math.abs(Math.abs(90 - a) - 40) - Math.abs(Math.abs(90 - b) - 40));
  for (const a of angles) {
    tryAngle(a);
    if (best.miss === 0) break;
  }
  if (best.miss > 0) {
    const base = best.angle;
    for (let da = -1.4; da <= 1.4 && best.miss > 0; da += 0.1) tryAngle(base + da);
  }
  return best;
}

export function chooseWeapon(game: Game, owner: number, level: number, rng: Rng): number {
  const ws = game.players[owner].weapons.map(getWeapon);
  if (!ws.length) return 0;
  const score = (w: WeaponDef) => (w.ai?.value ?? 3) + rng.range(0, level >= 8 ? 0.5 : level >= 4 ? 3 : 8);
  let bi = 0,
    bs = -Infinity;
  ws.forEach((w, i) => {
    const s = score(w);
    if (s > bs) {
      bs = s;
      bi = i;
    }
  });
  return bi;
}

export function planTurn(game: Game, owner: number, level: number, rng: Rng): Plan {
  level = clamp(Math.round(level), 1, 10);
  const weaponIndex = chooseWeapon(game, owner, level, rng);
  const w = getWeapon(game.players[owner].weapons[weaponIndex]);
  let angle: number, power: number, miss: number;
  if (w.beam) {
    const p = game.pivot(owner);
    const c = tankCenter(game.tanks[1 - owner]);
    angle = Math.atan2(-(c.y - p.y), c.x - p.x) / DEG;
    if (angle < 0) angle += 360;
    if (angle > 180) angle = angle > 270 ? 0 : 180;
    power = game.players[owner].power;
    miss = 0;
  } else {
    const s = solveShot(game, owner, w.projectile!);
    angle = s.angle;
    power = s.power;
    miss = s.miss;
  }
  const err = (10 - level) / 9; // 1 at level 1, 0 at level 10
  if (err > 0) {
    angle += rng.gauss() * err * 7;
    power += rng.gauss() * err * 11;
  }
  return { weaponIndex, angle: clamp(angle, 0, 180), power: clamp(power, 5, 100), miss };
}

/** Drives the CPU's turn: think, swing the turret into place, fire. */
export class CpuController implements Controller {
  private plan: Plan | null = null;
  private t = 0;
  private fired = false;
  constructor(private game: Game, private owner: number, private level: number, private rng: Rng) {}

  beginTurn() {
    this.plan = null;
    this.t = 0;
    this.fired = false;
  }

  update(dt: number) {
    const g = this.game;
    if (g.phase !== 'aim' || g.current !== this.owner || this.fired) return;
    this.t += dt;
    if (!this.plan) {
      if (this.t < 0.5) return;
      this.plan = planTurn(g, this.owner, this.level, this.rng);
      g.apply({ t: 'weapon', index: this.plan.weaponIndex });
      this.t = 0;
      return;
    }
    const p = g.players[this.owner];
    const k = Math.min(1, dt * 4);
    const da = this.plan.angle - p.angle,
      dp = this.plan.power - p.power;
    const step = (d: number, max: number) => Math.sign(d) * Math.min(Math.abs(d), Math.max(Math.abs(d) * k, max * dt));
    const close = Math.abs(da) < 0.01 && Math.abs(dp) < 0.01;
    if (!close) {
      g.apply({ t: 'aim', angle: Math.abs(da) < 0.2 ? this.plan.angle : p.angle + step(da, 40), power: Math.abs(dp) < 0.2 ? this.plan.power : p.power + step(dp, 40) });
      return;
    }
    if (this.t > 1.1) {
      // exact values for the shot itself
      g.apply({ t: 'aim', angle: this.plan.angle, power: this.plan.power });
      g.apply({ t: 'fire' });
      this.fired = true;
    }
  }
}
