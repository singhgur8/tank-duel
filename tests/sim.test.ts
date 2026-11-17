import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import { planTurn, predictShot } from '../src/game/ai';
import { Rng } from '../src/core/rng';
import { WEAPONS, getWeapon } from '../src/game/weapons';
import { DT } from '../src/config';

const mk = (seed: number, lvl?: number) =>
  new Game({ players: [{ name: 'A' }, { name: 'B', cpuLevel: lvl }], weaponsPerPlayer: 10, seed });

function runUntilAim(g: Game, max = 120 * 60) {
  for (let i = 0; i < max && g.phase !== 'aim' && g.phase !== 'gameover'; i++) g.update(DT);
}

describe('simulation', () => {
  it('is deterministic for the same seed and commands', () => {
    const a = mk(42), b = mk(42);
    for (const g of [a, b]) {
      g.apply({ t: 'aim', angle: 60, power: 70 });
      g.apply({ t: 'fire' });
      runUntilAim(g);
    }
    expect(a.players.map((p) => p.score)).toEqual(b.players.map((p) => p.score));
    expect(a.terrain.mask.every((v, i) => v === b.terrain.mask[i])).toBe(true);
  });

  it('every weapon fires and the turn resolves', () => {
    for (const w of WEAPONS) {
      const g = mk(7);
      g.player.weapons = [w.id, 'shell'];
      g.player.selected = 0;
      g.apply({ t: 'aim', angle: g.current === 0 ? 55 : 125, power: 65 });
      expect(g.apply({ t: 'fire' })).toBe(true);
      runUntilAim(g);
      expect(['aim', 'gameover']).toContain(g.phase);
    }
  });

  it('tanks rest on the ground', () => {
    const g = mk(3);
    for (const t of g.tanks) expect(g.groundUnder(t.x, t.y - 3)).toBe(t.y);
  });
});

describe('cpu', () => {
  it('level 10 hits with the predicted shot', () => {
    let hits = 0, tries = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = mk(seed, 10);
      g.current = 1;
      g.player.weapons = ['shell'];
      g.player.selected = 0;
      const plan = planTurn(g, 1, 10, new Rng(seed));
      const r = predictShot(g, 1, getWeapon('shell').projectile!, plan.angle, plan.power);
      g.apply({ t: 'aim', angle: plan.angle, power: plan.power });
      const before = g.players[1].score;
      g.apply({ t: 'fire' });
      runUntilAim(g);
      tries++;
      if (r.tank === 0) {
        expect(g.players[1].score - before).toBeGreaterThanOrEqual(25);
        hits++;
      }
    }
    expect(hits).toBe(tries);
  });

  it('low levels are less accurate than high levels', () => {
    const miss = (lvl: number) => {
      let total = 0;
      for (let s = 1; s <= 10; s++) {
        const g = mk(s, lvl);
        g.player.weapons = ['shell'];
        const plan = planTurn(g, 1, lvl, new Rng(s * 99));
        const r = predictShot(g, 1, getWeapon('shell').projectile!, plan.angle, plan.power);
        total += r.tank === 0 ? 0 : Math.hypot(r.x - g.tanks[0].x, r.y - g.tanks[0].y);
      }
      return total / 10;
    };
    expect(miss(1)).toBeGreaterThan(miss(9));
  });
});
