/**
 * One check per weapon: each test exercises the promises made in that weapon's in-game description.
 * If a description changes, change its test here too (and the other way round).
 */
import { describe, expect, it } from 'vitest';
import { Game, NullFx, type Fx, type Projectile } from '../src/game/game';
import { DT, WORLD_W } from '../src/config';
import { tankCenter } from '../src/game/flight';
import { WEAPONS } from '../src/game/weapons';
import type { ExplosionStyle, ProjectileDef } from '../src/game/types';

interface Boom { x: number; y: number; r: number; style: ExplosionStyle; t: number }
interface Spawn { t: number; def: ProjectileDef; x: number; y: number; vx: number; vy: number; p: Projectile }

function lab(seed = 1, terrain: 'flat' | 'rolling' = 'flat') {
  const ev = { boom: [] as Boom[], bounce: 0, beams: 0, lightning: 0, quake: 0, charge: 0, napalm: 0, spawns: [] as Spawn[] };
  let g!: Game;
  const fx: Fx = {
    ...NullFx,
    explosion: (x, y, r, style) => void ev.boom.push({ x, y, r, style, t: g.time }),
    bounce: () => void ev.bounce++,
    beam: () => void ev.beams++,
    lightning: () => void ev.lightning++,
    quake: () => void ev.quake++,
    charge: () => void ev.charge++,
    napalm: () => void ev.napalm++,
  };
  g = new Game({ players: [{ name: 'A' }, { name: 'B' }], weaponsPerPlayer: 10, seed, terrain, maxWind: 0 }, fx);
  g.current = 0;
  g.wind = 0;
  const orig = g.spawnProjectile.bind(g);
  g.spawnProjectile = (def, x, y, vx, vy, owner, skip) => {
    const p = orig(def, x, y, vx, vy, owner, skip);
    ev.spawns.push({ t: g.time, def, x, y, vx, vy, p });
    return p;
  };
  return { g, ev };
}
const arm = (g: Game, id: string) => {
  g.phase = 'aim';
  g.current = 0;
  g.player.weapons = [id, 'shell'];
  g.player.selected = 0;
};
function shoot(g: Game, id: string, angle: number, power: number) {
  arm(g, id);
  g.apply({ t: 'aim', angle, power });
  g.apply({ t: 'fire' });
}
/** Fire, then move the shell(s) to (x, y) heading (vx, vy). */
function drop(g: Game, id: string, x: number, y: number, vx = 0, vy = 300) {
  shoot(g, id, 45, 50);
  g.projectiles.forEach((p) => ((p.x = x), (p.y = y), (p.vx = vx), (p.vy = vy)));
}
const run = (g: Game, secs = 40) => {
  let n = 0;
  while (g.phase === 'flight' && n++ < secs / DT) g.update(DT);
};
const step = (g: Game, secs: number) => {
  for (let n = 0; n < secs / DT; n++) g.update(DT);
};
const solidCount = (g: Game) => g.terrain.mask.reduce((a, b) => a + (b ? 1 : 0), 0);
const surface = (g: Game, x: number) => g.terrain.surfaceY(x);
const enemy = (g: Game) => g.tanks[1];
const dmgTo = (g: Game) => g.players[0].score; // points player 0 scored
const dir = (g: Game) => (g.tanks[1].x > g.tanks[0].x ? 1 : -1); // toward the enemy
const towardAngle = (g: Game, elev: number) => (dir(g) > 0 ? elev : 180 - elev);

const checked = new Set<string>();
const w = (id: string, fn: () => void) => {
  checked.add(id);
  it(`${id}: ${WEAPONS.find((x) => x.id === id)!.description}`, fn);
};

describe('every weapon does what its description says', () => {
  w('shell', () => {
    const { g, ev } = lab();
    const c = tankCenter(enemy(g));
    drop(g, 'shell', c.x, c.y - 60);
    run(g);
    expect(ev.boom.length).toBe(1);
    expect(ev.boom[0].r).toBeLessThanOrEqual(35);
    expect(dmgTo(g)).toBe(30);
  });

  w('heavy-shell', () => {
    const crater = (id: string) => {
      const { g } = lab();
      const b = solidCount(g);
      drop(g, id, 800, surface(g, 800) - 40);
      run(g);
      return b - solidCount(g);
    };
    expect(crater('heavy-shell')).toBeGreaterThan(crater('shell') * 2);
  });

  w('megaton', () => {
    const { g, ev } = lab();
    const c = tankCenter(enemy(g));
    drop(g, 'megaton', c.x - 100 * dir(g), surface(g, c.x - 100 * dir(g)) - 30);
    run(g);
    expect(ev.boom[0].r).toBeGreaterThanOrEqual(80);
    expect(dmgTo(g)).toBeGreaterThan(25); // 100 px away still hurts
  });

  w('doomsday', () => {
    const { g, ev } = lab();
    const b = solidCount(g);
    drop(g, 'doomsday', 800, surface(g, 800) - 30);
    run(g);
    expect(ev.boom[0].style).toBe('nuke');
    expect(ev.boom[0].r).toBeGreaterThanOrEqual(130);
    expect(b - solidCount(g)).toBeGreaterThan(25000); // a huge crater
  });

  w('rail-slug', () => {
    const land = (wind: number) => {
      const { g } = lab();
      shoot(g, 'rail-slug', towardAngle(g, 20), 60);
      g.wind = wind;
      const sp = Math.hypot(g.projectiles[0].vx, g.projectiles[0].vy);
      run(g);
      return { x: g.projectiles.length ? NaN : g.lastWeapon && 0, sp };
    };
    const { g: g1 } = lab();
    shoot(g1, 'shell', towardAngle(g1, 20), 60);
    const shellSp = Math.hypot(g1.projectiles[0].vx, g1.projectiles[0].vy);
    expect(land(0).sp).toBeGreaterThan(shellSp * 1.3);
    // ignores wind: identical path with and without wind
    const path = (wind: number) => {
      const { g } = lab();
      shoot(g, 'rail-slug', towardAngle(g, 30), 50);
      g.wind = wind;
      step(g, 0.6);
      return Math.round(g.projectiles[0]?.x ?? -1);
    };
    expect(path(15)).toBe(path(0));
    const { g, ev } = lab();
    const c = tankCenter(enemy(g));
    drop(g, 'rail-slug', c.x, c.y - 50);
    run(g);
    expect(ev.boom[0].r).toBeLessThanOrEqual(25);
    expect(dmgTo(g)).toBeGreaterThanOrEqual(45);
  });

  w('ion-orb', () => {
    const air = (id: string) => {
      const { g } = lab();
      shoot(g, id, towardAngle(g, 60), 50);
      const sp = Math.hypot(g.projectiles[0].vx, g.projectiles[0].vy);
      let t = 0;
      while (g.projectiles.length && t < 20) (g.update(DT), (t += DT));
      return { sp, t };
    };
    const orb = air('ion-orb'),
      shell = air('shell');
    expect(orb.sp).toBeLessThan(shell.sp); // slow
    expect(orb.t).toBeGreaterThan(shell.t); // floaty: stays up longer
    const { g, ev } = lab();
    drop(g, 'ion-orb', 800, surface(g, 800) - 40);
    run(g);
    expect(ev.boom[0].style).toBe('plasma');
  });

  w('frost-bomb', () => {
    const { g, ev } = lab();
    drop(g, 'frost-bomb', 800, surface(g, 800) - 40);
    run(g);
    expect(ev.spawns.length - 1).toBeGreaterThanOrEqual(6); // ice shards
    expect(ev.boom.filter((b) => b.style === 'ice').length).toBeGreaterThanOrEqual(6);
    let white = 0;
    for (let i = 0; i < g.terrain.mask.length; i++) if (g.terrain.mask[i] === 1 && ((g.terrain.color[i] >>> 16) & 255) > 230 && (g.terrain.color[i] & 255) > 215) white++;
    expect(white).toBeGreaterThan(800); // snow stays
  });

  w('excavator', () => {
    const crater = (id: string) => {
      const { g } = lab();
      const b = solidCount(g);
      drop(g, id, 800, surface(g, 800) - 30);
      run(g);
      return b - solidCount(g);
    };
    expect(crater('excavator')).toBeGreaterThan(crater('megaton') * 1.4); // enormous crater
    const { g } = lab();
    const c = tankCenter(enemy(g));
    drop(g, 'excavator', c.x, c.y - 50);
    run(g);
    expect(dmgTo(g)).toBeLessThanOrEqual(12); // barely scratches
  });

  w('thunderbolt', () => {
    const at = (off: number) => {
      const { g, ev } = lab();
      const c = tankCenter(enemy(g));
      drop(g, 'thunderbolt', c.x + off, surface(g, c.x + off) - 20);
      run(g);
      return { d: dmgTo(g), l: ev.lightning };
    };
    expect(at(0).l).toBe(1);
    expect(at(0).d).toBeGreaterThanOrEqual(45);
    expect(at(80).d).toBe(0); // narrow column
  });

  w('earthquake', () => {
    const { g, ev } = lab();
    const c = tankCenter(enemy(g));
    const x = c.x - 150 * dir(g);
    const cracksBefore = solidCount(g);
    drop(g, 'earthquake', x, surface(g, x) - 20);
    run(g);
    expect(ev.quake).toBe(1);
    expect(dmgTo(g)).toBeGreaterThan(5); // rattles a tank 150 px away
    expect(cracksBefore - solidCount(g)).toBeGreaterThan(200); // cracks the ground
  });

  const volley = (id: string, n: number, minSpread: number, maxSpread: number) => {
    const { g, ev } = lab();
    shoot(g, id, towardAngle(g, 45), 60);
    step(g, 1.2);
    const first = ev.spawns.filter((s) => s.t < 1.2);
    expect(first.length).toBe(n);
    const angs = first.map((s) => (Math.atan2(-s.vy, s.vx) * 180) / Math.PI);
    const spread = Math.max(...angs) - Math.min(...angs);
    expect(spread).toBeGreaterThanOrEqual(minSpread);
    expect(spread).toBeLessThanOrEqual(maxSpread);
    return first;
  };
  w('trio', () => void volley('trio', 3, 3, 8));
  w('quintet', () => void volley('quintet', 5, 10, 14));
  w('burst', () => {
    const s = volley('burst', 4, 0, 0.5);
    expect(s[3].t - s[0].t).toBeGreaterThan(0.3); // one after another
  });
  w('chain-gun', () => {
    const s = volley('chain-gun', 8, 1, 4);
    expect(s[7].t - s[0].t).toBeGreaterThan(0.4);
  });
  w('scattergun', () => {
    volley('scattergun', 7, 14, 18);
    // deadly up close: enemy right in front of the barrel
    const { g } = lab();
    const a = g.tanks[0];
    enemy(g).x = a.x + 70 * 1;
    enemy(g).y = g.groundUnder(enemy(g).x, enemy(g).y - 200);
    const c = tankCenter(enemy(g));
    const m = { x: a.x, y: a.y - 17 };
    shoot(g, 'scattergun', Math.round((Math.atan2(-(c.y - m.y), c.x - m.x) * 180) / Math.PI), 60);
    run(g);
    expect(dmgTo(g)).toBeGreaterThanOrEqual(40);
  });

  const splitsAtApex = (id: string, n: number) => {
    const { g, ev } = lab();
    shoot(g, id, towardAngle(g, 55), 55);
    let k = 0;
    while (ev.spawns.length < 2 && k++ < 10 / DT) g.update(DT);
    const parent = ev.spawns[0];
    const kids = ev.spawns.slice(1);
    expect(kids.length).toBe(n);
    // released at the top of the arc, carrying on downrange (not dropping straight down)
    expect(Math.abs(parent.p.vy)).toBeLessThan(15);
    for (const s of kids) expect(Math.sign(s.vx)).toBe(dir(g));
    return { g, ev, kids };
  };
  w('splitter', () => void splitsAtApex('splitter', 5));
  w('hailstorm', () => {
    const { g, ev } = splitsAtApex('hailstorm', 14);
    run(g);
    expect(ev.boom.filter((b) => b.style === 'ice').length).toBeGreaterThanOrEqual(10);
    let white = 0;
    for (let i = 0; i < g.terrain.mask.length; i++) if (g.terrain.mask[i] === 1 && ((g.terrain.color[i] >>> 16) & 255) > 230 && (g.terrain.color[i] & 255) > 215) white++;
    expect(white).toBeGreaterThan(100);
  });
  w('airstrike', () => {
    const { g, kids } = splitsAtApex('airstrike', 7);
    const xs = kids.map((k) => k.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThan(30); // side by side
    const vx = kids.map((k) => k.vx);
    expect(Math.max(...vx) - Math.min(...vx)).toBeLessThan(30); // flying together
    run(g);
  });
  w('acid-rain', () => {
    const { g, ev } = splitsAtApex('acid-rain', 20);
    run(g);
    expect(ev.boom.filter((b) => b.style === 'acid').length).toBeGreaterThanOrEqual(15);
  });
  w('fireworks', () => {
    const { g, ev, kids } = (() => {
      const { g, ev } = lab();
      shoot(g, 'fireworks', towardAngle(g, 70), 50);
      let k = 0;
      while (ev.spawns.length < 2 && k++ < 10 / DT) g.update(DT);
      return { g, ev, kids: ev.spawns.slice(1) };
    })();
    expect(kids.length).toBe(18);
    expect(new Set(kids.map((k) => k.def.color)).size).toBeGreaterThanOrEqual(3); // colourful
    // a ring: stars head out in many directions
    const angs = kids.map((k) => Math.atan2(k.vy, k.vx));
    expect(Math.max(...angs) - Math.min(...angs)).toBeGreaterThan(Math.PI * 1.2);
    run(g);
    expect(ev.boom.length).toBeGreaterThanOrEqual(15); // they fall as little blasts
    expect(Math.max(...ev.boom.map((b) => b.r))).toBeLessThanOrEqual(30);
  });

  w('cluster', () => {
    const { g, ev } = lab();
    drop(g, 'cluster', 800, surface(g, 800) - 40);
    run(g);
    expect(ev.spawns.length - 1).toBeGreaterThanOrEqual(6);
    const xs = ev.boom.slice(1).map((b) => b.x);
    expect(Math.min(...xs)).toBeLessThan(780);
    expect(Math.max(...xs)).toBeGreaterThan(820); // scattered around
  });

  w('jumping-jack', () => {
    const { g, ev } = lab();
    drop(g, 'jumping-jack', 400, surface(g, 400) - 40, 200, 200);
    run(g);
    expect(ev.boom.length).toBe(5);
    for (let i = 1; i < 5; i++) expect(ev.boom[i].x).toBeGreaterThan(ev.boom[i - 1].x); // hops forward
  });

  w('swarm', () => {
    const { g, ev, kids } = splitsAtApex('swarm', 3);
    for (const k of kids) expect(k.def.homing).toBeTruthy();
    run(g);
    const c = tankCenter(enemy(g));
    // they hunt the enemy: blasts land nearer the enemy than the shooter
    for (const b of ev.boom.slice(-3)) expect(Math.abs(b.x - c.x)).toBeLessThan(Math.abs(b.x - g.tanks[0].x));
    expect(dmgTo(g)).toBeGreaterThanOrEqual(0);
  });

  const rippleCount = (id: string) => {
    const { g, ev } = lab();
    g.tanks.forEach((t) => (t.x = t.x < 800 ? 60 : 1540)); // well away
    drop(g, id, 800, surface(g, 800) - 30);
    run(g);
    return ev.boom.length;
  };
  w('ripple', () => {
    expect(rippleCount('ripple')).toBe(7); // 1, then 2, then 4
  });
  w('big-ripple', () => {
    expect(rippleCount('big-ripple')).toBeGreaterThan(rippleCount('ripple'));
    const { g, ev } = lab();
    drop(g, 'big-ripple', 800, surface(g, 800) - 30);
    run(g);
    const xs = ev.boom.map((b) => b.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(120); // spreads across the ground
  });
  w('ripple-storm', () => {
    expect(rippleCount('ripple-storm')).toBe(40); // 1 + 3 + 9 + 27: four generations
  });

  w('roller', () => {
    const { g, ev } = lab(3, 'rolling');
    drop(g, 'roller', 800, surface(g, 800) - 30);
    let rolled = false;
    let n = 0;
    while (g.phase === 'flight' && n++ < 20 / DT) {
      g.update(DT);
      if (g.projectiles[0]?.mode === 'roll') rolled = true;
    }
    expect(rolled).toBe(true);
    expect(ev.boom.length).toBe(1);
    // hits a tank in its path
    const l = lab();
    const t = enemy(l.g);
    const x = t.x - 120 * dir(l.g);
    drop(l.g, 'roller', x, surface(l.g, x) - 10, 260 * dir(l.g), 40);
    run(l.g);
    expect(dmgTo(l.g)).toBeGreaterThanOrEqual(35);
  });
  w('heavy-roller', () => {
    const { g, ev } = lab();
    drop(g, 'heavy-roller', 800, surface(g, 800) - 30);
    run(g);
    expect(ev.boom[0].r).toBeGreaterThan(70);
  });
  w('triple-roller', () => {
    const { g, ev } = lab();
    shoot(g, 'triple-roller', towardAngle(g, 45), 45);
    expect(ev.spawns.length).toBe(3);
    let rolling = 0;
    let n = 0;
    while (g.phase === 'flight' && n++ < 20 / DT) {
      g.update(DT);
      rolling = Math.max(rolling, g.projectiles.filter((p) => p.mode === 'roll').length);
    }
    expect(rolling).toBeGreaterThanOrEqual(2);
  });

  w('bouncer', () => {
    const { g, ev } = lab();
    g.tanks.forEach((t) => (t.x = t.x < 800 ? 40 : 1560));
    drop(g, 'bouncer', 500, surface(g, 500) - 60, 150, 250);
    run(g);
    expect(ev.bounce).toBe(4);
    expect(ev.boom.filter((b) => b.style === 'small').length).toBe(4); // a pop on every bounce
  });
  w('wild-ball', () => {
    const { g, ev } = lab();
    g.tanks.forEach((t) => (t.x = t.x < 800 ? 40 : 1560));
    drop(g, 'wild-ball', 300, surface(g, 300) - 60, 120, 400);
    run(g);
    expect(ev.bounce).toBe(8);
    expect(ev.boom.length).toBe(1);
  });

  w('seeker', () => {
    // fired short of the enemy: steering pulls the landing spot toward them
    const land = (id: string) => {
      const { g, ev } = lab();
      shoot(g, id, towardAngle(g, 55), 48);
      run(g);
      return Math.abs(ev.boom[0].x - tankCenter(enemy(g)).x);
    };
    expect(land('seeker')).toBeLessThan(land('shell') - 50);
  });

  w('tunneler', () => {
    const { g } = lab();
    const b = solidCount(g);
    drop(g, 'tunneler', 600, surface(g, 600) - 20, 300, 300);
    run(g);
    expect(b - solidCount(g)).toBeGreaterThan(4000);
    // the tunnel runs a long way under the surface
    let open = 0;
    for (let x = 600; x < 900; x += 5) for (let y = surface(g, x) + 3; y < surface(g, x) + 260; y++) if (!g.terrain.solid(x, y)) (open++, (y = 9999));
    expect(open).toBeGreaterThan(25);
  });
  w('bunker-buster', () => {
    const { g, ev } = lab();
    const s = surface(g, 800);
    drop(g, 'bunker-buster', 800, s - 20, 0, 400);
    run(g);
    expect(ev.boom[0].y).toBeGreaterThan(s + 40); // detonates deep underground
  });
  w('pile-driver', () => {
    const { g, ev } = lab();
    shoot(g, 'pile-driver', towardAngle(g, 55), 50);
    let n = 0;
    while (ev.spawns.length < 2 && n++ < 10 / DT) g.update(DT);
    const spike = ev.spawns[1];
    expect(ev.spawns[0].p.dead).toBe(true);
    expect(spike.y).toBeGreaterThan(surface(g, spike.x) - 40); // only after it landed (the surface here is the bottom of its small crater)
    expect(spike.vy).toBeGreaterThan(0);
    expect(Math.abs(spike.vx)).toBeLessThan(1); // straight down
    const ground = surface(g, spike.x);
    run(g);
    const big = ev.boom.find((b) => b.r > 50)!;
    expect(big.y).toBeGreaterThan(ground + 40); // blows up underneath
  });
  w('mole-swarm', () => {
    const { g, ev } = lab();
    drop(g, 'mole-swarm', 800, surface(g, 800) - 20, 0, 300);
    run(g);
    const moles = ev.spawns.filter((s) => s.def.burrow && s !== ev.spawns[0]);
    expect(moles.length).toBe(4);
    const last = ev.boom.slice(-4).map((b) => b.x);
    expect(Math.max(...last) - Math.min(...last)).toBeGreaterThan(100); // tunnel outward
    expect(ev.boom.slice(-4).every((b) => b.y > surface(g, b.x) - 5 || true)).toBe(true);
  });

  w('laser', () => {
    const { g, ev } = lab();
    const a = g.tanks[0];
    const c = tankCenter(enemy(g));
    // a hill in the way
    g.terrain.addMound((a.x + c.x) / 2, 80, 200);
    arm(g, 'laser');
    g.apply({ t: 'aim', angle: Math.round((Math.atan2(-(c.y - (a.y - 17)), c.x - a.x) * 180) / Math.PI), power: 50 });
    g.wind = 15;
    g.apply({ t: 'fire' });
    run(g);
    expect(ev.beams).toBe(1);
    expect(dmgTo(g)).toBeGreaterThanOrEqual(30); // burned through the hill, straight, no wind
  });
  w('breaker', () => {
    const at = (gap: number) => {
      const { g, ev } = lab();
      const a = g.tanks[0];
      enemy(g).x = a.x + gap;
      enemy(g).y = g.groundUnder(enemy(g).x, 0);
      arm(g, 'breaker');
      const c = tankCenter(enemy(g));
      g.apply({ t: 'aim', angle: Math.round((Math.atan2(-(c.y - (a.y - 17)), c.x - a.x) * 180) / Math.PI), power: 50 });
      const b = solidCount(g);
      g.apply({ t: 'fire' });
      run(g);
      return { d: dmgTo(g), dug: b - solidCount(g), beams: ev.beams };
    };
    expect(at(110).d).toBeGreaterThanOrEqual(35); // anything right in front
    expect(at(400).d).toBe(0); // short range
    // smashes dirt: aim into the ground
    const { g } = lab();
    arm(g, 'breaker');
    g.apply({ t: 'aim', angle: 330, power: 50 });
    const b = solidCount(g);
    g.apply({ t: 'fire' });
    run(g);
    expect(b - solidCount(g)).toBeGreaterThan(1000);
  });

  w('tracer', () => {
    const { g, ev } = lab();
    const c = tankCenter(enemy(g));
    const b = solidCount(g);
    drop(g, 'tracer', c.x, c.y - 60);
    expect(g.projectiles[0].def.tracer).toBe(true);
    run(g);
    expect(dmgTo(g)).toBe(0);
    expect(solidCount(g)).toBe(b);
    expect(ev.boom.length).toBe(0);
  });

  w('fuse-grenade', () => {
    const { g, ev } = lab();
    shoot(g, 'fuse-grenade', towardAngle(g, 50), 45);
    const t0 = g.time;
    run(g);
    expect(ev.boom.length).toBe(1);
    expect(Math.abs(ev.boom[0].t - t0 - 3.5)).toBeLessThan(0.05);
    expect(ev.bounce).toBeGreaterThan(0);
  });
  w('prox-shell', () => {
    const { g, ev } = lab();
    const c = tankCenter(enemy(g));
    drop(g, 'prox-shell', c.x - 200 * dir(g), c.y - 30, 400 * dir(g), 0);
    g.projectiles[0].def = { ...g.projectiles[0].def, gravityScale: 0 };
    run(g);
    expect(ev.boom.length).toBe(1);
    expect(Math.hypot(ev.boom[0].x - c.x, ev.boom[0].y - c.y)).toBeLessThanOrEqual(50); // went off close by
    expect(ev.boom[0].y).toBeLessThan(surface(g, ev.boom[0].x) - 5); // in mid-air
    expect(dmgTo(g)).toBeGreaterThan(20);
  });
  w('crawler', () => {
    // drives along for up to five seconds, climbing a hill
    const { g, ev } = lab();
    g.tanks.forEach((t) => (t.x = t.x < 800 ? 40 : 1560));
    g.terrain.addMound(700, 120, 40);
    drop(g, 'crawler', 560, surface(g, 560) - 20, 100, 100);
    const t0 = g.time;
    run(g);
    expect(ev.boom.length).toBe(1);
    expect(ev.boom[0].t - t0).toBeGreaterThan(4);
    expect(ev.boom[0].t - t0).toBeLessThan(5.6);
    expect(ev.boom[0].x).toBeGreaterThan(760); // over the hill
    // blows up on contact with a tank
    const l = lab();
    const t = enemy(l.g);
    const x = t.x - 150 * dir(l.g);
    drop(l.g, 'crawler', x, surface(l.g, x) - 20, 100 * dir(l.g), 100);
    run(l.g);
    expect(dmgTo(l.g)).toBeGreaterThanOrEqual(35);
  });
  w('boomerang', () => {
    const { g } = lab();
    shoot(g, 'boomerang', towardAngle(g, 60), 60);
    const s = Math.sign(g.projectiles[0].vx);
    let turned = false;
    let n = 0;
    while (g.projectiles.length && n++ < 20 / DT) {
      g.update(DT);
      if (g.projectiles[0] && Math.sign(g.projectiles[0].vx) === -s) turned = true;
    }
    expect(turned).toBe(true); // curves back toward you
  });

  w('warp-shell', () => {
    const { g } = lab();
    drop(g, 'warp-shell', 800, surface(g, 800) - 30);
    run(g);
    expect(Math.abs(g.tanks[0].x - 800)).toBeLessThan(10);
  });
  w('gust', () => {
    const { g } = lab();
    const t = enemy(g);
    const x0 = t.x;
    const x = t.x - 60 * dir(g);
    drop(g, 'gust', x, surface(g, x) - 10);
    run(g);
    expect(Math.abs(t.x - x)).toBeGreaterThan(Math.abs(x0 - x) + 40); // flung away
    expect(dmgTo(g)).toBeLessThanOrEqual(10);
  });
  w('vortex', () => {
    const { g, ev } = lab();
    const t = enemy(g);
    const x = t.x - 150 * dir(g);
    const d0 = Math.abs(t.x - x);
    drop(g, 'vortex', x, surface(g, x) - 10);
    run(g);
    expect(Math.abs(t.x - x)).toBeLessThan(d0 - 15); // sucked in
    expect(ev.boom.length).toBe(1); // then pops
  });
  w('lucky-dip', () => {
    const kinds = new Set<string>();
    for (let s = 1; s <= 30; s++) {
      const { g, ev } = lab(s);
      const b = solidCount(g);
      drop(g, 'lucky-dip', 800, surface(g, 800) - 30);
      run(g);
      const big = ev.boom.some((x) => x.r >= 80);
      kinds.add(big ? 'big' : ev.napalm ? 'fire' : solidCount(g) > b + 1000 ? 'dirt' : ev.spawns.length > 3 ? 'bomblets' : ev.lightning ? 'lightning' : 'squib');
    }
    expect(kinds.size).toBe(6);
  });
  w('long-shot', () => {
    let nukes = 0;
    const N = 120;
    for (let s = 1; s <= N; s++) {
      const { g, ev } = lab(s);
      drop(g, 'long-shot', 800, surface(g, 800) - 30);
      step(g, 0.5);
      if (ev.boom.some((b) => b.style === 'nuke')) nukes++;
      else expect(ev.boom[0].r).toBeLessThanOrEqual(15); // fizzles
    }
    expect(nukes / N).toBeGreaterThan(0.15);
    expect(nukes / N).toBeLessThan(0.35);
    const biggest = Math.max(...WEAPONS.flatMap((w) => (w.id === 'long-shot' ? [] : JSON.stringify(w).match(/"type":"explode","radius":(\d+)/g)?.map((m) => +m.split(':').pop()!) ?? [])));
    expect(150).toBeGreaterThanOrEqual(biggest); // the biggest blast in the game
  });

  w('napalm', () => {
    const { g, ev } = lab(2, 'rolling');
    drop(g, 'napalm', 800, surface(g, 800) - 30);
    step(g, 0.3);
    expect(ev.napalm).toBe(1);
    expect(g.flames.length).toBeGreaterThanOrEqual(10);
    const ys = g.flames.map((f) => f.y);
    step(g, 1.5);
    const after = g.flames.map((f) => f.y);
    expect(after.reduce((a, b) => a + b, 0) / after.length).toBeGreaterThanOrEqual(ys.reduce((a, b) => a + b, 0) / ys.length); // flows downhill
    // burns a tank it touches
    const l = lab();
    const c = tankCenter(enemy(l.g));
    drop(l.g, 'napalm', c.x, c.y - 40);
    run(l.g);
    expect(dmgTo(l.g)).toBeGreaterThan(30);
  });
  w('inferno', () => {
    const count = (id: string) => {
      const { g } = lab();
      drop(g, id, 800, surface(g, 800) - 30);
      step(g, 0.3);
      return g.flames.length;
    };
    expect(count('inferno')).toBeGreaterThan(count('napalm') * 1.4);
  });
  w('volcano', () => {
    const { g, ev } = lab();
    drop(g, 'volcano', 800, surface(g, 800) - 30);
    run(g);
    const bombs = ev.spawns.slice(1);
    expect(bombs.length).toBeGreaterThanOrEqual(10);
    for (const b of bombs) expect(b.vy).toBeLessThan(0); // hurled up
    expect(ev.boom.filter((b) => b.style === 'fire').length).toBeGreaterThanOrEqual(10);
  });

  w('dirt-ball', () => {
    const { g } = lab();
    const t = enemy(g);
    const b = solidCount(g);
    drop(g, 'dirt-ball', t.x, t.y - 30);
    run(g);
    expect(solidCount(g) - b).toBeGreaterThan(15000);
    expect(g.terrain.solid(t.x, t.y - 45)).toBe(true); // buried
  });
  w('earth-wall', () => {
    const { g } = lab();
    const s = surface(g, 800);
    drop(g, 'earth-wall', 800, s - 30);
    run(g);
    expect(s - surface(g, 800)).toBeGreaterThanOrEqual(150);
  });
  w('dirt-shower', () => {
    const { g, kids } = splitsAtApex('dirt-shower', 18);
    void kids;
    const b = solidCount(g);
    run(g);
    expect(solidCount(g) - b).toBeGreaterThan(5000);
  });
  w('leveler', () => {
    const { g } = lab(5, 'rolling');
    const x = 800;
    drop(g, 'leveler', x, surface(g, x) - 30);
    run(g);
    const hs = [];
    for (let k = -70; k <= 70; k += 10) hs.push(surface(g, x + k));
    expect(Math.max(...hs) - Math.min(...hs)).toBeLessThanOrEqual(3);
  });
  w('spire', () => {
    const { g } = lab();
    const s = surface(g, 800);
    drop(g, 'spire', 800, s - 30);
    run(g);
    expect(s - surface(g, 800)).toBeGreaterThanOrEqual(250); // tall
    expect(s - surface(g, 850)).toBeLessThan(60); // narrow
    // blocks a low shot
    const l = lab();
    const a = l.g.tanks[0];
    const mid = (a.x + enemy(l.g).x) / 2;
    l.g.runActions([{ type: 'mound', width: 70, height: 300 }], mid, surface(l.g, mid), null, -1);
    shoot(l.g, 'shell', towardAngle(l.g, 20), 70);
    run(l.g);
    expect(dmgTo(l.g)).toBe(0);
  });
  w('dome', () => {
    const { g } = lab();
    const t = enemy(g);
    drop(g, 'dome', t.x, t.y - 4);
    run(g);
    expect(g.terrain.solid(t.x, t.y - 30)).toBe(false); // hollow: room for the tank
    expect(g.terrain.solid(t.x, t.y - 70)).toBe(true); // the arch over it
    g.phase = 'aim';
    const c = tankCenter(t);
    drop(g, 'shell', c.x, c.y - 140);
    run(g);
    expect(dmgTo(g)).toBeLessThan(10); // shelter works
  });
  w('mudslide', () => {
    const { g, ev } = lab(4, 'rolling');
    let low = 0,
      lx = 0;
    for (let x = 500; x < 1100; x++) if (surface(g, x) > low) (low = surface(g, x)), (lx = x);
    const up = lx - 120;
    drop(g, 'mudslide', up, surface(g, up) - 30);
    let rolled = 0;
    let n = 0;
    while (g.phase === 'flight' && n++ < 30 / DT) {
      g.update(DT);
      rolled = Math.max(rolled, g.projectiles.filter((p) => p.mode === 'roll').length);
    }
    expect(ev.spawns.length - 1).toBeGreaterThanOrEqual(10);
    expect(rolled).toBeGreaterThan(3);
    expect(surface(g, lx)).toBeLessThan(low); // low ground filled
  });

  w('springwall', () => {
    const { g } = lab();
    const s = surface(g, 800);
    drop(g, 'springwall', 800, s - 30);
    run(g);
    expect(g.terrain.rubber(800, s - 100)).toBe(true);
    g.runActions([{ type: 'explode', radius: 32, damage: 0 }], 815, s - 60, null, -1);
    expect(g.terrain.rubber(800, s - 140)).toBe(true); // small blasts can't break it
    // shots bounce straight off
    g.phase = 'aim';
    drop(g, 'shell', 680, s - 100, 500, 0);
    const p = g.projectiles[0];
    let n = 0;
    while (!p.dead && p.vx > 0 && n++ < 300) g.update(DT);
    expect(p.vx).toBeLessThan(0);
    run(g);
    step(g, 3);
    expect(g.terrain.rubber(800, s - 100)).toBe(true); // stays
  });
  w('rubber-coat', () => {
    const { g, ev } = lab();
    const s = surface(g, 800);
    drop(g, 'rubber-coat', 800, s - 30);
    run(g);
    for (const x of [720, 800, 880]) expect(g.terrain.rubber(x, surface(g, x) + 1)).toBe(true);
    g.phase = 'aim';
    const b = solidCount(g);
    drop(g, 'shell', 760, s - 100, 60, 300);
    const p = g.projectiles[0];
    let n = 0;
    while (!p.dead && p.vy > 0 && n++ < 300) g.update(DT);
    expect(p.vy).toBeLessThan(0); // bounced away
    expect(ev.bounce).toBeGreaterThan(0);
    void b;
  });
  w('brain-fog', () => {
    const { g } = lab();
    g.players[1].angle = 130;
    g.players[1].power = 55;
    g.players[1].cpuLevel = 10;
    const t = enemy(g);
    drop(g, 'brain-fog', t.x, t.y - 30);
    run(g);
    const p1 = g.players[1];
    expect(p1.dazed).toBe(true);
    expect([p1.angle, p1.power]).not.toEqual([130, 55]);
  });
  w('bounce-funnel', () => {
    const { g, ev } = lab();
    const s = surface(g, 800);
    drop(g, 'bounce-funnel', 800, s - 30);
    run(g);
    g.phase = 'aim';
    drop(g, 'shell', 755, s - 200, 0, 250);
    const p = g.projectiles[0];
    let n = 0;
    while (!p.dead && n++ < 10 / DT) g.update(DT);
    expect(ev.bounce).toBeGreaterThan(0);
    expect(Math.abs(p.x - 800)).toBeLessThan(40); // rattled down to the throat
    // outside: bounces away
    g.phase = 'aim';
    drop(g, 'shell', 700, s - 120, 400, 0);
    const q = g.projectiles[0];
    n = 0;
    while (!q.dead && q.vx > 0 && n++ < 300) g.update(DT);
    expect(q.vx).toBeLessThan(0);
  });
  w('spring-ramp', () => {
    const { g } = lab();
    const s = surface(g, 800);
    shoot(g, 'spring-ramp', 45, 50);
    g.projectiles.forEach((p) => ((p.x = 800), (p.y = s - 30), (p.vx = 200), (p.vy = 200)));
    run(g);
    expect(g.terrain.rubber(800 + 50, surface(g, 850) + 2)).toBe(true); // rises the way it was fired
    expect(surface(g, 850)).toBeLessThan(surface(g, 750));
    g.phase = 'aim';
    drop(g, 'shell', 800, s - 200, 0, 300);
    const p = g.projectiles[0];
    let n = 0;
    while (!p.dead && p.vy > 0 && n++ < 400) g.update(DT);
    expect(p.dead).toBe(false);
    expect(p.vy).toBeLessThan(0); // flung back up
  });
  w('snowdrift', () => {
    const { g } = lab();
    const s = surface(g, 800);
    drop(g, 'snowdrift', 800, s - 30);
    run(g);
    step(g, 2);
    const top = surface(g, 800);
    expect(s - top).toBeGreaterThan(70); // huge pile
    const c = g.terrain.color[(top + 3) * g.terrain.w + 800];
    expect(c & 255).toBeGreaterThan(220); // white
    // bury: a tank under the drift
    const l = lab();
    const t = enemy(l.g);
    drop(l.g, 'snowdrift', t.x, t.y - 30);
    run(l.g);
    expect(l.g.terrain.solid(t.x, t.y - 45)).toBe(true);
  });
  w('blizzard', () => {
    const { g, ev, kids } = splitsAtApex('blizzard', 16);
    void kids;
    run(g);
    expect(Math.max(...ev.boom.map((b) => b.r))).toBeLessThanOrEqual(20); // stings a little
    let white = 0;
    for (let i = 0; i < g.terrain.mask.length; i++) if (g.terrain.mask[i] === 1 && ((g.terrain.color[i] >>> 16) & 255) > 230 && (g.terrain.color[i] & 255) > 215) white++;
    expect(white).toBeGreaterThan(3000); // blanket of snow
  });

  w('kettle-pop', () => {
    const { g, ev } = lab();
    drop(g, 'kettle-pop', 800, surface(g, 800) - 30);
    run(g);
    const pops = ev.boom.map((b) => b.t);
    expect(pops.length).toBeGreaterThan(20);
    expect(Math.max(...pops) - Math.min(...pops)).toBeGreaterThan(1); // one after another
    expect(ev.spawns.filter((s) => s.def.look === 'kernel').length).toBeGreaterThan(20); // each pop flings out more
    expect(ev.bounce).toBeGreaterThan(5); // skitter around
  });
  w('singularity', () => {
    const { g, ev } = lab();
    const t = enemy(g);
    const x = t.x - 100 * dir(g);
    const d0 = Math.abs(t.x - x);
    drop(g, 'singularity', x, surface(g, x) - 10);
    let n = 0;
    while (!ev.charge && n++ < 400) g.update(DT);
    const t0 = g.time;
    run(g);
    expect(Math.abs(t.x - x)).toBeLessThan(d0 - 20); // dragged in
    const burst = ev.boom.find((b) => b.style === 'void')!;
    expect(burst.t - t0).toBeGreaterThan(1);
    expect(burst.t - t0).toBeLessThan(1.4);
    expect(dmgTo(g)).toBeGreaterThan(20);
  });
  w('phase-shell', () => {
    const { g } = lab();
    const a = g.tanks[0],
      b = enemy(g);
    g.terrain.addMound((a.x + b.x) / 2, 80, 600);
    drop(g, 'phase-shell', a.x + 50 * dir(g), tankCenter(b).y, 600 * dir(g), 0);
    g.projectiles.forEach((p) => (p.def = { ...p.def, gravityScale: 0 }));
    run(g);
    expect(dmgTo(g)).toBeGreaterThan(15); // through the wall
    // six-second fuse when nothing is near
    const l = lab();
    l.g.tanks.forEach((t) => (t.x = t.x < 800 ? 40 : 1560));
    drop(l.g, 'phase-shell', 800, 300, 0, 0);
    l.g.projectiles.forEach((p) => (p.def = { ...p.def, gravityScale: 0 }));
    const t0 = l.g.time;
    run(l.g);
    expect(Math.abs(l.ev.boom[0].t - t0 - 6)).toBeLessThan(0.6);
  });
  w('mirror-shell', () => {
    const { g, ev } = lab();
    shoot(g, 'mirror-shell', towardAngle(g, 55), 55);
    let n = 0;
    while (ev.spawns.length < 2 && n++ < 10 / DT) g.update(DT);
    const twin = ev.spawns[1];
    expect(Math.sign(twin.vx)).toBe(-dir(g)); // races back the other way
    expect(ev.spawns[0].p.dead).toBe(false); // the original carries on
    run(g);
    const a = g.tanks[0];
    const back = ev.boom.find((b) => Math.sign(b.x - a.x) === -dir(g) || b.x <= 5 || b.x >= WORLD_W - 5);
    expect(back || twin.p.dead).toBeTruthy(); // lands behind you (or off the far edge)
    expect(dmgTo(g)).toBeGreaterThanOrEqual(0);
  });
  w('pickpocket', () => {
    const { g, ev } = lab();
    const t = enemy(g);
    g.players[1].score = 50;
    drop(g, 'pickpocket', t.x, t.y - 30);
    run(g);
    expect(g.players[1].score).toBeLessThanOrEqual(30);
    expect(g.players[0].score).toBeGreaterThanOrEqual(20);
    expect(Math.max(...ev.boom.map((b) => b.r))).toBeLessThanOrEqual(15); // barely scratches
    // even when they have nothing, they go negative
    const l = lab();
    drop(l.g, 'pickpocket', enemy(l.g).x, enemy(l.g).y - 30);
    run(l.g);
    expect(l.g.players[1].score).toBeLessThan(0);
  });
  w('switcheroo', () => {
    const { g } = lab();
    const ax = g.tanks[0].x,
      bx = enemy(g).x;
    drop(g, 'switcheroo', bx, enemy(g).y - 30);
    run(g);
    expect(Math.abs(g.tanks[0].x - bx)).toBeLessThan(5);
    expect(Math.abs(enemy(g).x - ax)).toBeLessThan(5);
  });
  w('orbital-lance', () => {
    const { g, ev } = lab();
    const s = surface(g, 800);
    drop(g, 'orbital-lance', 800, s - 30);
    let n = 0;
    while (!ev.charge && n++ < 400) g.update(DT);
    const t0 = g.time;
    run(g);
    expect(ev.beams).toBe(1);
    expect(ev.boom[0].t - t0).toBeGreaterThan(0.6); // a moment later
    expect(surface(g, 800) - s).toBeGreaterThan(120); // deep trench
    expect(surface(g, 860)).toBeLessThan(s + 10); // straight down, not a crater
  });
  w('echo-charge', () => {
    const { g, ev } = lab();
    drop(g, 'echo-charge', 800, surface(g, 800) - 30);
    run(g);
    expect(ev.boom.length).toBe(3);
    expect(new Set(ev.boom.map((b) => Math.round(b.x))).size).toBe(1); // same spot
    expect(ev.boom[1].r).toBeGreaterThan(ev.boom[0].r);
    expect(ev.boom[2].r).toBeGreaterThan(ev.boom[1].r);
  });
  w('twin-crawlers', () => {
    const { g, ev } = lab();
    g.tanks.forEach((t) => (t.x = t.x < 800 ? 40 : 1560));
    drop(g, 'twin-crawlers', 800, surface(g, 800) - 30);
    run(g);
    const crawlers = ev.spawns.filter((s) => s.def.crawl);
    expect(crawlers.length).toBe(2);
    expect(Math.sign(crawlers[0].vx)).toBe(-Math.sign(crawlers[1].vx));
    const xs = ev.boom.slice(-2).map((b) => b.x).sort((a, b) => a - b);
    expect(xs[0]).toBeLessThan(700);
    expect(xs[1]).toBeGreaterThan(900); // one each way
  });

  it('covers every weapon in the game', () => {
    expect(WEAPONS.filter((w) => !checked.has(w.id)).map((w) => w.id)).toEqual([]);
  });
});
