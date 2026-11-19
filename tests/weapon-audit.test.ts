import { describe, expect, it } from 'vitest';
import { Game, NullFx } from '../src/game/game';
import { DT } from '../src/config';
import { tankCenter } from '../src/game/flight';
import { planTurn } from '../src/game/ai';
import { Rng } from '../src/core/rng';

const mk = (seed: number, fx = NullFx) => new Game({ players: [{ name: 'A' }, { name: 'B' }], weaponsPerPlayer: 10, seed }, fx);
const run = (g: Game, secs = 40) => {
  let n = 0;
  while (g.phase === 'flight' && n++ < secs / DT) g.update(DT);
};
const solid = (g: Game) => g.terrain.mask.reduce((a, b) => a + (b ? 1 : 0), 0);
/** Fire `id` from player 0 and move the shell to fall straight onto (x, y). */
function dropOn(g: Game, id: string, x: number, y: number) {
  g.current = 0;
  g.wind = 0;
  g.player.weapons = [id, 'shell'];
  g.player.selected = 0;
  g.apply({ t: 'fire' });
  g.projectiles.forEach((p) => ((p.x = x), (p.y = y - 140), (p.vx = 0), (p.vy = 330)));
}
function flatEnemy(g: Game) {
  const t = g.tanks[1];
  g.terrain.flatten(t.x, t.y, 500);
  t.y = g.groundUnder(t.x, t.y - 40);
  return t;
}

describe('weapon audit', () => {
  it('the barrel turns a full circle and wraps around', () => {
    const g = mk(1);
    g.apply({ t: 'aim', angle: 270, power: 50 });
    expect(g.player.angle).toBe(270);
    g.apply({ t: 'aim', angle: 361, power: 50 });
    expect(g.player.angle).toBe(1);
    g.apply({ t: 'aim', angle: -1, power: 50 });
    expect(g.player.angle).toBe(359);
    expect(g.angleRange()).toEqual([0, 359]);
  });

  it('a near miss still does real splash damage', () => {
    const g = mk(11);
    const t = flatEnemy(g);
    const c = tankCenter(t);
    dropOn(g, 'shell', c.x - 45, c.y);
    run(g);
    expect(g.players[0].score).toBeGreaterThanOrEqual(15); // a 30-damage shell
  });

  it('megaton is hard to miss: 90 px away still hurts', () => {
    const g = mk(11);
    const t = flatEnemy(g);
    const c = tankCenter(t);
    dropOn(g, 'megaton', c.x - 90, c.y);
    run(g);
    expect(g.players[0].score).toBeGreaterThan(30);
  });

  it('hurting yourself can take your score below zero', () => {
    const g = mk(2);
    g.applyDamage(0, 25, 0, 0, 0);
    expect(g.players[0].score).toBe(-25);
  });

  it('pickpocket can push a victim negative', () => {
    const g = mk(2);
    const t = g.tanks[1];
    dropOn(g, 'pickpocket', t.x, t.y - 20);
    run(g);
    expect(g.players[1].score).toBeLessThan(0);
    expect(g.players[0].score).toBeGreaterThanOrEqual(20);
  });

  it('dirt ball buries a tank', () => {
    const g = mk(3);
    const t = flatEnemy(g);
    const before = solid(g);
    dropOn(g, 'dirt-ball', t.x, t.y - 20);
    run(g);
    expect(solid(g) - before).toBeGreaterThan(15000);
    expect(g.terrain.solid(t.x, t.y - 40)).toBe(true); // dirt over the turret
  });

  it('a bunker dome stops a shell aimed at the tank inside', () => {
    const g = mk(4);
    const t = flatEnemy(g);
    dropOn(g, 'dome', t.x, t.y - 4);
    run(g);
    g.phase = 'aim';
    const c = tankCenter(t);
    dropOn(g, 'shell', c.x, c.y);
    run(g);
    expect(g.players[0].score).toBeLessThan(10); // the arch soaked up the blast
  });

  it('springwall stays standing and shells bounce off it', () => {
    let bounces = 0;
    const g = mk(5, { ...NullFx, bounce() { bounces++; } });
    const x = 800;
    const gy = g.terrain.surfaceBelow(x, 0);
    g.runActions([{ type: 'rubber', shape: 'wall', width: 18, height: 150 }], x, gy, null, -1);
    expect(g.terrain.rubber(x, gy - 100)).toBe(true);
    // a blast next to it does not knock it down
    g.runActions([{ type: 'explode', radius: 32, damage: 0 }], x + 20, gy - 60, null, -1);
    expect(g.terrain.rubber(x, gy - 140)).toBe(true);
    // a shell flying flat into the wall comes back the way it came
    g.current = 0;
    g.player.weapons = ['shell'];
    g.player.selected = 0;
    g.apply({ t: 'fire' });
    const p = g.projectiles[0];
    p.x = x - 120;
    p.y = gy - 100;
    p.vx = 500;
    p.vy = 0;
    let n = 0;
    while (!p.dead && p.vx > 0 && n++ < 200) g.update(DT);
    expect(p.vx).toBeLessThan(0);
    expect(bounces).toBeGreaterThan(0);
  });

  it('brain fog scrambles the enemy aim and dazes them until they fire', () => {
    const g = mk(6);
    const t = g.tanks[1];
    g.players[1].angle = 130;
    g.players[1].power = 55;
    dropOn(g, 'brain-fog', t.x, t.y - 20);
    run(g);
    const p1 = g.players[1];
    expect(p1.dazed).toBe(true);
    expect([p1.angle, p1.power]).not.toEqual([130, 55]);
  });

  it('fuse grenade glances off a tank and still waits for its fuse', () => {
    const g = mk(7);
    const t = flatEnemy(g);
    const c = tankCenter(t);
    dropOn(g, 'fuse-grenade', c.x, c.y);
    let n = 0;
    while (g.projectiles.length && n++ < 2 / DT) g.update(DT);
    expect(g.projectiles.length).toBe(1); // still ticking after two seconds
  });

  it('mirror shell twin lands behind the shooter, not on them', () => {
    for (const s of [1, 2, 3]) {
      const g = mk(s * 9);
      g.current = 0;
      g.wind = 0;
      g.player.weapons = ['mirror-shell', 'shell'];
      g.player.selected = 0;
      const plan = planTurn(g, 0, 10, new Rng(s));
      g.apply({ t: 'aim', angle: plan.angle, power: plan.power });
      g.apply({ t: 'fire' });
      run(g);
      expect(g.players[0].score).toBeGreaterThan(0);
    }
  });

  it('swarm seekers hunt the enemy, never the shooter', () => {
    let total = 0;
    for (const s of [1, 2, 3, 4]) {
      const g = mk(s * 7);
      g.current = 0;
      g.wind = 0;
      g.player.weapons = ['swarm', 'shell'];
      g.player.selected = 0;
      const plan = planTurn(g, 0, 10, new Rng(s));
      g.apply({ t: 'aim', angle: plan.angle, power: plan.power });
      g.apply({ t: 'fire' });
      run(g);
      expect(g.players[0].score).toBeGreaterThanOrEqual(0);
      total += g.players[0].score;
    }
    expect(total).toBeGreaterThan(60);
  });

  it('split-at-the-top weapons carry on along their arc instead of dropping straight down', () => {
    for (const id of ['hailstorm', 'airstrike', 'acid-rain', 'dirt-shower']) {
      const g = mk(8);
      g.current = 0;
      g.wind = 0;
      g.player.weapons = [id, 'shell'];
      g.player.selected = 0;
      g.apply({ t: 'aim', angle: 60, power: 70 });
      g.apply({ t: 'fire' });
      let n = 0;
      while (g.projectiles.length <= 1 && n++ < 10 / DT) g.update(DT);
      const kids = g.projectiles;
      expect(kids.length, id).toBeGreaterThan(1);
      for (const k of kids) expect(k.vx, id).toBeGreaterThan(50); // still heading downrange
    }
  });

  it('snowdrift piles up white snow that stays like dirt', () => {
    const g = mk(12);
    const x = 700;
    const gy = g.terrain.surfaceBelow(x, 0);
    const before = solid(g);
    g.runActions([{ type: 'snow', radius: 100 }], x, gy, null, -1);
    run(g, 0);
    let n = 0;
    while (g.terrain.settling && n++ < 2000) g.update(DT);
    expect(solid(g) - before).toBeGreaterThan(10000);
    const top = g.terrain.surfaceBelow(x, 0);
    expect(top).toBeLessThan(gy - 40);
    const c = g.terrain.color[(top + 3) * g.terrain.w + x];
    expect(c & 255).toBeGreaterThan(200); // white, not dirt-coloured
    expect((c >>> 16) & 255).toBeGreaterThan(200);
  });

  it('frost bomb and hailstorm leave snow behind', () => {
    const g = mk(13);
    const t = flatEnemy(g);
    const before = solid(g);
    dropOn(g, 'frost-bomb', t.x - 60, t.y - 4);
    run(g);
    let white = 0;
    for (let i = 0; i < g.terrain.mask.length; i++) if (g.terrain.mask[i] === 1 && (g.terrain.color[i] & 255) > 215 && ((g.terrain.color[i] >>> 16) & 255) > 230) white++;
    expect(white).toBeGreaterThan(800);
    expect(solid(g)).not.toBe(before);
  });

  it('a shell dropped into a bounce funnel rattles down to the throat', () => {
    let bounces = 0;
    const g = mk(14, { ...NullFx, bounce() { bounces++; } });
    const x = 800;
    const gy = g.terrain.surfaceBelow(x, 0);
    g.runActions([{ type: 'rubber', shape: 'cup', width: 150, height: 110 }], x, gy, null, -1);
    g.current = 0;
    g.wind = 0;
    g.player.weapons = ['shell'];
    g.player.selected = 0;
    g.apply({ t: 'fire' });
    const p = g.projectiles[0];
    p.x = x - 45;
    p.y = gy - 200;
    p.vx = 0;
    p.vy = 250;
    let n = 0;
    while (!p.dead && n++ < 10 / DT) g.update(DT);
    expect(bounces).toBeGreaterThan(0);
    expect(Math.abs(p.x - x)).toBeLessThan(40); // ended up near the middle
  });

  it('a spring ramp flings a shell back up', () => {
    const g = mk(15);
    const x = 800;
    const gy = g.terrain.surfaceBelow(x, 0);
    g.runActions([{ type: 'rubber', shape: 'ramp', width: 130, height: 80 }], x, gy, null, -1);
    g.current = 0;
    g.player.weapons = ['shell'];
    g.player.selected = 0;
    g.apply({ t: 'fire' });
    const p = g.projectiles[0];
    p.x = x;
    p.y = gy - 200;
    p.vx = 0;
    p.vy = 300;
    let n = 0;
    while (!p.dead && p.vy > 0 && n++ < 400) g.update(DT);
    expect(p.dead).toBe(false);
    expect(p.vy).toBeLessThan(0);
  });
});

describe('power curve', () => {
  it('100 power flies almost flat across the map', () => {
    const g = mk(16);
    g.terrain.mask.fill(0); // open sky so nothing gets in the way
    g.current = 0;
    g.wind = 0;
    g.player.weapons = ['shell'];
    g.player.selected = 0;
    const a = g.tanks[0];
    const dir = a.x < 800 ? 0 : 180;
    g.apply({ t: 'aim', angle: dir, power: 100 });
    g.apply({ t: 'fire' });
    const p = g.projectiles[0];
    const y0 = p.y;
    const x0 = p.x;
    let n = 0;
    while (!p.dead && Math.abs(p.x - x0) < 1000 && n++ < 2000) g.update(DT);
    expect(Math.abs(p.x - x0)).toBeGreaterThanOrEqual(1000);
    expect(p.y - y0).toBeLessThan(60); // under 60 px of drop over 1000 px
  });
});
