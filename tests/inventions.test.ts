import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import { DT } from '../src/config';
import { tankCenter } from '../src/game/flight';

const mk = (seed: number) => new Game({ players: [{ name: 'A' }, { name: 'B' }], weaponsPerPlayer: 10, seed });
const run = (g: Game, secs = 40) => {
  let n = 0;
  while (g.phase === 'flight' && n++ < secs / DT) g.update(DT);
};
/** Fire `id` and teleport the shell to just above (x, y) falling straight down. */
function dropOn(g: Game, id: string, x: number, y: number) {
  g.current = 0;
  g.wind = 0;
  g.player.weapons = [id, 'shell'];
  g.player.selected = 0;
  g.apply({ t: 'fire' });
  g.projectiles.forEach((p) => ((p.x = x), (p.y = y - 60), (p.vx = 0), (p.vy = 250)));
}

describe('new weapons', () => {
  it('every new weapon ends its turn', () => {
    for (const id of ['kettle-pop', 'singularity', 'phase-shell', 'mirror-shell', 'pickpocket', 'switcheroo', 'orbital-lance', 'echo-charge', 'twin-crawlers']) {
      const g = mk(5);
      g.current = 0;
      g.player.weapons = [id, 'shell'];
      g.player.selected = 0;
      g.apply({ t: 'aim', angle: 60, power: 60 });
      g.apply({ t: 'fire' });
      run(g);
      expect(g.phase, id).not.toBe('flight');
    }
  });

  it('pickpocket moves points from the enemy to the shooter', () => {
    const g = mk(2);
    g.players[1].score = 50;
    const t = g.tanks[1];
    dropOn(g, 'pickpocket', t.x, t.y - 20);
    run(g);
    expect(g.players[1].score).toBeLessThanOrEqual(30);
    expect(g.players[0].score).toBeGreaterThanOrEqual(20);
  });

  it('switcheroo swaps the two tanks', () => {
    const g = mk(3);
    const ax = g.tanks[0].x,
      bx = g.tanks[1].x;
    dropOn(g, 'switcheroo', bx, g.tanks[1].y - 10);
    run(g);
    expect(Math.abs(g.tanks[0].x - bx)).toBeLessThan(30);
    expect(Math.abs(g.tanks[1].x - ax)).toBeLessThan(30);
  });

  it('singularity drags a nearby tank toward the centre before it blows', () => {
    const g = mk(4);
    const t = g.tanks[1];
    g.terrain.flatten(t.x, t.y, 300);
    t.y = g.groundUnder(t.x, t.y - 30);
    const x0 = t.x;
    dropOn(g, 'singularity', x0 - 90, t.y - 2);
    run(g);
    expect(t.x).toBeLessThan(x0 - 15);
    expect(g.players[0].score).toBeGreaterThan(0);
  });

  it('phase shell flies through a wall of rock', () => {
    const g = mk(6);
    g.current = 0;
    g.wind = 0;
    const a = g.tanks[0],
      b = g.tanks[1];
    g.terrain.addMound((a.x + b.x) / 2, 80, 600); // a pillar far taller than any arc
    g.player.weapons = ['phase-shell', 'shell'];
    g.player.selected = 0;
    g.apply({ t: 'fire' });
    const c = tankCenter(b);
    g.projectiles.forEach((p) => ((p.x = a.x + 40), (p.y = c.y), (p.vx = 600), (p.vy = 0)));
    // no gravity for the test: keep it level
    g.projectiles.forEach((p) => (p.def = { ...p.def, gravityScale: 0, fuse: 20 }));
    run(g);
    expect(g.players[0].score).toBeGreaterThan(15);
  });

  it('orbital lance cuts a deep trench', () => {
    const g = mk(7);
    const x = 800;
    const y0 = g.terrain.surfaceBelow(x, 0);
    dropOn(g, 'orbital-lance', x, y0 - 2);
    run(g);
    expect(g.terrain.surfaceBelow(x, 0)).toBeGreaterThan(y0 + 120);
  });

  it('a tank that keeps creeping on the ground is made to sit still, and the turn always ends', () => {
    const g = mk(8);
    g.current = 0;
    g.player.weapons = ['shell'];
    g.player.selected = 0;
    g.apply({ t: 'aim', angle: 89, power: 5 });
    g.apply({ t: 'fire' });
    const t = g.tanks[1];
    let creeping = 0;
    for (let n = 0; n < 20 / DT; n++) {
      t.vx = t.falling ? t.vx : 40; // something keeps nudging it
      g.update(DT);
      if (t.settled > 0) creeping++;
    }
    expect(creeping).toBeGreaterThan(0);
    expect(g.phase).not.toBe('flight');
  });
});
