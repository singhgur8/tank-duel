# Adding weapons

Weapons are data in `src/game/weapons.ts`. A weapon is a projectile (or a beam) plus lists of **actions**
that run on events. Copy an existing entry, give it a new `id`, change the numbers, and it's in the game:
the deal, the picker, the CPU and the effects all pick it up automatically.

```ts
{
  id: 'twin-roller', name: 'Twin Roller', category: 'special',
  description: 'Two rollers in a narrow fan.',
  volley: { count: 2, spreadDeg: 4 },
  projectile: { radius: 5, color: '#d6d6d6', trail: 'spark', roll: { maxTime: 6 }, onImpact: [boom(48, 30)] },
  ai: { value: 5 },
}
```

## Projectile fields (`ProjectileDef`)

| Field | Effect |
| --- | --- |
| `color`, `glow`, `radius`, `trail` | Look. Trails: `smoke`, `fire`, `spark`, `plasma`, `dirt`, `ice`, `none` |
| `gravityScale`, `windScale`, `speedScale` | Physics multipliers (e.g. `windScale: 0` ignores wind) |
| `bounces`, `restitution`, `onBounce` | Bounce off terrain N times, running `onBounce` actions each time |
| `roll` | Roll along the ground after landing, detonating when it stops, hits a wall or touches a tank |
| `burrow` | Keep travelling through the ground, carving a tunnel, then run `onImpact` |
| `homing` | Steer toward the enemy after `delay` seconds |
| `onApex`, `consumeOnApex` | Actions at the top of the arc (splitters, hail); optionally remove the parent |
| `tracer` | Keep the whole flight path on screen as a dotted line until the next tracer |
| `onImpact` | Actions when it finally hits |

## Actions

| Action | Does |
| --- | --- |
| `explode` | Crater + damage. `style` picks the look: `small`, `standard`, `big`, `nuke`, `plasma`, `fire`, `dirt`, `ice`, `acid` |
| `spawn` | Child projectiles (any `ProjectileDef`, so children can spawn children). Direction `velocity`, `up`, `down` or `forward`. `spacing` lays them out in a line (airstrike), `lift` starts them higher |
| `dirt` | Ball of dirt |
| `mound` | Hill of dirt |
| `flatten` | Level the ground |
| `napalm` | Burning liquid that flows downhill |
| `lightning` | Bolt from the sky onto the point; damages tanks within `radius` horizontally |
| `quake` | Cracks the ground and damages grounded tanks within `radius` |
| `shake` | Extra camera shake |

Weapon-level fields: `volley` (several shots per fire, optional delay between them), `beam` (instant straight
beam instead of a projectile) and `ai.value` (how much the CPU likes it).

## New behaviour types

To add a behaviour that can't be composed from the above, add a variant to `Action` in `src/game/types.ts`
and handle it in `runAction` in `src/game/game.ts`. Keep gameplay randomness on `game.rng` (not
`Math.random`) so matches stay deterministic, and send visuals through the `Fx` interface.

## Weapons in play

Every weapon in `WEAPONS` shows up automatically in the lobby's *Weapons in play* list, where players can switch it
on or off. Give it an icon in `src/render/icons.ts` (a new `DRAW` entry, or point `icon` at an existing key); the
test suite checks that every weapon has one.
