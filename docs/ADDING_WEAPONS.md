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
| `fuse` | Go off N seconds after launch, wherever it is (bounces and rolls meanwhile; a countdown shows) |
| `proximity` | Burst in flight when this close to an enemy tank |
| `crawl` | After landing, drive along the ground at a set speed for a set time, climbing hills |
| `pull` | Horizontal pull back toward the shooter (boomerang) |
| `friction` | Share of the along-surface speed lost per bounce |
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
| `teleport` | Move the shooter's tank to the impact point |
| `push` | Shove tanks away (`strength` > 0) or pull them in (< 0), no damage |
| `dome` | Hollow arch of dirt over the point |
| `lottery` | `hit` actions with probability `chance`, else `miss` |
| `random` | One of several action lists, chosen at random (deterministically, from the game seed) |
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

## Point-blank behaviour

Sub-munitions ignore the tank they burst from for only 0.04 s (a shooter's own shell ignores its shooter for 0.12 s).
Slow children born deep inside a hull therefore hit it again; fast ones escape. Tune a weapon's point-blank strength
with its child speed and count rather than with special cases.

## New building blocks

- `look` on a projectile picks its sprite: shell, grenade, bomb, missile, orb, ball, pellet, canister, clod, drill, kernel or crawler. Left out, one is chosen from what the projectile does.
- `phase: true` flies through terrain.
- Actions: `delay` (run actions later at the same spot), `charge` (gathering-energy visual), `steal` (take points), `swap` (trade places with the nearest tank), `column` (beam from the sky that cuts a trench).
- Spawn direction `mirror` flips the parent's velocity left/right.
- `rubber` (wall or coat of springy rubber), `scramble` (randomise enemies' angle and power for their next turn).
