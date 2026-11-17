/**
 * Everything a player can do is one of these commands. Local input, the CPU and (later) a network peer all
 * produce commands, and `Game.apply` is the only place they take effect. Because the simulation runs on a
 * fixed step with a seeded RNG, two clients that start from the same seed and apply the same commands in
 * the same order stay in sync, so online play only needs to relay commands (see docs/NETWORKING.md).
 */
export type GameCommand =
  | { t: 'aim'; angle: number; power: number }
  | { t: 'weapon'; index: number }
  | { t: 'move'; dir: -1 | 1 }
  | { t: 'fire' };

/** Something that drives one player's turn. */
export interface Controller {
  /** Called every frame while it is this controller's turn and the game is waiting for input. */
  update(dt: number): void;
  /** Called once when this controller's turn starts. */
  beginTurn(): void;
}
