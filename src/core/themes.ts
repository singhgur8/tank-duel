export type RGB = [number, number, number];

/**
 * Battlefield looks in the classic artillery style: a clean gradient sky over smooth, solid-coloured hills.
 * `top`/`deep` are the ground colour at the top and bottom of the field, `edge` is the thin lit rim on
 * exposed ground, and `dirt` tints dirt particles.
 */
export interface Theme {
  id: string;
  name: string;
  sky: string[]; // top -> horizon gradient stops
  stars?: boolean;
  top: RGB;
  deep: RGB;
  edge: RGB;
  dirt: RGB;
  /** Bright skies: additive glows are toned down so blasts don't wash out to white. */
  bright?: boolean;
}

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export const THEMES: Theme[] = [
  {
    id: 'midnight', name: 'Midnight Hills',
    sky: ['#02040c', '#08163a', '#1d3f7a'],
    stars: true,
    top: hex('#3cae4a'), deep: hex('#145a22'), edge: hex('#9df07a'), dirt: hex('#2f7a35'),
  },
  {
    id: 'dusk', name: 'Dusk',
    sky: ['#1a0b2e', '#6a2a5e', '#e2725b'],
    top: hex('#c45a2c'), deep: hex('#5e2414'), edge: hex('#ffb070'), dirt: hex('#8a3e1e'),
  },
  {
    id: 'desert', name: 'Desert',
    sky: ['#1f5fa8', '#5aa0d8', '#f4dca6'],
    top: hex('#e6b45e'), deep: hex('#9a6226'), edge: hex('#fff0b8'), dirt: hex('#b07a38'),
    bright: true,
  },
  {
    id: 'glacier', name: 'Glacier',
    sky: ['#0a2240', '#2c6aa8', '#bfe6ff'],
    top: hex('#f2f8ff'), deep: hex('#7d9dc0'), edge: hex('#ffffff'), dirt: hex('#c4d6ea'),
    bright: true,
  },
  {
    id: 'neon', name: 'Neon Night',
    sky: ['#000000', '#0c0826', '#2a1650'],
    stars: true,
    top: hex('#5b3fc4'), deep: hex('#1c1250'), edge: hex('#c6a8ff'), dirt: hex('#3e2a8a'),
  },
  {
    id: 'ash', name: 'Ashlands',
    sky: ['#0c0303', '#3a0e06', '#a03a12'],
    top: hex('#5a4a44'), deep: hex('#221a18'), edge: hex('#ff7a2e'), dirt: hex('#3e322e'),
  },
];
