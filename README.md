# Tank Duel

A turn-based artillery tank game in the classic genre: two tanks, destructible hills, wind, gravity, and a
big bag of weapons. It's an original game. The mechanics follow genre conventions, and all names, art and
sound are made for this project.

- **2 players on one device** (hot-seat), or **vs CPU** with difficulty 1 to 10 (level 10 never misses when a
  trajectory exists).
- **70 weapons**, each with its own icon, its own projectile look (shell, grenade, bomb, missile, orb, canister, drill, popcorn…) and impact behaviour.
  New inventions: Kettle Pop (popcorn kernels that keep popping), Singularity (a mini black hole that drags tanks in, then
  collapses), Phase Shell (ghosts through hills), Mirror Shell, Pickpocket (steals points), Switcheroo (swap places),
  Orbital Lance (beam from orbit), Echo Charge (blasts three times), Twin Crawlers, Brain Fog (scrambles the
  enemy's aim), and Springwall / Rubber Coat (rubber that stays on the map and bounces shots away). Classics: shells, spreads, splitters, cluster bombs, hail, chain gun,
  scattergun, fireworks, airstrike, acid rain, swarm seekers, chain reactions (Ripple family), rollers, bouncers,
  a crawler, a boomerang, timed and proximity fuses, tunnelers, pile driver, mole swarm, a laser and a close-range
  blast, lightning, earthquake, napalm, volcano, a teleporter, fling and pull blasts, a random grab bag, a 1-in-4
  gamble, a tracer sighting round, and dirt/terrain tools (walls, domes, spires, flowing mud).
- **Point-blank shots**: shove your barrel into the enemy and fire. Sub-munitions born inside a tank's hull can't
  get clear before they're allowed to hit it again, so chain weapons can cascade into huge scores. It falls out of
  the physics, not a special rule, and the blasts can catch you too.
- **Weapons in play**: switch any weapon on or off in the lobby (with presets). Only enabled weapons can be picked or dealt.
- **2 to 4 players**: any mix of humans and CPUs on one device, each CPU with its own level (1–10). Turns rotate, the draft goes round the table, and with 3 or 4 players the CPU goes after whoever is leading.
- **Game lobby**: take turns picking weapons (draft) or deal them at random, 5–20 weapons each, single games or best of 3/5, wind strength, terrain shape (rolling, peaks, flat, valley), scenery and CPU level.
- **Destructible terrain** with falling dirt, tank movement (4 moves per game), wind that changes every turn,
  and score-based play: damage you deal is your score, and hurting yourself takes that much off your own score (scores can go negative).
- **Elastic physics**: tanks ride on springy suspension, kick back when they fire, get thrown by nearby blasts,
  bounce on hard landings, tip into craters and slide down steep slopes. Bouncy rounds keep their speed along
  the ground on glancing hits (restitution plus surface friction). All of it runs in the deterministic simulation.
- **Premium feel**: real projectile physics on a fixed 120 Hz step, glowing trails, layered explosions
  (flash, fireball, sparks, debris, smoke, shockwave), screen shake, hit-stop, scorch marks, synthesized audio.
- **Plays offline**: it's a PWA, so open it once in a browser and choose *Install* to get a standalone app that
  works without a connection. No asset files: graphics are drawn in code and sounds are synthesized.

## Desktop app (Mac and Windows)

Tank Duel runs as a normal app on your computer, fully offline.

**Download it:** open the repository's **Releases** page on GitHub and grab the latest build.

- **Mac** (Apple Silicon and Intel): download `Tank-Duel-…-mac.dmg`, open it and drag **Tank Duel** into **Applications**.
  The app isn't signed with an Apple developer certificate, so the first time you open it:
  right-click (or Control-click) **Tank Duel** in Applications and choose **Open**, then **Open** again.
  If macOS only offers *Move to Trash*, go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway**.
  After that it opens normally from Launchpad or the Dock.
- **Windows:** run `Tank-Duel-Setup-….exe` to install it, or use `Tank-Duel-Portable-….exe` without installing.
  If SmartScreen appears, click **More info → Run anyway**.

**New builds:** every push to `main` runs the *Desktop app* GitHub Action, which builds both apps and attaches
them to the Release for the version in `package.json`. Bump `"version"` (for example to `0.2.0`) to start a new Release.

**Run the app from source** (needs [Node.js](https://nodejs.org) 20+):

```bash
npm install
npm run app          # builds the game and opens it in a desktop window
npm run dist:mac     # builds release/mac-universal/Tank Duel.app on a Mac
```

## Run it in a browser

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
| Angle | ← / → (whole degrees) | Angle buttons or slider, or drag on the battlefield |
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

## Combat rules at a glance

- The barrel turns a full 360°.
- Splash reaches about one and a half times the crater size, so near misses still score. Ground between a blast and a tank soaks up the splash, so domes, walls and spires really shelter you.
- Rubber (Springwall, Rubber Coat) never falls, shrugs off small blasts, and bounces shots away.
- Scores can go negative: hurting yourself costs points, and Pickpocket can push a victim below zero.
