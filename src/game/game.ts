import {
  ANGLE_MAX, ANGLE_MIN, BEDROCK, DT, MAX_BURN_DPS, GRAVITY, MAX_CLIMB_PER_PX, MAX_WIND, MOVE_DISTANCE, MOVE_SPEED, MOVES_PER_GAME,
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
/** A mirrored twin flies back this many times faster sideways, so it lands well behind the shooter, not on them. */
const MIRROR_STRETCH = 2.2;

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
  charge(x: number, y: number, radius: number, time: number, color: string): void;
}

export const NullFx: Fx = {
  explosion() {}, muzzle() {}, bounce() {}, dig() {}, dirt() {}, beam() {}, damage() {}, tankLand() {}, shake() {}, hitStop() {}, napalm() {}, lightning() {}, quake() {}, charge() {},
};

export interface PlayerSetup {
  name: string;
  cpuLevel?: number; // 1..10, undefined = human
}

export interface GameOptions {
  /** Two or three players. */
  players: PlayerSetup[];
  weaponsPerPlayer: number;
  seed: number;
  themeId?: string;
  /** Pre-picked hands from a draft. Omit to deal at random. */
  hands?: string[][];
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
  /** Hit by a Brain Fog: angle and power were scrambled, and it lasts until this player's next shot. */
  dazed?: boolean;
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
  /** 0..1, how hard the tank is burning right now (drives the on-hull fire). */
  heat: number;
  /** Seconds the tank has been sliding on the ground without stopping. */
  restless: number;
  /** While > 0 the tank ignores slope and ledge forces (it has been told to sit still). */
  settled: number;
  /** 0..0.6, soot built up from burning. */
  char: number;
  recoil: number;
  /** Horizontal speed from knockback, recoil and sliding (px/s). */
  vx: number;
  /** Suspension: how far the hull is pushed down on its springs (px), and its speed. Visual only. */
  bob: number;
  bobV: number;
  /** Hull rocking angle on the suspension (radians), and its speed. Visual only. */
  pitch: number;
  pitchV: number;
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
  rubberHits?: number;
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

export const PLAYER_COLORS = ['#38c6ff', '#ff7a3d', '#d77bff', '#ffd84a'];

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
  private stillFor = 0;
  private timers: { t: number; actions: Action[]; x: number; y: number; src: Projectile | null; owner: number; tankHit: number }[] = [];
  private pendingShots: { t: number; angle: number; power: number; weapon: WeaponDef }[] = [];
  private nextId = 1;

  constructor(readonly opts: GameOptions, public fx: Fx = NullFx) {
    this.rng = new Rng(opts.seed);
    this.theme = THEMES.find((t) => t.id === opts.themeId) ?? this.rng.pick(THEMES);
    // Player 1 starts on the left and player 2 on the right; a third player takes the middle, and with
    // four, players 3 and 4 split the middle into thirds.
    const n = opts.players.length;
    const xs =
      n <= 2
        ? [this.rng.range(0.07, 0.22), this.rng.range(0.78, 0.93)]
        : n === 3
          ? [this.rng.range(0.07, 0.2), this.rng.range(0.8, 0.93), this.rng.range(0.44, 0.56)]
          : [this.rng.range(0.06, 0.15), this.rng.range(0.85, 0.94), this.rng.range(0.33, 0.41), this.rng.range(0.59, 0.67)];
    xs.forEach((f, i) => (xs[i] = Math.round(f * WORLD_W)));
    this.terrain = Terrain.generate(WORLD_W, WORLD_H, this.rng, this.theme, xs, opts.terrain);
    this.tanks = xs.map((x) => this.makeTank(x));
    this.players = opts.players.map((p, i) => ({
      name: p.name,
      color: PLAYER_COLORS[i],
      cpuLevel: p.cpuLevel,
      score: 0,
      weapons: [],
      selected: 0,
      moves: MOVES_PER_GAME,
      angle: i === 1 ? 130 : 50,
      power: 60,
    }));
    if (opts.hands) opts.hands.forEach((h, i) => (this.players[i].weapons = [...h]));
    else this.dealWeapons(opts.weaponsPerPlayer);
    this.wind = this.rollWind();
    this.current = this.rng.int(0, this.players.length - 1);
  }

  private makeTank(x: number): Tank {
    const t: Tank = { x, y: 0, vy: 0, falling: false, fallStart: 0, tilt: 0, hitFlash: 0, moveLeft: 0, moveDir: 0, moveStartX: x, burnAcc: 0, burnTimer: 0, heat: 0, char: 0, restless: 0, settled: 0, recoil: 0, vx: 0, bob: 0, bobV: 0, pitch: 0, pitchV: 0 };
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
    // Sub-munitions that burst from a tank they hit ignore it only very briefly: if they are born deep inside
    // its hull (a point-blank shot) they can't get out in time and hit it again. That is where the occasional
    // monster point-blank result comes from.
    return { terrain: this.terrain, tanks: this.tanks, wind: this.wind, owner: skip, skipTime: skip === owner ? 0.12 : 0.02, shooter: owner };
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
    // The barrel turns all the way round: 0° is right, 90° straight up, 180° left, 270° straight down.
    return [ANGLE_MIN, ANGLE_MAX];
  }

  clampAngle(a: number) {
    // whole degrees, wrapping round the full circle (360° is 0°)
    return (((Math.round(a) % 360) + 360) % 360);
  }

  private fire(): boolean {
    const p = this.player;
    const w = this.currentWeapon;
    if (!w) return false;
    p.weapons.splice(p.selected, 1);
    p.selected = clamp(p.selected, 0, Math.max(0, p.weapons.length - 1));
    this.lastWeapon = w;
    p.dazed = false;
    const fireAngle = p.angle;
    p.angle = this.clampAngle(p.angle);
    this.phase = 'flight';
    this.quiet = 0;
    const tank = this.tanks[this.current];
    tank.recoil = 1;
    if (w.beam) {
      this.kick(tank, fireAngle, 70);
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
      this.kick(tank, s.angle, s.power * (s.weapon.volley ? 0.5 : 1));
    }
  }

  /** Firing recoil: the hull dips and rocks on its springs and the tank is nudged a few px backward. */
  private kick(t: Tank, angleDeg: number, power: number) {
    const c = Math.cos(angleDeg * DEG),
      sn = Math.sin(angleDeg * DEG);
    const k = 0.4 + power / 160;
    t.bobV += 70 * k * Math.max(0.3, sn);
    t.pitchV += -c * 2.2 * k;
    if (!t.falling) t.vx -= c * (14 + power * 0.22);
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
    if (this.timers.length) {
      const due = this.timers.filter((tm) => (tm.t -= dt) <= 0);
      this.timers = this.timers.filter((tm) => tm.t > 0);
      for (const tm of due) this.runActions(tm.actions, tm.x, tm.y, tm.src ?? ({ owner: tm.owner, vx: 0, vy: 0 } as Projectile), tm.tankHit);
    }
    for (const p of this.projectiles) if (!p.dead) this.stepProjectile(p);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.stepFlames(dt);
    this.terrain.settle();
    for (let i = 0; i < this.tanks.length; i++) this.stepTank(i, dt);

    if (this.phase === 'moving') {
      const t = this.tanks[this.current];
      if (t.moveLeft <= 0 && !t.falling) this.phase = 'aim';
    } else if (this.phase === 'flight') {
      const effects = this.projectiles.length > 0 || this.flames.length > 0 || this.timers.length > 0 || this.pendingShots.length > 0 || this.terrain.settling;
      this.stillFor = effects ? 0 : this.stillFor + dt;
      // Tanks still tumbling hold the turn, but never for more than 4 s after the shot is over.
      const busy = effects || (this.stillFor < 4 && this.tanks.some((t) => t.falling || Math.abs(t.vx) > 10));
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
    // Rotate to the next player who still has weapons.
    const n = this.players.length;
    for (let k = 1; k <= n; k++) {
      const next = (this.current + k) % n;
      if (remaining[next] > 0) {
        this.current = next;
        break;
      }
    }
    this.wind = this.rollWind();
    this.phase = 'aim';
  }

  /** Index of the top scorer, or -1 when the top score is shared. */
  get winner(): number {
    const sc = this.players.map((p) => Math.round(p.score));
    const top = Math.max(...sc);
    return sc.filter((v) => v === top).length > 1 ? -1 : sc.indexOf(top);
  }

  /** Colour of the damage number: the shooter's for a hit on someone else, red for hurting yourself. */
  static readonly SELF_HIT_COLOR = '#ff5a5a';

  private stepProjectile(p: Projectile) {
    const d0 = p.def;
    if (d0.fuse !== undefined && p.age >= d0.fuse) return this.impact(p, p.x, p.mode === 'roll' ? p.y - 3 : p.y, -1);
    if (p.mode === 'fly') {
      if (d0.pull && p.age > 0.3) {
        const home = this.tanks[p.owner];
        p.vx += Math.sign(home.x - p.x) * d0.pull * DT;
      }
      if (d0.proximity && p.age > 0.25)
        for (let i = 0; i < this.tanks.length; i++) {
          if (i === p.owner) continue;
          const c = tankCenter(this.tanks[i]);
          if (Math.hypot(c.x - p.x, c.y - p.y) < d0.proximity) return this.impact(p, p.x, p.y, -1);
        }
    }
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
    if (hit.kind === 'tank') {
      if (p.def.fuse !== undefined && p.age < p.def.fuse) {
        // A timed grenade glances off a tank and keeps ticking.
        const c = tankCenter(this.tanks[hit.tank]);
        const dx = hit.x - c.x,
          dy = hit.y - c.y;
        const l = Math.hypot(dx, dy) || 1;
        const vn = (p.vx * dx + p.vy * dy) / l;
        if (vn < 0) {
          p.vx -= 1.5 * vn * (dx / l);
          p.vy -= 1.5 * vn * (dy / l);
        }
        p.x = c.x + (dx / l) * (TANK_HIT_RADIUS + 2);
        p.y = c.y + (dy / l) * (TANK_HIT_RADIUS + 2);
        this.fx.bounce(p.x, p.y, p.def.glow ?? p.def.color);
        return;
      }
      return this.impact(p, hit.x, hit.y, hit.tank);
    }
    // terrain
    const d = p.def;
    if (this.terrain.rubber(hit.x, hit.y) && !d.burrow) {
      // Rubber: everything bounces off it, losing a little speed. It doesn't use up the shot's own bounces.
      const n = this.terrain.normalAt(hit.x, hit.y);
      const vn = p.vx * n.nx + p.vy * n.ny;
      if (vn < 0) {
        p.vx -= 1.85 * vn * n.nx;
        p.vy -= 1.85 * vn * n.ny;
      }
      p.x = hit.ax + n.nx;
      p.y = hit.ay + n.ny;
      p.rubberHits = (p.rubberHits ?? 0) + 1;
      this.fx.bounce(p.x, p.y, '#5ff0d6');
      // Too slow to bounce, or caught rattling between rubber walls: stick and go off.
      if (Math.hypot(p.vx, p.vy) < 70 || p.rubberHits > 12) this.impact(p, p.x, p.y, -1);
      return;
    }
    if (p.resumeRoll) return this.enterRoll(p, hit.ax, hit.ay);
    if (p.bounces > 0) {
      // Split the velocity into the part along the surface (kept, minus friction) and the part into it
      // (reversed and scaled by restitution), so glancing hits skip and head-on hits pop straight up.
      const n = this.terrain.normalAt(hit.x, hit.y);
      const vn = p.vx * n.nx + p.vy * n.ny;
      const r = d.restitution ?? 0.7;
      const keep = 1 - (d.friction ?? 0.12);
      if (vn < 0) {
        const tx = p.vx - vn * n.nx,
          ty = p.vy - vn * n.ny;
        p.vx = tx * keep - vn * r * n.nx;
        p.vy = ty * keep - vn * r * n.ny;
      }
      p.bounces--;
      p.x = hit.ax + n.nx;
      p.y = hit.ay + n.ny;
      this.fx.bounce(p.x, p.y, d.glow ?? d.color);
      if (d.onBounce) this.runActions(d.onBounce, p.x, p.y, p, -1);
      if (Math.hypot(p.vx, p.vy) < 25) {
        if (d.roll || d.fuse !== undefined) this.enterRoll(p, p.x, p.y);
        else this.impact(p, p.x, p.y, -1);
      }
      return;
    }
    if (d.roll || d.crawl || d.fuse !== undefined) return this.enterRoll(p, hit.ax, hit.ay);
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
    if (p.def.crawl) p.bdx = Math.sign(p.vx || p.rollV || 1); // drive on in the direction it was flying
    this.fx.bounce(p.x, p.y, p.def.glow ?? p.def.color);
  }

  private stepRoll(p: Projectile) {
    const dt = DT;
    p.rollTime += dt;
    p.age += dt;
    const gl = this.groundNear(p.x - 3, p.y),
      gr = this.groundNear(p.x + 3, p.y);
    const sl = (gr - gl) / 6;
    const crawl = p.def.crawl;
    if (crawl) p.rollV = p.bdx * crawl.speed;
    else {
      p.rollV += (GRAVITY * sl) / Math.sqrt(1 + sl * sl) * dt * 0.9;
      p.rollV *= 1 - 0.5 * dt;
    }
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
      const maxClimb = 2 + Math.abs(nx - p.x) * (crawl ? 6 : 2.5);
      let k = 1;
      while (k <= maxClimb && t.solid(nx, p.y - k)) k++;
      if (k > maxClimb) {
        if (t.rubber(nx, p.y - 2)) {
          p.rollV *= -0.8; // rolled into rubber: springs back
          return;
        }
        if (p.def.fuse !== undefined) {
          p.rollV *= -0.4; // a fused grenade bounces off the wall and keeps ticking
          return;
        }
        return this.impact(p, p.x, p.y - 3, -1); // wall
      }
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
    if (p.def.fuse !== undefined) {
      if (Math.abs(p.rollV) < 4) p.rollV = 0; // rests until the fuse runs out
      return;
    }
    if (crawl) {
      if (p.rollTime > crawl.time) this.impact(p, p.x, p.y - 3, -1);
      return;
    }
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
    if (this.terrain.rubber(p.x, p.y)) return this.impact(p, p.x - p.bdx * 4, p.y - p.bdy * 4, -1); // can't drill rubber
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
              : a.direction === 'mirror'
                ? (src ? Math.atan2(src.vy, -src.vx * MIRROR_STRETCH) : -Math.PI / 2)
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
          let sp = a.speed ?? (a.direction === 'mirror' && src ? Math.hypot(src.vx * MIRROR_STRETCH, src.vy) : pv);
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
      case 'teleport': {
        const t = this.tanks[owner];
        const from = tankCenter(t);
        t.x = clamp(x, TANK_HALF_WIDTH + 2, WORLD_W - TANK_HALF_WIDTH - 2);
        t.y = Math.max(PIVOT_HEIGHT + 2, Math.min(y, this.terrain.surfaceBelow(t.x, Math.max(0, y - 30))) - 2);
        t.vx = t.vy = 0;
        t.falling = true;
        t.fallStart = t.y;
        t.moveLeft = 0;
        t.bobV += 120;
        this.fx.explosion(from.x, from.y, 26, 'plasma', 0);
        this.fx.explosion(t.x, t.y - 12, 30, 'plasma', 0);
        return;
      }
      case 'push':
        return this.knockback(x, y, a.radius, a.strength);
      case 'dome': {
        const g = this.terrain.surfaceBelow(x, Math.max(0, y - 20));
        for (let k = 0; k <= 60; k++) {
          const ang = Math.PI + (k / 60) * Math.PI;
          this.terrain.fillCircle(x + Math.cos(ang) * a.radius, g + 4 + Math.sin(ang) * a.radius, a.thickness / 2, false);
        }
        this.fx.dirt(x, g - a.radius, a.radius * 0.6);
        this.fx.shake(0.25);
        return;
      }
      case 'lottery':
        return this.runActions(this.rng.next() < a.chance ? a.hit : a.miss, x, y, src, tankHit);
      case 'random':
        return this.runActions(this.rng.pick(a.options), x, y, src, tankHit);
      case 'shake':
        this.fx.shake(a.amount);
        return;
      case 'delay':
        this.timers.push({ t: a.time, actions: a.actions, x, y, src, owner, tankHit });
        return;
      case 'charge':
        this.fx.charge(x, y, a.radius, a.time, a.color);
        return;
      case 'steal':
        return this.steal(x, y, a.radius, a.points, owner);
      case 'swap':
        return this.swap(x, y, a.radius, owner);
      case 'rubber': {
        const g = this.terrain.surfaceBelow(x, Math.max(0, y - 30));
        if (a.shape === 'wall') this.terrain.addRubber(x - a.width / 2, g - a.height, x + a.width / 2, g + 6);
        else
          for (let xx = Math.floor(x - a.width / 2); xx <= x + a.width / 2; xx++) {
            const s = this.terrain.surfaceBelow(xx, Math.max(0, g - 80));
            if (s < WORLD_H - BEDROCK) this.terrain.addRubber(xx, s, xx, s + a.height);
          }
        this.fx.bounce(x, g, '#5ff0d6');
        this.fx.dirt(x, g, 18);
        this.fx.shake(0.2);
        return;
      }
      case 'scramble': {
        this.tanks.forEach((t, i) => {
          if (i === owner) return;
          const c = tankCenter(t);
          if (Math.hypot(c.x - x, c.y - y) > a.radius + TANK_HIT_RADIUS) return;
          const pl = this.players[i];
          pl.angle = this.clampAngle(this.rng.range(0, 360));
          pl.power = Math.round(this.rng.range(15, 100));
          pl.dazed = true;
          this.fx.charge(c.x, c.y - 10, 40, 0.5, '#ff7ae6');
        });
        this.fx.explosion(x, y, 20, 'plasma', 0);
        return;
      }
      case 'column':
        return this.column(x, y, a.width, a.damage, a.depth, a.color, owner);
    }
  }

  private steal(x: number, y: number, radius: number, points: number, owner: number) {
    const me = tankCenter(this.tanks[owner]);
    let got = 0;
    this.tanks.forEach((t, i) => {
      if (i === owner) return;
      const c = tankCenter(t);
      if (Math.hypot(c.x - x, c.y - y) > radius + TANK_HIT_RADIUS) return;
      const v = this.players[i];
      const lost = points; // can push them below zero
      v.score -= lost;
      got += lost;
      t.hitFlash = 1;
      this.fx.damage(c.x, c.y - 18, -lost, '#ffd84a');
      this.fx.beam(c.x, c.y, me.x, me.y, '#ffd84a', 3);
    });
    if (got > 0) {
      this.players[owner].score += got;
      this.fx.damage(me.x, me.y - 24, got, this.players[owner].color);
    }
    this.fx.explosion(x, y, 14, 'small', 0);
  }

  private swap(x: number, y: number, radius: number, owner: number) {
    let best = -1,
      bd = radius;
    this.tanks.forEach((t, i) => {
      if (i === owner) return;
      const d = Math.hypot(t.x - x, t.y - 12 - y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    this.fx.explosion(x, y, 18, 'plasma', 0);
    if (best < 0) return;
    const a = this.tanks[owner],
      b = this.tanks[best];
    const ca = tankCenter(a),
      cb = tankCenter(b);
    [a.x, b.x] = [b.x, a.x];
    [a.y, b.y] = [b.y, a.y];
    for (const t of [a, b]) {
      t.vx = 0;
      t.vy = 0;
      t.moveLeft = 0;
      t.falling = true;
      t.fallStart = t.y;
      t.bobV += 140;
    }
    this.fx.beam(ca.x, ca.y, cb.x, cb.y, '#c9a6ff', 4);
    this.fx.explosion(ca.x, ca.y, 26, 'plasma', 0);
    this.fx.explosion(cb.x, cb.y, 26, 'plasma', 0);
  }

  private column(x: number, y: number, width: number, damage: number, depth: number, color: string, owner: number) {
    const g = this.terrain.surfaceBelow(x, 0);
    for (let d = -width / 2; d < depth; d += width * 0.35) this.terrain.carveCircle(x, g + d, width / 2);
    this.terrain.scorch(x, g, width * 1.2, 0.7);
    let total = 0;
    this.tanks.forEach((t, i) => {
      const dx = Math.abs(t.x - x);
      const reach = width / 2 + TANK_HALF_WIDTH;
      if (dx >= reach) return;
      const dmg = Math.max(1, Math.round(damage * (1 - (dx / reach) * 0.5)));
      total += dmg;
      const c = tankCenter(t);
      this.applyDamage(i, dmg, owner, c.x, c.y - 18);
    });
    this.knockback(x, g, width);
    this.fx.beam(x, -40, x, g + depth * 0.6, color, width * 0.45);
    this.fx.explosion(x, g, width, 'plasma', total);
    if (total >= 30) this.fx.hitStop(0.2);
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
    // Measure cover before the crater opens, so a shelter protects against the blast that breaks it.
    const covers = this.tanks.map((t, i) => (i === tankHit ? 1 : this.cover(x, y, tankCenter(t).x, tankCenter(t).y)));
    this.terrain.carveCircle(x, y, radius);
    this.terrain.scorch(x, y, radius * 1.35, style === 'ice' ? 0.15 : 0.5);
    let total = 0;
    this.tanks.forEach((t, i) => {
      const c = tankCenter(t);
      // Splash reaches well past the crater edge, so a near miss still does real damage.
      const reach = radius * 1.5 + 10;
      const d = i === tankHit ? 0 : Math.max(0, Math.hypot(c.x - x, c.y - y) - TANK_HIT_RADIUS * 0.8);
      if (d >= reach) return;
      const f = 1 - d / reach;
      // Ground between the blast and the tank soaks up the splash: shelters really shelter.
      const cover = covers[i];
      if (cover <= 0) return;
      const dmg = Math.max(1, Math.round(damage * Math.pow(f, 0.55) * cover));
      total += dmg;
      this.applyDamage(i, dmg, owner, c.x, c.y - 18);
    });
    this.knockback(x, y, radius);
    this.fx.explosion(x, y, radius, style, total);
    if (total >= 30) this.fx.hitStop(Math.min(0.35, 0.1 + total / 300));
  }

  /** Share of a blast that gets through to a point: each solid pixel on the way (rubber counts double) blocks 5%. */
  private cover(x0: number, y0: number, x1: number, y1: number) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    let blocked = 0;
    for (let s = 3; s < len - TANK_HIT_RADIUS * 0.6; s += 1) {
      const px = x0 + ((x1 - x0) * s) / len,
        py = y0 + ((y1 - y0) * s) / len;
      if (this.terrain.solid(px, py)) blocked += this.terrain.rubber(px, py) ? 2 : 1;
    }
    return Math.max(0, 1 - blocked * 0.05);
  }

  /**
   * Blast push: tanks near an explosion are thrown up and away from it, then bounce and slide to rest.
   * Strength grows with blast size and closeness but is capped, so a tank is shoved tens of px, not across the map.
   */
  private knockback(x: number, y: number, radius: number, strength?: number) {
    for (const t of this.tanks) {
      const c = tankCenter(t);
      const dx = c.x - x,
        dy = c.y - y;
      const d = Math.hypot(dx, dy);
      const reach = strength === undefined ? radius * 1.4 + TANK_HIT_RADIUS : radius;
      if (d >= reach) continue;
      const f = 1 - d / reach;
      if (strength !== undefined && strength < 0) {
        // Pull: drag toward the point along the ground, with a small hop to unstick it.
        t.vx += Math.sign(-dx) * Math.min(Math.abs(dx) * 2.2, -strength * (0.4 + 0.6 * f));
        if (!t.falling) {
          t.falling = true;
          t.fallStart = t.y;
          t.vy = 0;
        }
        t.vy = Math.min(t.vy, 0) - 90 * f;
        t.pitchV -= Math.sign(dx) * 4 * f;
        continue;
      }
      const sp = strength === undefined ? Math.min(240, (40 + radius * 1.5) * f) : strength * (0.3 + 0.7 * f);
      const side = Math.abs(dx) < 2 ? 0 : Math.sign(dx);
      // Mostly upward (the blast lifts the hull), partly sideways.
      t.vx += side * sp * (0.5 + 0.4 * Math.min(1, Math.abs(dx) / (d + 1)));
      const up = sp * (0.55 + 0.35 * Math.max(0, -dy / (d + 1)));
      if (up > 50) {
        if (!t.falling) {
          t.falling = true;
          t.fallStart = t.y;
          t.vy = 0;
        }
        t.vy = Math.min(t.vy, 0) - up;
      }
      t.bobV += 160 * f;
      t.pitchV += side * 6 * f;
    }
  }

  applyDamage(tank: number, amount: number, owner: number, x: number, y: number, popup = true) {
    if (popup) this.tanks[tank].hitFlash = 1;
    if (tank === owner) {
      // Hurting yourself costs you the damage in points, but a score never drops below 0.
      // Hurting yourself costs the same points it would have earned; scores can go below zero.
      this.players[tank].score -= amount;
      if (popup) this.fx.damage(x, y, -amount, Game.SELF_HIT_COLOR);
      return;
    }
    this.players[owner].score += amount;
    if (popup) this.fx.damage(x, y, amount, this.players[owner].color);
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
        t.heat = Math.min(1, t.heat + dt * 6);
        t.char = Math.min(0.6, t.char + dt * 0.12);
        t.burnAcc += amt;
        t.burnTimer += dt;
        this.applyDamage(i, amt, b.owner, 0, 0, false);
        if (t.burnTimer > 0.45 && t.burnAcc >= 1) {
          const c = tankCenter(t);
          const self = i === b.owner;
          this.fx.damage(c.x, c.y - 20, (self ? -1 : 1) * Math.round(t.burnAcc), self ? Game.SELF_HIT_COLOR : this.players[b.owner].color);
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
    t.heat = Math.max(0, t.heat - dt * 1.5);
    t.recoil = Math.max(0, t.recoil - dt * 4);
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
        t.pitchV += (t.moveDir * 0.6 - t.pitch) * dt * 4; // lean into the drive
      }
    }

    // Sideways motion from knockback, recoil and sliding.
    if (t.moveLeft <= 0) this.slide(t, dt);
    // Anti-jitter: a tank that keeps creeping about on the ground is made to sit still for a while.
    t.settled = Math.max(0, t.settled - dt);
    if (!t.falling && t.vx !== 0) t.restless += dt;
    else if (!t.falling) t.restless = Math.max(0, t.restless - dt * 2);
    if (t.restless > 1.2) {
      t.vx = 0;
      t.restless = 0;
      t.settled = 3;
    }

    const g = this.groundUnder(t.x, t.y - 3);
    if (t.falling && t.vy < 0) {
      // Thrown upward: rise until gravity turns it round. Hitting an overhang stops the climb.
      t.vy += GRAVITY * 1.2 * dt;
      const ny = t.y + t.vy * dt;
      if (this.terrain.solid(t.x, ny - PIVOT_HEIGHT - 6)) t.vy = 0;
      else t.y = Math.max(ny, PIVOT_HEIGHT + 2);
    } else if (g > t.y + 0.5) {
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
    t.tilt += (this.tiltAt(t) - t.tilt) * Math.min(1, dt * (t.falling ? 3 : 10));

    // Suspension springs (visual): under-damped so the hull settles with a little wobble.
    t.bobV += (-170 * t.bob - 11 * t.bobV) * dt;
    t.bob = clamp(t.bob + t.bobV * dt, -3, 6);
    t.pitchV += (-140 * t.pitch - 9 * t.pitchV) * dt;
    t.pitch = clamp(t.pitch + t.pitchV * dt, -0.22, 0.22);
  }

  /** Horizontal motion: ground friction, sliding down steep slopes, and bumping into walls. */
  private slide(t: Tank, dt: number) {
    if (!t.falling) {
      const l = this.groundNear(t.x - 12, t.y, 14, 24),
        r = this.groundNear(t.x + 12, t.y, 14, 24);
      const ang = Math.atan2(r - l, 24); // >0: ground falls away to the right
      const STEEP = 0.8; // ~46°: tracks hold on anything gentler
      if (Math.abs(ang) > STEEP && t.settled <= 0) t.vx += Math.sign(ang) * GRAVITY * (Math.sin(Math.abs(ang)) - Math.sin(STEEP)) * 1.4 * dt;
      // Perched on a lip: if only one end of the treads touches ground, the tank tips off toward the drop.
      let n = 0,
        sum = 0;
      for (let dx = -TANK_HALF_WIDTH + 3; dx <= TANK_HALF_WIDTH - 3; dx += 3)
        if (this.terrain.surfaceBelow(t.x + dx, t.y - 3) <= t.y + 2) {
          n++;
          sum += dx;
        }
      // Only when the middle of the tank (its centre of mass) hangs over a real drop.
      const perched = t.settled <= 0 && n > 0 && Math.abs(sum / n) > TANK_HALF_WIDTH * 0.5 && this.terrain.surfaceBelow(t.x, t.y - 3) > t.y + 10;
      if (perched) t.vx -= Math.sign(sum) * GRAVITY * 0.35 * dt;
      t.vx *= Math.max(0, 1 - 8 * dt); // tread friction
      if (Math.abs(t.vx) < 6 && (Math.abs(ang) <= STEEP || t.settled > 0) && !perched) t.vx = 0;
    } else t.vx *= Math.max(0, 1 - 0.3 * dt); // a little air drag
    if (t.vx === 0) return;
    const nx = clamp(t.x + t.vx * dt, TANK_HALF_WIDTH + 2, WORLD_W - TANK_HALF_WIDTH - 2);
    if (nx === t.x) {
      t.vx = 0;
      return;
    }
    const ng = this.groundUnder(nx, t.y - 14);
    const rise = t.y - ng;
    if (rise > (t.falling ? 2 : Math.max(3, Math.abs(nx - t.x) * MAX_CLIMB_PER_PX + 1))) {
      // Wall: a flying tank bounces off it softly; a grounded one just stops.
      t.pitchV += Math.sign(t.vx) * 1.5;
      t.vx = t.falling ? t.vx * -0.3 : 0;
      return;
    }
    t.x = nx;
    if (!t.falling && ng < t.y) t.y = ng;
  }

  private land(t: Tank) {
    const impact = t.vy;
    if (impact > 260) {
      // Hard landing: bounce back up a little, losing most of the energy.
      t.vy = -impact * 0.28;
      t.vx *= 0.7;
      t.bobV += impact * 0.25;
      this.fx.tankLand(t.x, t.y, impact);
      return;
    }
    t.falling = false;
    if (t.y - t.fallStart > 6 || impact > 120) this.fx.tankLand(t.x, t.y, impact);
    t.bobV += impact * 0.25;
    t.pitchV += t.vx * 0.01;
    t.vy = 0;
  }

  /** Utility for UI: position of the turret pivot. */
  pivot(i: number) {
    const t = this.tanks[i];
    return { x: t.x, y: t.y - PIVOT_HEIGHT };
  }
}
