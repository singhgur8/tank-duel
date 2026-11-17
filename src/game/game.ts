import {
  ANGLE_MAX, ANGLE_MIN, BEAM_ANGLE_MAX, BEAM_ANGLE_MIN, BEDROCK, DT, MAX_BURN_DPS, GRAVITY, MAX_CLIMB_PER_PX, MAX_WIND, MOVE_DISTANCE, MOVE_SPEED, MOVES_PER_GAME,
  PIVOT_HEIGHT, TANK_HALF_WIDTH, TANK_HIT_RADIUS, TURN_SETTLE_DELAY, WORLD_H, WORLD_W,
} from '../config';
import { Rng, clamp, DEG } from '../core/rng';
import { Terrain, type TerrainStyle } from '../core/terrain';
import { THEMES, type Theme } from '../core/themes';
import type { GameCommand } from '../net/commands';
import { flightStep, launchVelocity, muzzle, tankCenter, type FlightCtx, type FlightState } from './flight';
import { WEAPONS, getWeapon } from './weapons';
import type { Action, ExplosionStyle, ProjectileDef, WeaponDef } from './types';

/** Side-effects the simulation asks the presentation layer for. The game never draws or plays sound itself. */
export interface Fx {
  explosion(x: number, y: number, radius: number, style: ExplosionStyle, damage: number): void;
  muzzle(x: number, y: number, angleDeg: number, power: number, weapon: WeaponDef): void;
  bounce(x: number, y: number, color: string): void;
  dig(x: number, y: number): void;
  dirt(x: number, y: number, radius: number): void;
  beam(x0: number, y0: number, x1: number, y1: number, color: string, width: number): void;
  damage(x: number, y: number, amount: number, color: string): void;
  tankLand(x: number, y: number, speed: number): void;
  shake(amount: number): void;
  hitStop(seconds: number): void;
  napalm(x: number, y: number): void;
  lightning(x: number, yTop: number, yGround: number, radius: number): void;
  quake(x: number, y: number, radius: number): void;
}

export const NullFx: Fx = {
  explosion() {}, muzzle() {}, bounce() {}, dig() {}, dirt() {}, beam() {}, damage() {}, tankLand() {}, shake() {}, hitStop() {}, napalm() {}, lightning() {}, quake() {},
};

export interface PlayerSetup {
  name: string;
  cpuLevel?: number; // 1..10, undefined = human
}

export interface GameOptions {
  players: [PlayerSetup, PlayerSetup];
  weaponsPerPlayer: number;
  seed: number;
  themeId?: string;
  /** Pre-picked hands from a draft. Omit to deal at random. */
  hands?: [string[], string[]];
  /** Strongest wind (0 = no wind). Defaults to MAX_WIND. */
  maxWind?: number;
  /** Hill shape. Omit for random. */
  terrain?: TerrainStyle;
  /** Weapon ids that may be dealt. Omit for the whole arsenal. */
  pool?: string[];
}

export interface Player {
  name: string;
  color: string;
  cpuLevel?: number;
  score: number;
  weapons: string[];
  selected: number;
  moves: number;
  angle: number;
  power: number;
}

export interface Tank {
  x: number;
  y: number; // ground contact
  vy: number;
  falling: boolean;
  fallStart: number;
  tilt: number;
  hitFlash: number;
  moveLeft: number;
  moveDir: number;
  moveStartX: number;
  burnAcc: number;
  burnTimer: number;
  recoil: number;
}

export interface Projectile extends FlightState {
  id: number;
  def: ProjectileDef;
  owner: number;
  skipTank: number;
  mode: 'fly' | 'roll' | 'burrow';
  resumeRoll: boolean;
  bounces: number;
  apexDone: boolean;
  rollV: number;
  rollTime: number;
  burrowLeft: number;
  bdx: number;
  bdy: number;
  dead: boolean;
}

export interface Flame {
  x: number;
  y: number;
  v: number;
  life: number;
  maxLife: number;
  dps: number;
  owner: number;
}

export type Phase = 'aim' | 'moving' | 'flight' | 'gameover';

export const PLAYER_COLORS = ['#38c6ff', '#ff7a3d'];

export class Game {
  readonly rng: Rng;
  readonly theme: Theme;
  readonly terrain: Terrain;
  readonly players: Player[];
  readonly tanks: Tank[];
  projectiles: Projectile[] = [];
  flames: Flame[] = [];
  wind = 0;
  current = 0;
  phase: Phase = 'aim';
  turn = 1;
  time = 0;
  lastWeapon: WeaponDef | null = null;
  private quiet = 0;
  private pendingShots: { t: number; angle: number; power: number; weapon: WeaponDef }[] = [];
  private nextId = 1;

  constructor(readonly opts: GameOptions, public fx: Fx = NullFx) {
    this.rng = new Rng(opts.seed);
    this.theme = THEMES.find((t) => t.id === opts.themeId) ?? this.rng.pick(THEMES);
    const x1 = Math.round(this.rng.range(0.07, 0.22) * WORLD_W);
    const x2 = Math.round(this.rng.range(0.78, 0.93) * WORLD_W);
    this.terrain = Terrain.generate(WORLD_W, WORLD_H, this.rng, this.theme, [x1, x2], opts.terrain);
    this.tanks = [x1, x2].map((x) => this.makeTank(x));
    this.players = opts.players.map((p, i) => ({
      name: p.name,
      color: PLAYER_COLORS[i],
      cpuLevel: p.cpuLevel,
      score: 0,
      weapons: [],
      selected: 0,
      moves: MOVES_PER_GAME,
      angle: i === 0 ? 50 : 130,
      power: 60,
    }));
    if (opts.hands) opts.hands.forEach((h, i) => (this.players[i].weapons = [...h]));
    else this.dealWeapons(opts.weaponsPerPlayer);
    this.wind = this.rollWind();
    this.current = this.rng.int(0, 1);
  }

  private makeTank(x: number): Tank {
    const t: Tank = { x, y: 0, vy: 0, falling: false, fallStart: 0, tilt: 0, hitFlash: 0, moveLeft: 0, moveDir: 0, moveStartX: x, burnAcc: 0, burnTimer: 0, recoil: 0 };
    t.y = this.groundUnder(x, 0);
    t.tilt = this.tiltAt(t);
    return t;
  }

  /** Alternate-pick deal from shuffled copies of the arsenal, so both sides get a similar mix. */
  private dealWeapons(n: number) {
    const allowed = this.opts.pool?.length ? new Set(this.opts.pool) : null;
    const ids = WEAPONS.filter((w) => !allowed || allowed.has(w.id)).map((w) => w.id);
    let pool: string[] = [];
    for (let i = 0; i < n; i++) {
      for (const p of this.players) {
        if (!pool.length) pool = this.rng.shuffle(ids.slice());
        // Avoid duplicates in one hand while possible.
        let k = pool.findIndex((id) => !p.weapons.includes(id));
        if (k < 0) k = 0;
        p.weapons.push(pool.splice(k, 1)[0]);
      }
    }
    for (const p of this.players) p.weapons.sort((a, b) => WEAPONS.findIndex((w) => w.id === a) - WEAPONS.findIndex((w) => w.id === b));
  }

  get maxWind(): number {
    return this.opts.maxWind ?? MAX_WIND;
  }

  private rollWind(): number {
    const m = this.maxWind;
    if (m <= 0) return 0;
    const target = this.rng.range(-m, m);
    return Math.round(clamp(this.wind * 0.35 + target * 0.65, -m, m));
  }

  get player() {
    return this.players[this.current];
  }

  get currentWeapon(): WeaponDef | null {
    const p = this.player;
    const id = p.weapons[p.selected];
    return id ? getWeapon(id) : null;
  }

  flightCtx(owner: number, skip = owner): FlightCtx {
    return { terrain: this.terrain, tanks: this.tanks, wind: this.wind, owner: skip };
  }

  // ── Commands (the only way input changes the game; ready for networking) ──
  apply(cmd: GameCommand): boolean {
    if (this.phase !== 'aim') return false;
    const p = this.player;
    switch (cmd.t) {
      case 'aim':
        p.angle = this.clampAngle(cmd.angle);
        p.power = clamp(cmd.power, 5, 100);
        return true;
      case 'weapon':
        if (cmd.index < 0 || cmd.index >= p.weapons.length) return false;
        p.selected = cmd.index;
        p.angle = this.clampAngle(p.angle);
        return true;
      case 'move': {
        if (p.moves <= 0) return false;
        const t = this.tanks[this.current];
        p.moves--;
        t.moveDir = cmd.dir;
        t.moveLeft = MOVE_DISTANCE;
        t.moveStartX = t.x;
        this.phase = 'moving';
        return true;
      }
      case 'fire':
        return this.fire();
    }
  }

  /** Allowed barrel angle for the current weapon (beams can point downward). */
  angleRange(): [number, number] {
    return this.currentWeapon?.beam ? [BEAM_ANGLE_MIN, BEAM_ANGLE_MAX] : [ANGLE_MIN, ANGLE_MAX];
  }

  clampAngle(a: number) {
    const [lo, hi] = this.angleRange();
    return clamp(a, lo, hi);
  }

  private fire(): boolean {
    const p = this.player;
    const w = this.currentWeapon;
    if (!w) return false;
    p.weapons.splice(p.selected, 1);
    p.selected = clamp(p.selected, 0, Math.max(0, p.weapons.length - 1));
    this.lastWeapon = w;
    const fireAngle = p.angle;
    p.angle = this.clampAngle(p.angle);
    this.phase = 'flight';
    this.quiet = 0;
    const tank = this.tanks[this.current];
    tank.recoil = 1;
    if (w.beam) {
      this.fireBeam(w, fireAngle);
      return true;
    }
    const v = w.volley ?? { count: 1, spreadDeg: 0 };
    for (let i = 0; i < v.count; i++) {
      const off = v.count > 1 ? (i / (v.count - 1) - 0.5) * v.spreadDeg : 0;
      this.pendingShots.push({ t: (v.delay ?? 0) * i, angle: fireAngle + off, power: p.power, weapon: w });
    }
    this.flushShots(0);
    return true;
  }

  private flushShots(dt: number) {
    for (const s of this.pendingShots) s.t -= dt;
    const ready = this.pendingShots.filter((s) => s.t <= 0);
    if (!ready.length) return;
    this.pendingShots = this.pendingShots.filter((s) => s.t > 0);
    for (const s of ready) {
      const tank = this.tanks[this.current];
      const m = muzzle(tank, s.angle);
      const def = s.weapon.projectile!;
      const vel = launchVelocity(s.angle, s.power, def);
      this.spawnProjectile(def, m.x, m.y, vel.vx, vel.vy, this.current, this.current);
      this.fx.muzzle(m.x, m.y, s.angle, s.power, s.weapon);
      tank.recoil = 1;
    }
  }

  spawnProjectile(def: ProjectileDef, x: number, y: number, vx: number, vy: number, owner: number, skipTank: number) {
    const p: Projectile = {
      id: this.nextId++, def, owner, skipTank, x, y, vx, vy, age: 0, mode: 'fly', resumeRoll: false,
      bounces: def.bounces ?? 0, apexDone: false, rollV: 0, rollTime: 0, burrowLeft: 0, bdx: 0, bdy: 0, dead: false,
    };
    this.projectiles.push(p);
    return p;
  }

  private fireBeam(w: WeaponDef, angle: number) {
    const b = w.beam!;
    const tank = this.tanks[this.current];
    const m = muzzle(tank, angle);
    const dx = Math.cos(angle * DEG),
      dy = -Math.sin(angle * DEG);
    let x = m.x,
      y = m.y;
    const hit = new Set<number>();
    let travelled = 0;
    while (travelled < b.length) {
      x += dx * 3;
      y += dy * 3;
      travelled += 3;
      if (x < -20 || x > WORLD_W + 20 || y < -400 || y > WORLD_H - BEDROCK) break;
      if (this.terrain.solid(x, y)) this.terrain.carveCircle(x, y, b.width, false);
      this.tanks.forEach((t, i) => {
        if (hit.has(i) || (i === this.current && travelled < 40)) return;
        const c = tankCenter(t);
        if (Math.hypot(c.x - x, c.y - y) < TANK_HIT_RADIUS + b.width) {
          hit.add(i);
          this.applyDamage(i, b.damage, this.current, c.x, c.y);
          this.fx.explosion(c.x, c.y, 24, 'plasma', b.damage);
        }
      });
    }
    this.terrain.scorch(x, y, b.width * 3, 0.5);
    this.fx.beam(m.x, m.y, x, y, b.color, b.width);
    this.fx.explosion(x, y, 18, 'plasma', 0);
    this.fx.muzzle(m.x, m.y, angle, 100, w);
  }

  // ── Simulation ──
  update(dt = DT) {
    this.time += dt;
    this.flushShots(dt);
    for (const p of this.projectiles) if (!p.dead) this.stepProjectile(p);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.stepFlames(dt);
    this.terrain.settle();
    for (let i = 0; i < this.tanks.length; i++) this.stepTank(i, dt);

    if (this.phase === 'moving') {
      const t = this.tanks[this.current];
      if (t.moveLeft <= 0 && !t.falling) this.phase = 'aim';
    } else if (this.phase === 'flight') {
      const busy =
        this.projectiles.length > 0 || this.flames.length > 0 || this.pendingShots.length > 0 || this.terrain.settling || this.tanks.some((t) => t.falling);
      this.quiet = busy ? 0 : this.quiet + dt;
      if (this.quiet >= TURN_SETTLE_DELAY) this.endTurn();
    }
  }

  private endTurn() {
    const remaining = this.players.map((p) => p.weapons.length);
    if (remaining.every((r) => r === 0)) {
      this.phase = 'gameover';
      return;
    }
    this.turn++;
    this.current = 1 - this.current;
    if (remaining[this.current] === 0) this.current = 1 - this.current;
    this.wind = this.rollWind();
    this.phase = 'aim';
  }

  get winner(): number {
    const [a, b] = this.players.map((p) => Math.round(p.score));
    return a === b ? -1 : a > b ? 0 : 1;
  }

  private stepProjectile(p: Projectile) {
    if (p.mode === 'roll') return this.stepRoll(p);
    if (p.mode === 'burrow') return this.stepBurrow(p);
    const vyPrev = p.vy;
    const hit = flightStep(p, p.def, this.flightCtx(p.owner, p.skipTank));
    if (!hit) {
      if (p.def.onApex && !p.apexDone && vyPrev < 0 && p.vy >= 0) {
        p.apexDone = true;
        this.runActions(p.def.onApex, p.x, p.y, p, -1);
        if (p.def.consumeOnApex) p.dead = true;
      }
      return;
    }
    if (hit.kind === 'out') {
      p.dead = true;
      return;
    }
    if (hit.kind === 'tank') return this.impact(p, hit.x, hit.y, hit.tank);
    // terrain
    const d = p.def;
    if (p.resumeRoll) return this.enterRoll(p, hit.ax, hit.ay);
    if (p.bounces > 0) {
      const n = this.terrain.normalAt(hit.x, hit.y);
      const dot = p.vx * n.nx + p.vy * n.ny;
      if (dot < 0) {
        p.vx -= 2 * dot * n.nx;
        p.vy -= 2 * dot * n.ny;
      }
      const r = d.restitution ?? 0.7;
      p.vx *= r;
      p.vy *= r;
      p.bounces--;
      p.x = hit.ax + n.nx;
      p.y = hit.ay + n.ny;
      this.fx.bounce(p.x, p.y, d.glow ?? d.color);
      if (d.onBounce) this.runActions(d.onBounce, p.x, p.y, p, -1);
      if (Math.hypot(p.vx, p.vy) < 60) this.impact(p, p.x, p.y, -1);
      return;
    }
    if (d.roll) return this.enterRoll(p, hit.ax, hit.ay);
    if (d.burrow) {
      const sp = Math.hypot(p.vx, p.vy) || 1;
      p.mode = 'burrow';
      p.bdx = p.vx / sp;
      p.bdy = p.vy / sp;
      p.burrowLeft = d.burrow.length;
      p.x = hit.x;
      p.y = hit.y;
      this.fx.dig(p.x, p.y);
      return;
    }
    this.impact(p, hit.ax, hit.ay, -1);
  }

  /** Ground height near (x,y): climb out if inside ground, else drop to the first solid below. */
  groundNear(x: number, y: number, maxUp = 30, maxDown = 40): number {
    const t = this.terrain;
    if (t.solid(x, y)) {
      for (let k = 1; k <= maxUp; k++) if (!t.solid(x, y - k)) return y - k + 1;
      return y - maxUp;
    }
    for (let k = 1; k <= maxDown; k++) if (t.solid(x, y + k)) return y + k;
    return y + maxDown + 1;
  }

  private enterRoll(p: Projectile, x: number, y: number) {
    p.mode = 'roll';
    p.resumeRoll = false;
    p.x = x;
    p.y = this.groundNear(x, y);
    const sl = (this.groundNear(x + 4, p.y) - this.groundNear(x - 4, p.y)) / 8;
    p.rollV = Math.abs(p.vx) > 20 ? p.vx * 0.65 : Math.sign(sl || 1) * 40;
    this.fx.bounce(p.x, p.y, p.def.glow ?? p.def.color);
  }

  private stepRoll(p: Projectile) {
    const dt = DT;
    p.rollTime += dt;
    p.age += dt;
    const gl = this.groundNear(p.x - 3, p.y),
      gr = this.groundNear(p.x + 3, p.y);
    const sl = (gr - gl) / 6;
    p.rollV += (GRAVITY * sl) / Math.sqrt(1 + sl * sl) * dt * 0.9;
    p.rollV *= 1 - 0.5 * dt;
    const nx = p.x + p.rollV * dt;
    if (nx < 0 || nx >= WORLD_W) {
      p.dead = true;
      return;
    }
    // tanks
    for (let i = 0; i < this.tanks.length; i++) {
      if (i === p.owner && p.rollTime < 0.25) continue;
      const c = tankCenter(this.tanks[i]);
      if (Math.hypot(c.x - nx, c.y - p.y) < TANK_HIT_RADIUS + (p.def.radius ?? 4)) return this.impact(p, nx, p.y - 2, i);
    }
    const t = this.terrain;
    let ny: number;
    if (t.solid(nx, p.y)) {
      const maxClimb = 2 + Math.abs(nx - p.x) * 2.5;
      let k = 1;
      while (k <= maxClimb && t.solid(nx, p.y - k)) k++;
      if (k > maxClimb) return this.impact(p, p.x, p.y - 3, -1); // wall
      ny = p.y - k + 1;
    } else {
      let k = 1;
      while (k <= 6 && !t.solid(nx, p.y + k)) k++;
      if (k > 6) {
        // rolled off a ledge: fly, then resume rolling on landing
        p.mode = 'fly';
        p.resumeRoll = true;
        p.x = nx;
        p.vx = p.rollV;
        p.vy = 0;
        return;
      }
      ny = p.y + k - 1;
    }
    p.x = nx;
    p.y = ny;
    if ((Math.abs(p.rollV) < 8 && p.rollTime > 0.5) || p.rollTime > (p.def.roll?.maxTime ?? 6)) this.impact(p, p.x, p.y - 3, -1);
  }

  private stepBurrow(p: Projectile) {
    const b = p.def.burrow!;
    const sp = (b.speed ?? 300) * DT;
    p.x += p.bdx * sp;
    p.y += p.bdy * sp;
    p.age += DT;
    p.burrowLeft -= sp;
    if (p.x < 0 || p.x >= WORLD_W || p.y >= WORLD_H - BEDROCK) return this.impact(p, clamp(p.x, 0, WORLD_W - 1), Math.min(p.y, WORLD_H - BEDROCK - 1), -1);
    if (this.terrain.carveCircle(p.x, p.y, b.radius, false) > 0) this.fx.dig(p.x, p.y);
    for (let i = 0; i < this.tanks.length; i++) {
      if (i === p.owner && p.age < 0.3) continue;
      const c = tankCenter(this.tanks[i]);
      if (Math.hypot(c.x - p.x, c.y - p.y) < TANK_HIT_RADIUS + b.radius * 0.5) return this.impact(p, p.x, p.y, i);
    }
    if (p.burrowLeft <= 0) this.impact(p, p.x, p.y, -1);
  }

  private impact(p: Projectile, x: number, y: number, tankHit: number) {
    p.dead = true;
    p.x = x;
    p.y = y;
    this.runActions(p.def.onImpact, x, y, p, tankHit);
  }

  runActions(actions: Action[], x: number, y: number, src: Projectile | null, tankHit: number) {
    for (const a of actions) this.runAction(a, x, y, src, tankHit);
  }

  private runAction(a: Action, x: number, y: number, src: Projectile | null, tankHit: number) {
    const owner = src?.owner ?? this.current;
    switch (a.type) {
      case 'explode':
        return this.explode(x, y, a.radius, a.damage, a.style ?? 'standard', owner, tankHit);
      case 'spawn': {
        const pv = src ? Math.hypot(src.vx, src.vy) : 200;
        const base =
          a.direction === 'up'
            ? -Math.PI / 2
            : a.direction === 'down'
              ? Math.PI / 2
              : a.direction === 'forward'
                ? (src && src.vx < 0 ? -Math.PI * 0.64 : -Math.PI * 0.36)
                : src
                  ? Math.atan2(src.vy, src.vx)
                  : -Math.PI / 2;
        for (let i = 0; i < a.count; i++) {
          const k = a.count > 1 ? i / (a.count - 1) - 0.5 : 0;
          const off = a.spacing ? 0 : k * a.spreadDeg * DEG;
          const jit = a.angleJitter ? this.rng.range(-a.angleJitter, a.angleJitter) * DEG : 0;
          const ang = base + off + jit;
          let sp = a.speed ?? pv;
          if (a.speedJitter) sp *= 1 + this.rng.range(-a.speedJitter, a.speedJitter);
          const sx = clamp(x + (a.spacing ? k * a.spacing * (a.count - 1) : 0), 2, WORLD_W - 3);
          this.spawnProjectile(a.projectile, sx, y - (a.lift ?? 0), Math.cos(ang) * sp, Math.sin(ang) * sp, owner, tankHit);
        }
        return;
      }
      case 'dirt':
        this.terrain.fillCircle(x, y, a.radius);
        this.fx.dirt(x, y, a.radius);
        return;
      case 'mound':
        this.terrain.addMound(x, a.width, a.height);
        this.fx.dirt(x, this.terrain.surfaceY(x), a.width / 2);
        this.fx.shake(0.3);
        return;
      case 'flatten':
        this.terrain.flatten(x, y, a.width);
        this.fx.dirt(x, y, a.width / 2);
        return;
      case 'napalm':
        for (let i = 0; i < a.count; i++) {
          const fx = clamp(x + (a.count > 1 ? (i / (a.count - 1) - 0.5) * a.spread : 0) + this.rng.range(-6, 6), 1, WORLD_W - 2);
          const life = a.duration * this.rng.range(0.75, 1);
          this.flames.push({ x: fx, y: this.groundNear(fx, y - 10, 60, 120), v: this.rng.range(-70, 70), life, maxLife: life, dps: a.dps, owner });
        }
        this.fx.napalm(x, y);
        return;
      case 'lightning':
        return this.lightning(x, y, a.radius, a.damage, owner);
      case 'quake':
        return this.quake(x, y, a.radius, a.damage, owner);
      case 'shake':
        this.fx.shake(a.amount);
        return;
    }
  }

  private lightning(x: number, y: number, radius: number, damage: number, owner: number) {
    const g = this.terrain.surfaceBelow(x, Math.min(y, WORLD_H - BEDROCK - 2) - 40);
    // The strike splits the ground: a narrow, jagged channel.
    let cx = x;
    for (let d = 0; d < 46; d += 4) {
      cx += this.rng.range(-3, 3);
      this.terrain.carveCircle(cx, g + d, 5 - d * 0.06);
    }
    this.terrain.scorch(x, g, radius * 0.8, 0.6);
    let total = 0;
    this.tanks.forEach((t, i) => {
      const dx = Math.abs(t.x - x);
      if (dx >= radius) return;
      const dmg = Math.max(1, Math.round(damage * Math.pow(1 - dx / radius, 0.5)));
      total += dmg;
      const c = tankCenter(t);
      this.applyDamage(i, dmg, owner, c.x, c.y - 18);
    });
    this.fx.lightning(x, -60, g, radius);
    if (total >= 30) this.fx.hitStop(0.18);
  }

  private quake(x: number, y: number, radius: number, damage: number, owner: number) {
    // Cracks: short zig-zag fissures fanning out from the epicentre.
    for (let c = 0; c < 7; c++) {
      let px = x + this.rng.range(-radius, radius) * 0.8;
      let py = this.terrain.surfaceBelow(px, 0) + 2;
      for (let s = 0; s < 6; s++) {
        this.terrain.carveCircle(px, py, 3.2);
        px += this.rng.range(-6, 6);
        py += this.rng.range(3, 7);
      }
    }
    let total = 0;
    this.tanks.forEach((t, i) => {
      const dx = Math.abs(t.x - x);
      if (dx >= radius || t.falling) return;
      const dmg = Math.max(1, Math.round(damage * (1 - dx / radius)));
      total += dmg;
      const c = tankCenter(t);
      this.applyDamage(i, dmg, owner, c.x, c.y - 18);
    });
    this.fx.quake(x, y, radius);
    if (total >= 30) this.fx.hitStop(0.12);
  }

  private explode(x: number, y: number, radius: number, damage: number, style: ExplosionStyle, owner: number, tankHit: number) {
    this.terrain.carveCircle(x, y, radius);
    this.terrain.scorch(x, y, radius * 1.35, style === 'ice' ? 0.15 : 0.5);
    let total = 0;
    this.tanks.forEach((t, i) => {
      const c = tankCenter(t);
      const d = i === tankHit ? 0 : Math.max(0, Math.hypot(c.x - x, c.y - y) - TANK_HIT_RADIUS * 0.7);
      if (d >= radius) return;
      const f = 1 - d / radius;
      const dmg = Math.max(1, Math.round(damage * Math.pow(f, 0.7)));
      total += dmg;
      this.applyDamage(i, dmg, owner, c.x, c.y - 18);
    });
    this.fx.explosion(x, y, radius, style, total);
    if (total >= 30) this.fx.hitStop(Math.min(0.35, 0.1 + total / 300));
  }

  applyDamage(tank: number, amount: number, owner: number, x: number, y: number, popup = true) {
    const scorer = tank === owner ? 1 - tank : owner;
    this.players[scorer].score += amount;
    this.tanks[tank].hitFlash = 1;
    if (popup) this.fx.damage(x, y, amount, this.players[scorer].color);
  }

  private stepFlames(dt: number) {
    if (!this.flames.length) return;
    const burn = this.tanks.map(() => ({ dps: 0, owner: 0 }));
    for (const f of this.flames) {
      f.life -= dt;
      const gl = this.groundNear(f.x - 3, f.y),
        gr = this.groundNear(f.x + 3, f.y);
      const sl = (gr - gl) / 6;
      f.v += sl * 260 * dt;
      f.v *= 1 - 0.9 * dt;
      f.v = clamp(f.v, -110, 110);
      const nx = clamp(f.x + f.v * dt, 1, WORLD_W - 2);
      const ny = this.groundNear(nx, f.y, 4, 60);
      if (ny < f.y - 3) f.v *= -0.3; // blocked by a wall
      else {
        f.x = nx;
        f.y = ny;
      }
      this.tanks.forEach((t, i) => {
        if (Math.abs(t.x - f.x) < TANK_HALF_WIDTH + 6 && Math.abs(t.y - f.y) < 22) {
          burn[i].dps += f.dps;
          burn[i].owner = f.owner;
        }
      });
    }
    this.flames = this.flames.filter((f) => f.life > 0);
    burn.forEach((b, i) => {
      const t = this.tanks[i];
      if (b.dps > 0) {
        const amt = Math.min(b.dps, MAX_BURN_DPS) * dt;
        t.burnAcc += amt;
        t.burnTimer += dt;
        this.applyDamage(i, amt, b.owner, 0, 0, false);
        if (t.burnTimer > 0.45 && t.burnAcc >= 1) {
          const c = tankCenter(t);
          const scorer = i === b.owner ? 1 - i : b.owner;
          this.fx.damage(c.x, c.y - 20, Math.round(t.burnAcc), this.players[scorer].color);
          t.burnAcc = 0;
          t.burnTimer = 0;
        }
      } else if (t.burnAcc >= 1) {
        const c = tankCenter(t);
        this.fx.damage(c.x, c.y - 20, Math.round(t.burnAcc), '#ffb070');
        t.burnAcc = 0;
        t.burnTimer = 0;
      }
    });
  }

  /** Highest ground under the tank's treads. */
  groundUnder(x: number, fromY: number): number {
    let g = WORLD_H;
    for (let dx = -TANK_HALF_WIDTH + 3; dx <= TANK_HALF_WIDTH - 3; dx += 3) g = Math.min(g, this.terrain.surfaceBelow(x + dx, fromY));
    return g;
  }

  tiltAt(t: Tank): number {
    const l = this.groundNear(t.x - 12, t.y, 14, 20),
      r = this.groundNear(t.x + 12, t.y, 14, 20);
    return clamp(Math.atan2(r - l, 24), -0.55, 0.55);
  }

  private stepTank(i: number, dt: number) {
    const t = this.tanks[i];
    t.hitFlash = Math.max(0, t.hitFlash - dt * 3);
    t.recoil = Math.max(0, t.recoil - dt * 5);
    if (t.moveLeft > 0 && !t.falling) {
      const step = Math.min(t.moveLeft, MOVE_SPEED * dt);
      const nx = clamp(t.x + t.moveDir * step, TANK_HALF_WIDTH + 2, WORLD_W - TANK_HALF_WIDTH - 2);
      const ng = this.groundUnder(nx, t.y - 14);
      const rise = t.y - ng;
      // pixel terrain rises in whole-pixel steps, so always allow a small step up
      if (nx === t.x || rise > Math.max(2.5, MAX_CLIMB_PER_PX * step + 0.6)) {
        t.moveLeft = 0; // blocked
        if (Math.abs(t.x - t.moveStartX) < 2) this.players[i].moves++; // didn't really move: refund
      } else {
        t.x = nx;
        if (ng <= t.y) t.y = ng;
        t.moveLeft -= step;
      }
    }
    const g = this.groundUnder(t.x, t.y - 3);
    if (g > t.y + 0.5) {
      if (!t.falling) {
        t.falling = true;
        t.fallStart = t.y;
        t.vy = 0;
      }
      t.vy += GRAVITY * 1.2 * dt;
      t.y = Math.min(t.y + t.vy * dt, g);
      if (t.y >= g) this.land(t);
    } else {
      // Small bumps under the treads lift the tank; dirt dumped on top of it buries it instead.
      if (g < t.y && t.y - g <= 4 && !this.terrain.solid(t.x, t.y - PIVOT_HEIGHT - 4)) t.y = g;
      if (t.falling) this.land(t);
    }
    t.tilt += (this.tiltAt(t) - t.tilt) * Math.min(1, dt * 10);
  }

  private land(t: Tank) {
    t.falling = false;
    if (t.y - t.fallStart > 6) this.fx.tankLand(t.x, t.y, t.vy);
    t.vy = 0;
  }

  /** Utility for UI: position of the turret pivot. */
  pivot(i: number) {
    const t = this.tanks[i];
    return { x: t.x, y: t.y - PIVOT_HEIGHT };
  }
}
