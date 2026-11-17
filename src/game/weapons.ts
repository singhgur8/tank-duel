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

/**
 * A blast that throws out `kids` slow hops, each of which blasts and throws out its own, `depth` times over,
 * so the explosions ripple outward. The hops are slow: if they start inside a tank (a point-blank shot) they
 * can't get clear before they are allowed to hit it, and the whole cascade goes off inside its hull.
 */
const ripple = (depth: number, radius: number, damage: number, kids: number, color: string): ProjectileDef => ({
  radius: 2.5 + depth * 0.6,
  color,
  glow: color,
  trail: 'spark',
  onImpact: [
    boom(radius, damage, depth > 1 ? 'standard' : 'small'),
    ...(depth > 0
      ? [{ type: 'spawn', count: kids, spreadDeg: 110, direction: 'up', speed: 150, speedJitter: 0.3, angleJitter: 10, projectile: ripple(depth - 1, radius * 0.9, Math.max(4, Math.round(damage * 0.9)), kids, color) } as Action]
      : []),
  ],
});

/** A blob of mud that rolls to low ground and drops its dirt there. */
const mudBlob: ProjectileDef = { radius: 4, color: '#8b6440', trail: 'dirt', roll: { maxTime: 4 }, onImpact: [{ type: 'dirt', radius: 17 }] };

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

  {
    id: 'excavator', name: 'Excavator', category: 'explosive',
    description: 'Scoops out an enormous crater but barely scratches armour.',
    projectile: { radius: 5, color: '#e0b070', trail: 'dirt', onImpact: [boom(120, 10, 'dirt'), { type: 'shake', amount: 0.4 }] },
    ai: { value: 2 },
  },
  {
    id: 'thunderbolt', name: 'Thunderbolt', category: 'explosive',
    description: 'Calls lightning down on the spot it lands. Hits hard in a narrow column.',
    projectile: { radius: 4, color: '#dff0ff', glow: '#7fb8ff', trail: 'plasma', onImpact: [{ type: 'lightning', radius: 48, damage: 52 }] },
    ai: { value: 7 },
  },
  {
    id: 'earthquake', name: 'Earthquake', category: 'explosive',
    description: 'Shakes the ground around the impact, cracking hills and rattling every tank nearby.',
    projectile: { radius: 6, color: '#c9a37a', trail: 'dirt', onImpact: [boom(20, 8, 'dirt'), { type: 'quake', radius: 230, damage: 34 }] },
    ai: { value: 7 },
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

  {
    id: 'chain-gun', name: 'Chain Gun', category: 'spread',
    description: 'A rattling stream of eight small rounds.',
    volley: { count: 8, spreadDeg: 3, delay: 0.07 },
    projectile: { radius: 2.5, color: '#fff0c0', trail: 'spark', onImpact: [boom(16, 8, 'small')] },
    ai: { value: 6 },
  },
  {
    id: 'scattergun', name: 'Scattergun', category: 'spread',
    description: 'Seven pellets in a wide cone. Deadly up close.',
    volley: { count: 7, spreadDeg: 16 },
    projectile: { radius: 2.5, color: '#ffe0a0', trail: 'spark', onImpact: [boom(18, 10, 'small')] },
    ai: { value: 5 },
  },
  {
    id: 'fireworks', name: 'Fireworks', category: 'spread',
    description: 'Bursts at its peak into a ring of colourful stars that fall as little blasts.',
    projectile: {
      radius: 4.5, color: '#ffffff', glow: '#ff7ad9', trail: 'spark',
      onApex: [
        { type: 'spawn', count: 6, spreadDeg: 300, direction: 'up', speed: 170, speedJitter: 0.3, projectile: { radius: 3, color: '#ff5ac8', glow: '#ff5ac8', trail: 'plasma', onImpact: [boom(22, 9, 'plasma')] } },
        { type: 'spawn', count: 6, spreadDeg: 300, direction: 'up', speed: 120, speedJitter: 0.3, projectile: { radius: 3, color: '#5ae8ff', glow: '#5ae8ff', trail: 'plasma', onImpact: [boom(22, 9, 'ice')] } },
        { type: 'spawn', count: 6, spreadDeg: 300, direction: 'up', speed: 220, speedJitter: 0.3, projectile: { radius: 3, color: '#ffd84a', glow: '#ffd84a', trail: 'spark', onImpact: [boom(22, 9, 'small')] } },
        { type: 'shake', amount: 0.25 },
      ],
      consumeOnApex: true,
      onImpact: [boom(22, 9)],
    },
    ai: { value: 5 },
  },
  {
    id: 'airstrike', name: 'Airstrike', category: 'spread',
    description: 'Marks the top of its arc, then a line of bombs drops straight down below it.',
    projectile: {
      radius: 4, color: '#ffef9a', trail: 'smoke',
      onApex: [{ type: 'spawn', count: 7, spreadDeg: 0, spacing: 42, direction: 'down', speed: 60, angleJitter: 2, projectile: { radius: 3.5, color: '#d9d9d9', trail: 'smoke', onImpact: [boom(30, 16)] } }],
      consumeOnApex: true,
      onImpact: [boom(30, 16)],
    },
    ai: { value: 5 },
  },
  {
    id: 'acid-rain', name: 'Acid Rain', category: 'spread',
    description: 'Bursts overhead into a cloud of corrosive drops.',
    projectile: {
      radius: 5, color: '#c8ff7a', glow: '#7dff3a', trail: 'plasma',
      onApex: [{ type: 'spawn', count: 20, spreadDeg: 70, direction: 'down', speed: 90, speedJitter: 0.7, angleJitter: 6, projectile: { radius: 2.2, color: '#a6ff4d', glow: '#7dff3a', trail: 'none', onImpact: [boom(14, 5, 'acid')] } }],
      consumeOnApex: true,
      onImpact: [boom(14, 5, 'acid')],
    },
    ai: { value: 6 },
  },
  {
    id: 'swarm', name: 'Swarm', category: 'spread',
    description: 'Releases three small seekers at its peak that hunt the enemy.',
    projectile: {
      radius: 5, color: '#ff9a9a', trail: 'smoke',
      onApex: [{ type: 'spawn', count: 3, spreadDeg: 50, direction: 'velocity', speed: 200, projectile: { radius: 3, color: '#ff6b6b', glow: '#ff3b3b', trail: 'fire', homing: { turnRate: 1.6, delay: 0.25 }, onImpact: [boom(26, 16)] } }],
      consumeOnApex: true,
      onImpact: [boom(26, 16)],
    },
    ai: { value: 7 },
  },

  {
    id: 'ripple', name: 'Ripple', category: 'spread',
    description: 'Each blast kicks out two more, which kick out two more. Point-blank, it can go off again and again inside a tank.',
    projectile: ripple(2, 30, 14, 2, '#ffd36b'),
    ai: { value: 6 },
  },
  {
    id: 'big-ripple', name: 'Big Ripple', category: 'spread',
    description: 'A longer chain of rippling blasts that spreads across the ground.',
    projectile: ripple(3, 34, 15, 2, '#ffb347'),
    ai: { value: 7 },
  },
  {
    id: 'ripple-storm', name: 'Ripple Storm', category: 'spread',
    description: 'Every blast throws out three more, four generations deep. Devastating if it starts inside the enemy.',
    projectile: ripple(3, 30, 13, 3, '#ff7a3d'),
    ai: { value: 9 },
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

  {
    id: 'triple-roller', name: 'Triple Roller', category: 'special',
    description: 'Three rollers at once, fanned slightly apart.',
    volley: { count: 3, spreadDeg: 8 },
    projectile: { radius: 4.5, color: '#d6d6d6', glow: '#ffffff', trail: 'spark', roll: { maxTime: 6 }, onImpact: [boom(36, 22)] },
    ai: { value: 6 },
  },
  {
    id: 'wild-ball', name: 'Wild Ball', category: 'special',
    description: 'A super-bouncy ball that ricochets eight times before it goes off.',
    projectile: { radius: 4.5, color: '#ffe066', glow: '#ffc400', trail: 'spark', bounces: 8, restitution: 0.86, onImpact: [boom(46, 34)] },
    ai: { value: 4 },
  },
  {
    id: 'pile-driver', name: 'Pile Driver', category: 'special',
    description: 'Stops at its peak, slams straight down through the ground and blows up underneath.',
    projectile: {
      radius: 5, color: '#cfcfcf', trail: 'smoke',
      onApex: [{ type: 'spawn', count: 1, spreadDeg: 0, direction: 'down', speed: 760, projectile: { radius: 5, color: '#e8e8e8', glow: '#ffffff', trail: 'spark', burrow: { length: 60, radius: 7, speed: 420 }, onImpact: [boom(58, 48, 'big')] } }],
      consumeOnApex: true,
      onImpact: [boom(58, 48, 'big')],
    },
    ai: { value: 6 },
  },
  {
    id: 'mole-swarm', name: 'Mole Swarm', category: 'special',
    description: 'Digs in, then splits into four burrowers that tunnel outward and blow up.',
    projectile: {
      radius: 5, color: '#e0b070', trail: 'dirt', burrow: { length: 40, radius: 7, speed: 300 },
      onImpact: [
        boom(24, 10, 'dirt'),
        { type: 'spawn', count: 4, spreadDeg: 140, direction: 'down', speed: 300, projectile: { radius: 3, color: '#e0b070', trail: 'dirt', burrow: { length: 90, radius: 6, speed: 300 }, onImpact: [boom(32, 18, 'dirt')] } },
      ],
    },
    ai: { value: 5 },
  },
  {
    id: 'tracer', name: 'Tracer', category: 'special',
    description: 'A harmless sighting round. Its full path stays on screen so you can line up the next shot.',
    projectile: { radius: 3, color: '#9effc8', glow: '#4dff9a', trail: 'spark', tracer: true, onImpact: [{ type: 'shake', amount: 0.05 }] },
    ai: { value: 0 },
  },

  {
    id: 'fuse-grenade', name: 'Fuse Grenade', category: 'special',
    description: 'Bounces and rolls around, then goes off exactly 3.5 seconds after launch.',
    projectile: { radius: 4.5, color: '#9bd17a', glow: '#6fbf4a', trail: 'spark', bounces: 12, restitution: 0.5, friction: 0.25, fuse: 3.5, onImpact: [boom(58, 48, 'big')] },
    ai: { value: 4 },
  },
  {
    id: 'prox-shell', name: 'Proximity Shell', category: 'special',
    description: 'Bursts in mid-air as soon as it passes close to an enemy tank.',
    projectile: { radius: 4, color: '#ffe36b', glow: '#ffc400', trail: 'smoke', proximity: 48, onImpact: [boom(46, 36)] },
    ai: { value: 7 },
  },
  {
    id: 'crawler', name: 'Crawler', category: 'special',
    description: 'Lands and drives on along the ground for up to five seconds, climbing hills, and blows up on contact.',
    projectile: { radius: 5, color: '#c0c6cc', glow: '#ff5a5a', trail: 'smoke', crawl: { speed: 95, time: 5 }, onImpact: [boom(50, 40)] },
    ai: { value: 5 },
  },
  {
    id: 'boomerang', name: 'Boomerang', category: 'special',
    description: 'Curves back toward you in flight. Lob it past the enemy and let it come home. Can hit you too.',
    projectile: { radius: 4.5, color: '#ffcf6b', glow: '#ff9f1a', trail: 'spark', pull: 190, windScale: 0.5, onImpact: [boom(44, 36)] },
    ai: { value: 3 },
  },
  {
    id: 'breaker', name: 'Breaker', category: 'special',
    description: 'A short, wide blast straight out of the barrel. Smashes through dirt and anything right in front of you.',
    beam: { length: 170, width: 20, damage: 42, color: '#ffb347' },
    ai: { value: 4 },
  },
  {
    id: 'warp-shell', name: 'Warp Shell', category: 'utility',
    description: 'Teleports your tank to wherever the shell lands.',
    projectile: { radius: 4, color: '#c7a8ff', glow: '#9a6bff', trail: 'plasma', onImpact: [{ type: 'teleport' }] },
    ai: { value: 0 },
  },
  {
    id: 'gust', name: 'Gust Bomb', category: 'special',
    description: 'A blast of air that flings tanks away. Little damage, but it can toss them into craters.',
    projectile: { radius: 5, color: '#e6f4ff', glow: '#9fd8ff', trail: 'ice', onImpact: [boom(20, 6, 'ice'), { type: 'push', radius: 150, strength: 420 }, { type: 'shake', amount: 0.4 }] },
    ai: { value: 3 },
  },
  {
    id: 'vortex', name: 'Vortex', category: 'special',
    description: 'Sucks nearby tanks in toward the impact, then pops.',
    projectile: { radius: 5, color: '#b388ff', glow: '#7c4dff', trail: 'plasma', onImpact: [{ type: 'push', radius: 260, strength: -260 }, boom(34, 22, 'plasma')] },
    ai: { value: 4 },
  },
  {
    id: 'lucky-dip', name: 'Lucky Dip', category: 'special',
    description: 'Nobody knows what is inside: a big blast, fire, a dirt dump, bomblets, lightning, or a damp squib.',
    projectile: {
      radius: 5, color: '#ff8ad8', glow: '#ffd36b', trail: 'spark',
      onImpact: [{
        type: 'random',
        options: [
          [boom(85, 60, 'big'), { type: 'shake', amount: 0.5 }],
          [boom(20, 6, 'fire'), { type: 'napalm', count: 12, duration: 3.6, dps: 9, spread: 120 }],
          [{ type: 'dirt', radius: 70 }],
          [boom(30, 14), { type: 'spawn', count: 8, spreadDeg: 120, direction: 'up', speed: 300, speedJitter: 0.35, angleJitter: 8, projectile: bomblet(24, 10) }],
          [{ type: 'lightning', radius: 50, damage: 50 }],
          [boom(10, 2, 'small')],
        ],
      }],
    },
    ai: { value: 5 },
  },
  {
    id: 'long-shot', name: 'Long Shot', category: 'explosive',
    description: 'One time in four it is the biggest blast in the game. The rest of the time it fizzles.',
    projectile: {
      radius: 5, color: '#fff3a0', glow: '#ffd400', trail: 'spark',
      onImpact: [{ type: 'lottery', chance: 0.25, hit: [boom(150, 100, 'nuke')], miss: [boom(12, 3, 'small')] }],
    },
    ai: { value: 4 },
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

  {
    id: 'volcano', name: 'Volcano', category: 'special',
    description: 'Erupts on impact, hurling burning lava bombs up and around.',
    projectile: {
      radius: 6, color: '#ff7a2e', glow: '#ff4a12', trail: 'fire',
      onImpact: [
        boom(34, 18, 'fire'),
        { type: 'spawn', count: 12, spreadDeg: 120, direction: 'up', speed: 330, speedJitter: 0.4, angleJitter: 8, projectile: { radius: 3, color: '#ffb347', glow: '#ff5a1f', trail: 'fire', onImpact: [boom(20, 8, 'fire')] } },
        { type: 'shake', amount: 0.4 },
      ],
    },
    ai: { value: 7 },
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
  {
    id: 'spire', name: 'Spire', category: 'utility',
    description: 'Raises a tall, narrow pillar of rock. Blocks low shots.',
    projectile: { radius: 5, color: '#a77a4f', trail: 'dirt', onImpact: [{ type: 'mound', width: 54, height: 230 }] },
    ai: { value: 1 },
  },
  {
    id: 'dome', name: 'Bunker Dome', category: 'utility',
    description: 'Builds a hollow arch of dirt over the landing spot. Shelter yourself or box in the enemy.',
    projectile: { radius: 5, color: '#a77a4f', trail: 'dirt', onImpact: [{ type: 'dome', radius: 62, thickness: 12 }] },
    ai: { value: 1 },
  },
  {
    id: 'mudslide', name: 'Mudslide', category: 'utility',
    description: 'Bursts into blobs of mud that roll downhill and fill the low ground.',
    projectile: {
      radius: 5, color: '#8b6440', trail: 'dirt',
      onImpact: [{ type: 'dirt', radius: 14 }, { type: 'spawn', count: 9, spreadDeg: 140, direction: 'up', speed: 190, speedJitter: 0.4, angleJitter: 6, projectile: mudBlob }],
    },
    ai: { value: 1 },
  },
];

export const WEAPON_MAP: Record<string, WeaponDef> = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

export function getWeapon(id: string): WeaponDef {
  const w = WEAPON_MAP[id];
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}
