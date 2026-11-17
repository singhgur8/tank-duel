import type { Action, ExplosionStyle, ProjectileDef, WeaponDef } from './types';

/*
 * The weapon arsenal. Everything here is data: copy an entry, change the numbers or the action lists,
 * give it a new id, and it is in the game. See types.ts for every available field.
 */

const boom = (radius: number, damage: number, style: ExplosionStyle = 'standard'): Action => ({
  type: 'explode',
  radius,
  damage,
  style,
});

const bomblet = (radius: number, damage: number, color = '#ffd36b'): ProjectileDef => ({
  radius: 2.5,
  color,
  trail: 'spark',
  onImpact: [boom(radius, damage, 'small')],
});

/** A hop that explodes and launches the next hop, `depth` times. */
const hopper = (depth: number): ProjectileDef => ({
  radius: 3.5,
  color: '#ff4fd8',
  glow: '#ff4fd8',
  trail: 'plasma',
  onImpact:
    depth <= 0
      ? [boom(38, 22, 'plasma')]
      : [
          boom(26, 14, 'plasma'),
          { type: 'spawn', count: 1, spreadDeg: 0, direction: 'forward', speed: 330, angleJitter: 4, projectile: hopper(depth - 1) },
        ],
});

export const WEAPONS: WeaponDef[] = [
  // ── Explosives ──────────────────────────────────────────────
  {
    id: 'shell', name: 'Shell', category: 'explosive',
    description: 'A reliable standard round. Small blast.',
    projectile: { radius: 3.5, color: '#ffe8a8', trail: 'smoke', onImpact: [boom(32, 30)] },
    ai: { value: 3 },
  },
  {
    id: 'heavy-shell', name: 'Heavy Shell', category: 'explosive',
    description: 'Bigger payload, bigger crater.',
    projectile: { radius: 4.5, color: '#ffc46b', trail: 'smoke', onImpact: [boom(55, 45, 'big')] },
    ai: { value: 5 },
  },
  {
    id: 'megaton', name: 'Megaton', category: 'explosive',
    description: 'Huge blast radius. Hard to miss with.',
    projectile: { radius: 6, color: '#ff9b4a', glow: '#ff7a2e', trail: 'fire', onImpact: [boom(90, 65, 'big'), { type: 'shake', amount: 0.5 }] },
    ai: { value: 8 },
  },
  {
    id: 'doomsday', name: 'Doomsday', category: 'explosive',
    description: 'Devastating mushroom-cloud blast. Craters half the map.',
    projectile: { radius: 7, color: '#fff3a0', glow: '#ffef7a', trail: 'fire', onImpact: [boom(140, 90, 'nuke')] },
    ai: { value: 10 },
  },
  {
    id: 'rail-slug', name: 'Rail Slug', category: 'explosive',
    description: 'Very fast and flat. Ignores wind. Small blast, high damage.',
    projectile: { radius: 2.5, color: '#bff6ff', glow: '#6fe3ff', trail: 'spark', speedScale: 1.35, gravityScale: 0.45, windScale: 0, onImpact: [boom(20, 50, 'plasma')] },
    ai: { value: 6 },
  },
  {
    id: 'ion-orb', name: 'Ion Orb', category: 'explosive',
    description: 'Slow, floaty plasma orb with a crackling electric blast.',
    projectile: { radius: 7, color: '#9ef0ff', glow: '#3fb6ff', trail: 'plasma', speedScale: 0.8, gravityScale: 0.55, windScale: 1.6, onImpact: [boom(60, 48, 'plasma')] },
    ai: { value: 6 },
  },
  {
    id: 'frost-bomb', name: 'Frost Bomb', category: 'explosive',
    description: 'Shatters into a shower of ice shards.',
    projectile: {
      radius: 5, color: '#e4fbff', glow: '#9fe8ff', trail: 'ice',
      onImpact: [
        boom(42, 30, 'ice'),
        { type: 'spawn', count: 8, spreadDeg: 140, direction: 'up', speed: 260, speedJitter: 0.4, angleJitter: 6,
          projectile: { radius: 2, color: '#d8f8ff', trail: 'ice', onImpact: [boom(14, 6, 'ice')] } },
      ],
    },
    ai: { value: 5 },
  },

  // ── Spreads & splitters ─────────────────────────────────────
  {
    id: 'trio', name: 'Trio', category: 'spread',
    description: 'Three shells in a tight fan.',
    volley: { count: 3, spreadDeg: 6 },
    projectile: { radius: 3.5, color: '#ffe8a8', trail: 'smoke', onImpact: [boom(30, 20)] },
    ai: { value: 5 },
  },
  {
    id: 'quintet', name: 'Quintet', category: 'spread',
    description: 'Five shells in a wide fan.',
    volley: { count: 5, spreadDeg: 12 },
    projectile: { radius: 3.5, color: '#ffe8a8', trail: 'smoke', onImpact: [boom(30, 18)] },
    ai: { value: 6 },
  },
  {
    id: 'burst', name: 'Burst Fire', category: 'spread',
    description: 'Four rounds fired in quick succession.',
    volley: { count: 4, spreadDeg: 0, delay: 0.14 },
    projectile: { radius: 3, color: '#fff0c0', trail: 'spark', onImpact: [boom(26, 16)] },
    ai: { value: 6 },
  },
  {
    id: 'splitter', name: 'Splitter', category: 'spread',
    description: 'Splits into five warheads at the top of its arc.',
    projectile: {
      radius: 5, color: '#ffd36b', trail: 'smoke',
      onApex: [{ type: 'spawn', count: 5, spreadDeg: 22, direction: 'velocity', projectile: { radius: 3.5, color: '#ffd36b', trail: 'smoke', onImpact: [boom(34, 22)] } }],
      consumeOnApex: true,
      onImpact: [boom(34, 22)],
    },
    ai: { value: 7 },
  },
  {
    id: 'cluster', name: 'Cluster Bomb', category: 'spread',
    description: 'Explodes and scatters bomblets around the target.',
    projectile: {
      radius: 5, color: '#ffb35a', trail: 'smoke',
      onImpact: [
        boom(36, 22),
        { type: 'spawn', count: 7, spreadDeg: 110, direction: 'up', speed: 300, speedJitter: 0.35, angleJitter: 8, projectile: bomblet(24, 10) },
      ],
    },
    ai: { value: 7 },
  },
  {
    id: 'hailstorm', name: 'Hailstorm', category: 'spread',
    description: 'Bursts at its peak and rains pellets down below.',
    projectile: {
      radius: 5, color: '#cfe8ff', trail: 'ice',
      onApex: [{ type: 'spawn', count: 14, spreadDeg: 50, direction: 'down', speed: 120, speedJitter: 0.6, angleJitter: 5, projectile: { radius: 2.5, color: '#e7f4ff', trail: 'ice', onImpact: [boom(20, 8, 'ice')] } }],
      consumeOnApex: true,
      onImpact: [boom(20, 8, 'ice')],
    },
    ai: { value: 6 },
  },
  {
    id: 'jumping-jack', name: 'Jumping Jack', category: 'spread',
    description: 'Hops forward exploding five times.',
    projectile: hopper(4),
    ai: { value: 6 },
  },

  // ── Special movement ────────────────────────────────────────
  {
    id: 'roller', name: 'Roller', category: 'special',
    description: 'Lands and rolls downhill, exploding when it stops or hits a tank.',
    projectile: { radius: 5, color: '#d6d6d6', glow: '#ffffff', trail: 'spark', roll: { maxTime: 6 }, onImpact: [boom(48, 40)] },
    ai: { value: 4 },
  },
  {
    id: 'heavy-roller', name: 'Heavy Roller', category: 'special',
    description: 'A big roller with a big bang.',
    projectile: { radius: 7, color: '#bdbdbd', glow: '#ffffff', trail: 'spark', roll: { maxTime: 7 }, onImpact: [boom(75, 55, 'big')] },
    ai: { value: 5 },
  },
  {
    id: 'bouncer', name: 'Bouncer', category: 'special',
    description: 'Bounces four times, popping on every bounce.',
    projectile: { radius: 4.5, color: '#7dff9a', glow: '#3dff7a', trail: 'plasma', bounces: 4, restitution: 0.72, onBounce: [boom(22, 10, 'small')], onImpact: [boom(40, 28)] },
    ai: { value: 5 },
  },
  {
    id: 'seeker', name: 'Seeker', category: 'special',
    description: 'Locks on to the enemy after its peak and steers in.',
    projectile: { radius: 4, color: '#ff6b6b', glow: '#ff3b3b', trail: 'fire', homing: { turnRate: 2.2, delay: 0.4 }, onImpact: [boom(40, 35)] },
    ai: { value: 7 },
  },
  {
    id: 'tunneler', name: 'Tunneler', category: 'special',
    description: 'Bores a long tunnel through the ground. Great for escaping or undermining.',
    projectile: { radius: 4, color: '#e0b070', trail: 'dirt', burrow: { length: 260, radius: 10, speed: 320 }, onImpact: [boom(18, 8, 'dirt')] },
    ai: { value: 1 },
  },
  {
    id: 'bunker-buster', name: 'Bunker Buster', category: 'special',
    description: 'Drills deep before detonating underground.',
    projectile: { radius: 4.5, color: '#ffcf8a', trail: 'smoke', burrow: { length: 70, radius: 6, speed: 260 }, onImpact: [boom(62, 50, 'big')] },
    ai: { value: 6 },
  },
  {
    id: 'laser', name: 'Laser Lance', category: 'special',
    description: 'A straight beam. No gravity, no wind. Burns through hills.',
    beam: { length: 2200, width: 7, damage: 38, color: '#ff3df0' },
    ai: { value: 6 },
  },

  // ── Fire ────────────────────────────────────────────────────
  {
    id: 'napalm', name: 'Napalm', category: 'special',
    description: 'Sticky fire that flows downhill and burns anything it touches.',
    projectile: { radius: 4.5, color: '#ff8a3d', glow: '#ff5a1a', trail: 'fire', onImpact: [boom(18, 6, 'fire'), { type: 'napalm', count: 12, duration: 3.6, dps: 9, spread: 110 }] },
    ai: { value: 6 },
  },
  {
    id: 'inferno', name: 'Inferno', category: 'special',
    description: 'A huge napalm spill.',
    projectile: { radius: 6, color: '#ff6a2a', glow: '#ff3a0a', trail: 'fire', onImpact: [boom(26, 10, 'fire'), { type: 'napalm', count: 20, duration: 4.5, dps: 10, spread: 190 }] },
    ai: { value: 8 },
  },

  // ── Utility / dirt ──────────────────────────────────────────
  {
    id: 'dirt-ball', name: 'Dirt Ball', category: 'utility',
    description: 'Dumps a ball of dirt. Bury your enemy.',
    projectile: { radius: 5, color: '#a77a4f', trail: 'dirt', onImpact: [{ type: 'dirt', radius: 60 }] },
    ai: { value: 1 },
  },
  {
    id: 'earth-wall', name: 'Earth Wall', category: 'utility',
    description: 'Raises a tall hill where it lands. Instant cover.',
    projectile: { radius: 5, color: '#a77a4f', trail: 'dirt', onImpact: [{ type: 'mound', width: 120, height: 150 }] },
    ai: { value: 1 },
  },
  {
    id: 'dirt-shower', name: 'Dirt Shower', category: 'utility',
    description: 'Bursts overhead and rains clods of dirt.',
    projectile: {
      radius: 5, color: '#a77a4f', trail: 'dirt',
      onApex: [{ type: 'spawn', count: 12, spreadDeg: 60, direction: 'down', speed: 140, speedJitter: 0.5, angleJitter: 6, projectile: { radius: 3, color: '#8b6440', trail: 'dirt', onImpact: [{ type: 'dirt', radius: 18 }] } }],
      consumeOnApex: true,
      onImpact: [{ type: 'dirt', radius: 18 }],
    },
    ai: { value: 1 },
  },
  {
    id: 'leveler', name: 'Leveler', category: 'utility',
    description: 'Flattens the ground around the impact.',
    projectile: { radius: 5, color: '#cfc2a0', trail: 'dirt', onImpact: [{ type: 'flatten', width: 220 }, { type: 'shake', amount: 0.35 }] },
    ai: { value: 1 },
  },
];

export const WEAPON_MAP: Record<string, WeaponDef> = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

export function getWeapon(id: string): WeaponDef {
  const w = WEAPON_MAP[id];
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}
