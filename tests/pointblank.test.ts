import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import { DT } from '../src/config';
import { tankCenter, muzzle } from '../src/game/flight';

const mk = (seed: number) => new Game({ players: [{ name: 'A' }, { name: 'B' }], weaponsPerPlayer: 10, seed, maxWind: 0 });

function shoot(g: Game, id: string) {
  g.player.weapons = [id, 'shell'];
  g.player.selected = 0;
  const me = g.current;
  // Damage dealt to other tanks (self-hits now cost the shooter points, so the score alone isn't the measure).
  let dealt = 0;
  const orig = g.applyDamage.bind(g);
  g.applyDamage = (tank, amount, owner, x, y, popup) => {
    if (tank !== me && owner === me) dealt += amount;
    orig(tank, amount, owner, x, y, popup);
  };
  g.apply({ t: 'fire' });
  let n = 0;
  while (g.phase === 'flight' && n++ < 40 / DT) g.update(DT);
  return dealt;
}

/** Park the enemy right in front of the shooter's barrel. */
function pointBlank(seed: number) {
  const g = mk(seed);
  g.current = 0;
  g.wind = 0;
  const [a, b] = g.tanks;
  g.terrain.flatten(a.x + 30, a.y, 200);
  b.x = a.x + 38;
  b.y = a.y = g.groundUnder(a.x, a.y - 30);
  b.tilt = a.tilt = 0;
  const cb = tankCenter(b);
  const ca = { x: a.x, y: a.y - 17 };
  g.player.angle = (Math.atan2(-(cb.y - ca.y), cb.x - ca.x) * 180) / Math.PI;
  const m = muzzle(a, g.player.angle);
  expect(Math.hypot(m.x - cb.x, m.y - cb.y)).toBeLessThan(20); // barrel is inside the enemy
  return g;
}

describe('point-blank shots', () => {
  it('a ripple fired from inside the enemy cascades into a huge hit', () => {
    let pb = 0;
    for (const s of [1, 2, 3]) pb = Math.max(pb, shoot(pointBlank(s), 'ripple-storm'));
    // a normal ranged direct hit for comparison: drop it on the enemy from above
    const g = mk(4);
    g.current = 0;
    g.player.weapons = ['ripple-storm', 'shell'];
    g.player.selected = 0;
    const t = g.tanks[1];
    g.apply({ t: 'fire' });
    g.projectiles.forEach((p) => ((p.x = t.x), (p.y = t.y - 90), (p.vx = 0), (p.vy = 300)));
    let n = 0;
    while (g.phase === 'flight' && n++ < 40 / DT) g.update(DT);
    const ranged = g.players[0].score;
    console.log({ pb, ranged });
    expect(pb).toBeGreaterThan(ranged * 1.8);
    expect(pb).toBeGreaterThan(130);
  });

  it('a plain shell point-blank is a normal direct hit', () => {
    const d = shoot(pointBlank(2), 'shell');
    expect(d).toBeLessThanOrEqual(35);
  });
});
