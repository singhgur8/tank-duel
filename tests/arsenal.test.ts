import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import { WEAPONS, getWeapon } from '../src/game/weapons';
import { DT } from '../src/config';
import { ICON_KEYS } from '../src/render/icons';

const mk = (seed: number) => new Game({ players: [{ name: 'A' }, { name: 'B' }], weaponsPerPlayer: 10, seed });

describe('arsenal', () => {
  it('every weapon has its own icon and a unique id', () => {
    const ids = WEAPONS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const w of WEAPONS) expect(ICON_KEYS).toContain(w.icon ?? w.id);
  });

  it('thunderbolt hits a tank directly below and spares a distant one', () => {
    const g = mk(3);
    g.current = 0;
    const [a, b] = g.tanks;
    g.runActions(getWeapon('thunderbolt').projectile!.onImpact, b.x + 10, b.y - 30, null, -1);
    expect(g.players[0].score).toBeGreaterThan(30);
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(400);
  });

  it('earthquake damages tanks on the ground within range only', () => {
    const g = mk(4);
    const b = g.tanks[1];
    g.current = 0;
    g.runActions([{ type: 'quake', radius: 230, damage: 34 }], b.x - 150, b.y, null, -1);
    const s = g.players[0].score;
    expect(s).toBeGreaterThan(5);
    expect(s).toBeLessThan(34);
    expect(g.players[1].score).toBe(0);
  });

  it('airstrike drops a line of bombs at its peak', () => {
    const g = mk(6);
    g.wind = 0;
    g.current = 0;
    g.player.weapons = ['airstrike'];
    g.player.selected = 0;
    g.apply({ t: 'aim', angle: 70, power: 60 });
    g.apply({ t: 'fire' });
    let most = 0;
    for (let i = 0; i < 120 * 20 && g.phase === 'flight'; i++) {
      g.update(DT);
      most = Math.max(most, g.projectiles.length);
    }
    expect(most).toBe(7);
  });

  it('mole swarm splits into burrowers underground', () => {
    const g = mk(8);
    g.wind = 0;
    g.current = 0;
    g.player.weapons = ['mole-swarm'];
    g.player.selected = 0;
    g.apply({ t: 'aim', angle: 60, power: 55 });
    g.apply({ t: 'fire' });
    let burrowers = 0;
    for (let i = 0; i < 120 * 20 && g.phase === 'flight'; i++) {
      g.update(DT);
      burrowers = Math.max(burrowers, g.projectiles.filter((p) => p.mode === 'burrow').length);
    }
    expect(burrowers).toBe(4);
  });
});

describe('weapons in play', () => {
  it('only deals weapons from the enabled pool', () => {
    const pool = ['shell', 'thunderbolt', 'airstrike'];
    const g = new Game({ players: [{ name: 'A' }, { name: 'B' }], weaponsPerPlayer: 10, seed: 11, pool });
    for (const p of g.players) {
      expect(p.weapons.length).toBe(10);
      for (const id of p.weapons) expect(pool).toContain(id);
    }
  });
});
