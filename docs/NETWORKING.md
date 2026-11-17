# Online multiplayer plan

The game is built so online play only needs to relay player commands.

1. **Commands are the only input.** Every action (aim, weapon, move, fire) is a `GameCommand`
   (`src/net/commands.ts`) applied through `Game.apply`. Local input and the CPU already work this way.
2. **Deterministic simulation.** Gameplay runs on a fixed 1/120 s step, and all gameplay randomness
   (terrain, weapon deal, wind, scatter) comes from a seeded `Rng`. Visual effects use `Math.random`, but they
   never feed back into gameplay.
3. **Lockstep by turn.** Both peers create the game from the same seed. On your turn your commands are sent to
   the other peer and applied there in order. Only the active player sends, so there are no conflicts.
   `aim` updates can be throttled, because only the final aim before `fire` matters.

To add it: a `NetworkController` that implements `Controller` and applies remote commands, a small relay
(a WebSocket server or WebRTC data channel with a signalling server) and a lobby screen. The menu already
has a disabled "Online" slot. Add a terrain checksum on `endTurn` to detect drift during development.

Floating point is deterministic for the same JS engine and code. Across browsers it is almost always identical
for these operations, and the checksum will catch anything that isn't.
