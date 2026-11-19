import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import { CpuController, pickTarget } from '../src/game/ai';
import { Rng } from '../src/core/rng';
import { DT, WORLD_W } from '../src/config';

const three = (seed: number, cpu = false) =>
  new Game({ players: [0, 1, 2].map((i) => ({ name: `P${i}`, cpuLevel: cpu ? 6 + i : undefined })), weaponsPerPlayer: 4, seed });

describe('three players', () => {
  it('spawns three spaced tanks, deals three hands and rotates turns', () => {
    const g = three(5);
    expect(g.tanks.length).toBe(3);
    const xs = g.tanks.map((t) => t.x).sort((a, b) => a - b);
    expect(xs[1] - xs[0]).toBeGreaterThan(WORLD_W * 0.2);
    expect(xs[2] - xs[1]).toBeGreaterThan(WORLD_W * 0.2);
    for (const p of g.players) expect(p.weapons.length).toBe(4);
    const order: number[] = [];
    for (let k = 0; k < 4; k++) {
      order.push(g.current);
      g.player.weapons = ['dirt-ball', ...g.player.weapons.slice(1)];
      g.player.selected = 0;
      g.apply({ t: 'aim', angle: 90, power: 10 });
      g.apply({ t: 'fire' });
      let n = 0;
      while (g.phase === 'flight' && n++ < 30 / DT) g.update(DT);
    }
    expect(order[1]).toBe((order[0] + 1) % 3);
    expect(order[2]).toBe((order[0] + 2) % 3);
    expect(order[3]).toBe(order[0]);
  });

  it('skips players who have run out of weapons', () => {
    const g = three(6);
    const c = g.current;
    g.players[(c + 1) % 3].weapons = [];
    g.player.weapons = ['dirt-ball'];
    g.player.selected = 0;
    g.apply({ t: 'aim', angle: 90, power: 10 });
    g.apply({ t: 'fire' });
    while (g.phase === 'flight') g.update(DT);
    expect(g.current).toBe((c + 2) % 3);
  });

  it('hurting yourself takes points off your own score, and scores can go negative', () => {
    const g = three(7);
    g.players[0].score = 50;
    g.applyDamage(0, 30, 0, 0, 0);
    expect(g.players[0].score).toBe(20);
    expect(g.players[1].score).toBe(0);
    expect(g.players[2].score).toBe(0);
    g.applyDamage(0, 30, 0, 0, 0);
    expect(g.players[0].score).toBe(-10);
    g.applyDamage(1, 25, 0, 0, 0);
    expect(g.players[0].score).toBe(15);
  });

  it('CPU targets the leading opponent', () => {
    const g = three(8);
    g.players[2].score = 50;
    expect(pickTarget(g, 0)).toBe(2);
    g.players[1].score = 80;
    expect(pickTarget(g, 0)).toBe(1);
  });

  it('an all-CPU three-way game plays to the end', () => {
    const g = three(9, true);
    const cpus = g.players.map((p, i) => new CpuController(g, i, p.cpuLevel!, new Rng(100 + i)));
    let last = '';
    for (let i = 0; i < 600 / DT && g.phase !== 'gameover'; i++) {
      const key = `${g.turn}:${g.phase}`;
      if (g.phase === 'aim' && key !== last) cpus[g.current].beginTurn();
      last = key;
      cpus[g.current].update(DT);
      g.update(DT);
    }
    expect(g.phase).toBe('gameover');
    expect(g.players.some((p) => p.score > 0)).toBe(true);
  });
});

describe('four players', () => {
  it('spawns four tanks spread across the field and rotates through all of them', () => {
    const g = new Game({ players: [0, 1, 2, 3].map((i) => ({ name: `P${i}` })), weaponsPerPlayer: 3, seed: 12 });
    expect(g.tanks.length).toBe(4);
    const xs = g.tanks.map((t) => t.x).sort((a, b) => a - b);
    for (let i = 1; i < 4; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThan(WORLD_W * 0.15);
    const seen = new Set<number>();
    for (let k = 0; k < 4; k++) {
      seen.add(g.current);
      g.player.weapons = ['dirt-ball', ...g.player.weapons.slice(1)];
      g.player.selected = 0;
      g.apply({ t: 'aim', angle: 90, power: 10 });
      g.apply({ t: 'fire' });
      let n = 0;
      while (g.phase === 'flight' && n++ < 30 / DT) g.update(DT);
    }
    expect(seen.size).toBe(4);
    g.applyDamage(3, 30, 0, 0, 0);
    expect(g.players[0].score).toBe(30);
  });
});
