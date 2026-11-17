import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import { DT } from '../src/config';
import { tankCenter } from '../src/game/flight';

const mk = (seed: number) => new Game({ players: [{ name: 'A' }, { name: 'B' }], weaponsPerPlayer: 10, seed, maxWind: 0 });
function fire(g: Game, id: string, angle: number, power: number) {
  g.current = 0;
  g.wind = 0;
  g.player.weapons = [id, 'shell'];
  g.player.selected = 0;
  g.apply({ t: 'aim', angle, power });
  g.apply({ t: 'fire' });
}

describe('new behaviours', () => {
  it('fuse grenade goes off at its fuse time, not on landing', () => {
    const g = mk(3);
    fire(g, 'fuse-grenade', 60, 45);
    let t = 0;
    while (g.projectiles.length && t < 10) {
      g.update(DT);
      t += DT;
    }
    expect(t).toBeGreaterThan(3.4);
    expect(t).toBeLessThan(3.6);
  });

  it('proximity shell bursts near the enemy without touching it', () => {
    const g = mk(5);
    const b = g.tanks[1];
    g.current = 0;
    g.player.weapons = ['prox-shell'];
    g.player.selected = 0;
    g.apply({ t: 'fire' });
    const p = g.projectiles[0];
    const c = tankCenter(b);
    Object.assign(p, { x: c.x - 120, y: c.y - 30, vx: 400, vy: 0, age: 1 });
    let burstAt = -1;
    for (let i = 0; i < 120 && burstAt < 0; i++) {
      const x = p.x;
      g.update(DT);
      if (p.dead) burstAt = Math.abs(c.x - x);
    }
    expect(burstAt).toBeGreaterThan(20);
    expect(burstAt).toBeLessThan(60);
  });

  it('warp shell moves the shooter to the landing spot', () => {
    const g = mk(7);
    const a = g.tanks[0];
    const x0 = a.x;
    fire(g, 'warp-shell', 55, 55);
    let n = 0;
    while (g.phase === 'flight' && n++ < 20 / DT) g.update(DT);
    expect(Math.abs(a.x - x0)).toBeGreaterThan(150);
    expect(a.falling).toBe(false);
  });

  it('vortex pulls tanks in and gust throws them out', () => {
    const g = mk(9);
    const b = g.tanks[1];
    const x0 = b.x;
    g.runActions([{ type: 'push', radius: 260, strength: -260 }], x0 - 150, b.y - 5, null, -1);
    for (let i = 0; i < 4 / DT; i++) g.update(DT);
    expect(b.x).toBeLessThan(x0 - 20);
    const x1 = b.x;
    g.runActions([{ type: 'push', radius: 150, strength: 420 }], x1 - 40, b.y - 5, null, -1);
    for (let i = 0; i < 6 / DT; i++) g.update(DT);
    expect(b.x).toBeGreaterThan(x1 + 20);
  });

  it('bunker dome stands as a hollow arch', () => {
    const g = mk(4);
    const t = g.tanks[1];
    g.runActions([{ type: 'dome', radius: 62, thickness: 12 }], t.x, t.y, null, -1);
    for (let i = 0; i < 3 / DT; i++) g.update(DT);
    expect(g.terrain.solid(t.x, t.y - 60)).toBe(true); // roof
    expect(g.terrain.solid(t.x, t.y - 30)).toBe(false); // hollow inside
  });

  it('crawler drives along the ground before blowing up', () => {
    const g = mk(2);
    fire(g, 'crawler', 70, 40);
    let rolled = 0;
    let landX = -1;
    for (let i = 0; i < 20 / DT && g.projectiles.length; i++) {
      g.update(DT);
      const p = g.projectiles[0];
      if (p?.mode === 'roll') {
        if (landX < 0) landX = p.x;
        rolled = Math.abs(p.x - landX);
      }
    }
    expect(rolled).toBeGreaterThan(60);
  });
});
