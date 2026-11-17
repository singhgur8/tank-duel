import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import { DT, WORLD_W } from '../src/config';

const mk = (seed: number) => new Game({ players: [{ name: 'A' }, { name: 'B' }], weaponsPerPlayer: 10, seed });
const run = (g: Game, s: number) => {
  for (let i = 0; i < s / DT; i++) g.update(DT);
};

describe('elastic physics', () => {
  it('a nearby blast throws a tank a short way, then it settles on the ground', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = mk(seed);
      const t = g.tanks[1];
      const x0 = t.x;
      // An air burst beside the tank (its crater doesn't reach the ground under it).
      g.runActions([{ type: 'explode', radius: 60, damage: 40, style: 'big' }], t.x - 35, t.y - 45, null, -1);
      let peak = t.y;
      for (let i = 0; i < 6 / DT; i++) {
        g.update(DT);
        peak = Math.min(peak, t.y);
      }
      expect(t.falling).toBe(false);
      expect(Math.abs(t.vx)).toBeLessThan(10);
      expect(t.x - x0).toBeGreaterThan(5); // pushed away from the blast
      expect(t.x - x0).toBeLessThan(160);
      expect(Math.abs(t.y - g.groundUnder(t.x, t.y - 20))).toBeLessThan(1.5);
    }
  });

  it('a small shell only moves a tank a little (at most into its own crater)', () => {
    const g = mk(7);
    const t = g.tanks[0];
    const x0 = t.x;
    g.runActions([{ type: 'explode', radius: 32, damage: 30 }], t.x + 30, t.y - 5, null, -1);
    run(g, 4);
    expect(Math.abs(t.x - x0)).toBeLessThan(60);
    expect(t.falling).toBe(false);
  });

  it('a tank on a steep slope slides down and stops', () => {
    const g = mk(3);
    const t = g.tanks[0];
    // dig a deep crater right beside it so it sits on a steep wall
    g.terrain.carveCircle(t.x + 40, t.y + 20, 55);
    const x0 = t.x;
    run(g, 6);
    expect(t.falling).toBe(false);
    expect(t.vx).toBe(0);
    expect(t.x).toBeGreaterThan(x0 + 5);
    expect(t.x).toBeLessThan(WORLD_W);
  });

  it('turns still end after a big hit (nothing keeps jiggling forever)', () => {
    for (const seed of [2, 6, 9]) {
      const g = mk(seed);
      g.player.weapons = ['megaton', 'shell'];
      g.player.selected = 0;
      const other = g.tanks[1 - g.current];
      g.apply({ t: 'fire' });
      g.projectiles.forEach((p) => ((p.x = other.x - 30), (p.y = other.y - 40), (p.vx = 0), (p.vy = 60)));
      let n = 0;
      while (g.phase === 'flight' && n++ < 30 / DT) g.update(DT);
      expect(g.phase).not.toBe('flight');
    }
  });

  it('a glancing bounce keeps more speed along the ground than a head-on one', () => {
    const g = mk(4);
    g.wind = 0;
    const def = { radius: 4, color: '#fff', bounces: 1, restitution: 0.6, onImpact: [] };
    const x = WORLD_W / 2;
    const top = g.terrain.surfaceBelow(x, 0);
    g.terrain.flatten(x, top, 300);
    const y = g.terrain.surfaceBelow(x, 0);
    const a = g.spawnProjectile(def, x - 60, y - 8, 400, 120, 0, -1);
    const b = g.spawnProjectile(def, x + 60, y - 8, 0, 400, 0, -1);
    for (let i = 0; i < 30 && (a.bounces || b.bounces); i++) g.update(DT);
    expect(a.vx).toBeGreaterThan(300);
    expect(Math.abs(b.vx)).toBeLessThan(80);
    expect(b.vy).toBeLessThan(-150);
  });
});
