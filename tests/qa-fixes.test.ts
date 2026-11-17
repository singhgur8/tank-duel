import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import { planTurn, predictShot } from '../src/game/ai';
import { Rng } from '../src/core/rng';
import { getWeapon } from '../src/game/weapons';
import { DT } from '../src/config';
import { tankCenter } from '../src/game/flight';

const mk = (seed: number) => new Game({ players: [{ name: 'A' }, { name: 'B' }], weaponsPerPlayer: 10, seed });

describe('QA fixes', () => {
  it('jumping jack hops forward', () => {
    const g = mk(5);
    g.wind = 0;
    g.current = 0;
    g.player.weapons = ['jumping-jack', 'shell'];
    g.player.selected = 0;
    g.apply({ t: 'aim', angle: 60, power: 45 });
    g.apply({ t: 'fire' });
    const xs: number[] = [];
    let last = -1;
    for (let i = 0; i < 120 * 30 && g.phase === 'flight'; i++) {
      g.update(DT);
      const p = g.projectiles[0];
      if (p && p.id !== last) {
        last = p.id;
        xs.push(Math.round(p.x));
      }
    }
    expect(xs.length).toBeGreaterThanOrEqual(5);
    console.log(xs);
    expect(xs[xs.length - 1] - xs[1]).toBeGreaterThan(80);
  });

  it('dirt ball buries a tank instead of lifting it', () => {
    const g = mk(9);
    const t = g.tanks[1];
    const y0 = t.y;
    g.runActions([{ type: 'dirt', radius: 60 }], t.x, t.y - 10, null, -1);
    for (let i = 0; i < 240; i++) g.update(DT);
    expect(Math.abs(t.y - y0)).toBeLessThan(3);
    expect(g.terrain.solid(t.x, t.y - 20)).toBe(true);
  });

  it('laser can aim down at a lower target', () => {
    let hits = 0;
    for (let s = 1; s <= 10; s++) {
      const g = mk(s);
      g.current = 0;
      g.player.weapons = ['laser'];
      g.player.selected = 0;
      const plan = planTurn(g, 0, 10, new Rng(s));
      g.apply({ t: 'aim', angle: plan.angle, power: 50 });
      const before = g.players[0].score;
      g.apply({ t: 'fire' });
      if (g.players[0].score > before) hits++;
    }
    expect(hits).toBe(10);
  });

  it('CPU difficulty is graded', () => {
    const rate = (lvl: number) => {
      let hit = 0;
      for (let s = 1; s <= 30; s++) {
        const g = mk(s * 3);
        g.players[1].weapons = ['heavy-shell'];
        const plan = planTurn(g, 1, lvl, new Rng(s * 77 + lvl));
        const r = predictShot(g, 1, getWeapon('heavy-shell').projectile!, plan.angle, plan.power);
        const c = tankCenter(g.tanks[0]);
        if (r.tank === 0 || Math.hypot(r.x - c.x, r.y - c.y) < 55) hit++;
      }
      return hit / 30;
    };
    const r1 = rate(1), r5 = rate(5), r8 = rate(8), r10 = rate(10);
    console.log({ r1, r5, r8, r10 });
    expect(r10).toBe(1);
    expect(r8).toBeGreaterThan(r5);
    expect(r5).toBeGreaterThan(r1);
  }, 30000);
});
