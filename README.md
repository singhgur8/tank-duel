# Tank Duel

A turn-based artillery tank game in the classic genre: two tanks, destructible hills, wind, gravity, and a
big bag of weapons. It's an original game. The mechanics follow genre conventions, and all names, art and
sound are made for this project.

- **2 players on one device** (hot-seat), or **vs CPU** with difficulty 1 to 10 (level 10 never misses when a
  trajectory exists).
- **27 weapons**, each with its own impact behaviour: shells, spreads, splitters, cluster bombs, hail, rollers,
  bouncers, seekers, tunnelers, bunker busters, a laser, napalm, and dirt/terrain tools.
- **Destructible terrain** with falling dirt, tank movement (4 moves per game), wind that changes every turn,
  and score-based play: damage you deal is your score, and hurting yourself scores for your opponent.
- **Premium feel**: real projectile physics on a fixed 120 Hz step, glowing trails, layered explosions
  (flash, fireball, sparks, debris, smoke, shockwave), screen shake, hit-stop, scorch marks, synthesized audio.
- **Plays offline**: it's a PWA, so open it once in a browser and choose *Install* to get a standalone app that
  works without a connection. No asset files: graphics are drawn in code and sounds are synthesized.

## Run it

```bash
npm install
npm run dev          # local dev server
npm run build        # production build in dist/ (installable, offline)
npm run build:single # one self-contained HTML file in dist-single/ (open it straight from disk)
npm test             # simulation + CPU tests
```

## Controls

| Action | Keyboard | Touch / mouse |
| --- | --- | --- |
| Angle | ← / → (Shift = fine) | Angle buttons or slider, or drag on the battlefield |
| Power | ↑ / ↓ (Shift = fine) | Power buttons or slider, or drag distance |
| Weapon | Q / E, W for the list | ‹ › or tap the weapon name |
| Move tank | A / D | ◀ ▶ |
| Fire | Space / Enter | FIRE |
| Pause | Esc | ❚❚ |

## Project layout

```
src/
  config.ts            tuning constants (gravity, speeds, world size, moves)
  core/terrain.ts      pixel-mask terrain: carve, add dirt, mounds, flatten, settle
  core/themes.ts       battlefield colour themes
  game/types.ts        weapon data model (projectiles + actions)
  game/weapons.ts      the arsenal, pure data — add weapons here
  game/flight.ts       projectile physics shared by the game and the CPU
  game/game.ts         rules and simulation (turns, damage, scoring, flames, rolling, burrowing)
  game/ai.ts           CPU opponent
  net/commands.ts      the command protocol every input goes through (ready for online play)
  render/              renderer, particle effects, synthesized audio
  ui + main.ts         menus, HUD, input, game loop
```

- Adding weapons: see [docs/ADDING_WEAPONS.md](docs/ADDING_WEAPONS.md).
- Online multiplayer plan: see [docs/NETWORKING.md](docs/NETWORKING.md).
