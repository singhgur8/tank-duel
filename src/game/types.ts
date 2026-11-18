/**
 * Weapon data model. Weapons are plain data: a projectile definition plus lists of actions that run on
 * events (impact, apex, bounce). New weapons are added in weapons.ts by composing these pieces; new
 * behaviour types are added by extending `Action` and handling it in game.ts `runAction`.
 */

export type TrailStyle = 'smoke' | 'fire' | 'spark' | 'plasma' | 'dirt' | 'ice' | 'none';
export type ExplosionStyle = 'small' | 'standard' | 'big' | 'nuke' | 'plasma' | 'fire' | 'dirt' | 'ice' | 'acid' | 'void';

export type Action =
  /** Blast that removes terrain and damages tanks inside `radius`. */
  | { type: 'explode'; radius: number; damage: number; style?: ExplosionStyle }
  /** Spawn child projectiles. Direction is relative to the parent's velocity, straight up, or straight down. */
  | {
      type: 'spawn';
      count: number;
      spreadDeg: number;
      /** 'forward' = up and onward in the parent's horizontal direction (hops). 'mirror' = the parent's velocity flipped left/right. */
      direction?: 'velocity' | 'up' | 'down' | 'forward' | 'mirror';
      /** Absolute speed in px/s. Omit to keep the parent's speed. */
      speed?: number;
      /** Random +/- fraction applied to each child's speed. */
      speedJitter?: number;
      /** Random +/- degrees applied to each child's direction. */
      angleJitter?: number;
      /** Place the children side by side this many px apart (a line of bombs) instead of all at one point. */
      spacing?: number;
      /** Start the children this many px above the spawn point (for bombs dropped from the sky). */
      lift?: number;
      projectile: ProjectileDef;
    }
  /** Add a ball of dirt. */
  | { type: 'dirt'; radius: number }
  /** Raise a hill of dirt on the surface. */
  | { type: 'mound'; width: number; height: number }
  /** Level the ground to the impact height. */
  | { type: 'flatten'; width: number }
  /** Burning liquid that flows downhill and damages tanks it touches. */
  | { type: 'napalm'; count: number; duration: number; dps: number; spread: number }
  /** Lightning bolt from the sky onto the point: damages tanks within `radius` (horizontally) and splits the ground. */
  | { type: 'lightning'; radius: number; damage: number }
  /** Ground shock: damages tanks standing on the ground within `radius`, cracks the terrain and shakes hard. */
  | { type: 'quake'; radius: number; damage: number }
  /** Move the shooter's tank to this spot. */
  | { type: 'teleport' }
  /** Shove tanks within `radius` away from the point (negative `strength` pulls them in). No damage. */
  | { type: 'push'; radius: number; strength: number }
  /** Build a hollow arch of dirt over the point. */
  | { type: 'dome'; radius: number; thickness: number }
  /** Gamble: `hit` runs with probability `chance`, otherwise `miss`. */
  | { type: 'lottery'; chance: number; hit: Action[]; miss: Action[] }
  /** Run one of the option lists, chosen at random. */
  | { type: 'random'; options: Action[][] }
  /** Run `actions` at the same spot `time` seconds later (the turn waits for it). */
  | { type: 'delay'; time: number; actions: Action[] }
  /** Visual only: energy gathering into the point for `time` seconds. */
  | { type: 'charge'; radius: number; time: number; color: string }
  /** Take up to `points` from every other tank within `radius` and give them to the shooter. */
  | { type: 'steal'; radius: number; points: number }
  /** Swap places with the nearest other tank within `radius` of the point. */
  | { type: 'swap'; radius: number }
  /** Beam straight down from the sky: cuts a trench `depth` px deep and damages tanks within `width`/2 horizontally. */
  | { type: 'column'; width: number; damage: number; depth: number; color: string }
  /** Extra camera shake. */
  | { type: 'shake'; amount: number };

/** How a projectile is drawn. Left out, it is picked from what the projectile does (see render/projectiles.ts). */
export type ProjectileLook = 'shell' | 'grenade' | 'bomb' | 'missile' | 'orb' | 'ball' | 'pellet' | 'canister' | 'clod' | 'drill' | 'kernel' | 'crawler';

export interface ProjectileDef {
  look?: ProjectileLook;
  radius?: number; // drawn size
  color: string;
  glow?: string;
  trail?: TrailStyle;
  gravityScale?: number; // default 1
  windScale?: number; // default 1
  speedScale?: number; // multiplies launch speed, default 1
  /** Bounce off terrain this many times before running onImpact. */
  bounces?: number;
  /** Share of the bounce speed kept (0..1). */
  restitution?: number;
  /** Share of the along-the-surface speed lost on each bounce (0..1, default 0.12). */
  friction?: number;
  onBounce?: Action[];
  /** After touching ground, roll along the surface and detonate when stopped or blocked. */
  roll?: { maxTime: number };
  /** After touching ground, keep travelling through it, carving a tunnel. onImpact runs at the end. */
  burrow?: { length: number; radius: number; speed?: number };
  /** Steer toward the nearest enemy once past the top of the arc (and at least `delay` s old), turning at most `turnRate` rad/s. */
  homing?: { turnRate: number; delay: number };
  onApex?: Action[];
  /** Go off this many seconds after launch, wherever it is (bouncing, rolling or resting). */
  fuse?: number;
  /** Go off in flight when this close to an enemy tank (px). */
  proximity?: number;
  /** After landing, drive along the ground at `speed` px/s for up to `time` s, climbing hills; blows up on contact. */
  crawl?: { speed: number; time: number };
  /** Horizontal pull back toward the shooter (px/s²): the shot curves back like a boomerang. */
  pull?: number;
  /** Fly straight through terrain (only tanks, a fuse or proximity stop it). */
  phase?: boolean;
  /** Leave the whole flight path on screen until the next shot (for sighting shots). */
  tracer?: boolean;
  /** Remove the projectile after its apex actions (children carry on). */
  consumeOnApex?: boolean;
  onImpact: Action[];
}

export interface BeamDef {
  length: number;
  width: number;
  damage: number;
  color: string;
}

export type WeaponCategory = 'explosive' | 'spread' | 'special' | 'utility';

export interface WeaponDef {
  id: string;
  name: string;
  description: string;
  category: WeaponCategory;
  /** Icon key from src/render/icons.ts. Defaults to the weapon id; reuse any key for a new weapon. */
  icon?: string;
  /** Either a projectile or a beam. */
  projectile?: ProjectileDef;
  /** Beams can also aim below the horizon (angle range widens to BEAM_ANGLE_MIN..BEAM_ANGLE_MAX). */
  beam?: BeamDef;
  /** Several projectiles per shot: fanned by spreadDeg, optionally staggered by delay seconds. */
  volley?: { count: number; spreadDeg: number; delay?: number };
  /** Hints for the CPU player: higher value = better attacking weapon. */
  ai?: { value: number };
}
