/**
 * Weapon data model. Weapons are plain data: a projectile definition plus lists of actions that run on
 * events (impact, apex, bounce). New weapons are added in weapons.ts by composing these pieces; new
 * behaviour types are added by extending `Action` and handling it in game.ts `runAction`.
 */

export type TrailStyle = 'smoke' | 'fire' | 'spark' | 'plasma' | 'dirt' | 'ice' | 'none';
export type ExplosionStyle = 'small' | 'standard' | 'big' | 'nuke' | 'plasma' | 'fire' | 'dirt' | 'ice';

export type Action =
  /** Blast that removes terrain and damages tanks inside `radius`. */
  | { type: 'explode'; radius: number; damage: number; style?: ExplosionStyle }
  /** Spawn child projectiles. Direction is relative to the parent's velocity, straight up, or straight down. */
  | {
      type: 'spawn';
      count: number;
      spreadDeg: number;
      direction?: 'velocity' | 'up' | 'down';
      /** Absolute speed in px/s. Omit to keep the parent's speed. */
      speed?: number;
      /** Random +/- fraction applied to each child's speed. */
      speedJitter?: number;
      /** Random +/- degrees applied to each child's direction. */
      angleJitter?: number;
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
  /** Extra camera shake. */
  | { type: 'shake'; amount: number };

export interface ProjectileDef {
  radius?: number; // drawn size
  color: string;
  glow?: string;
  trail?: TrailStyle;
  gravityScale?: number; // default 1
  windScale?: number; // default 1
  speedScale?: number; // multiplies launch speed, default 1
  /** Bounce off terrain this many times before running onImpact. */
  bounces?: number;
  restitution?: number;
  onBounce?: Action[];
  /** After touching ground, roll along the surface and detonate when stopped or blocked. */
  roll?: { maxTime: number };
  /** After touching ground, keep travelling through it, carving a tunnel. onImpact runs at the end. */
  burrow?: { length: number; radius: number; speed?: number };
  /** Steer toward the nearest enemy after `delay` seconds, turning at most `turnRate` rad/s. */
  homing?: { turnRate: number; delay: number };
  onApex?: Action[];
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
  /** Either a projectile or a beam. */
  projectile?: ProjectileDef;
  beam?: BeamDef;
  /** Several projectiles per shot: fanned by spreadDeg, optionally staggered by delay seconds. */
  volley?: { count: number; spreadDeg: number; delay?: number };
  /** Hints for the CPU player: higher value = better attacking weapon. */
  ai?: { value: number };
}
