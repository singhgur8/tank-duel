export type RGB = [number, number, number];

export interface Theme {
  id: string;
  name: string;
  sky: string[]; // top -> horizon gradient stops
  sun?: { color: string; x: number; y: number; r: number };
  stars?: boolean;
  mountains: string[]; // far -> near silhouettes
  top: RGB; // terrain colour near surface
  deep: RGB; // terrain colour deep down
  edge: RGB; // highlight on exposed surfaces
  dirt: RGB; // colour of added dirt
  cloud: string;
  fog: string;
}

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export const THEMES: Theme[] = [
  {
    id: 'dusk', name: 'Dusk Canyon',
    sky: ['#140b2e', '#4a1f5c', '#c4506a', '#f6a35c'],
    sun: { color: '#ffd28a', x: 0.7, y: 0.52, r: 60 },
    mountains: ['#5a2a5e', '#3c1c46', '#26102f'],
    top: hex('#c86a3e'), deep: hex('#3d1a18'), edge: hex('#ffc27a'), dirt: hex('#9a5530'),
    cloud: 'rgba(255,190,170,0.35)', fog: 'rgba(246,163,92,0.18)',
  },
  {
    id: 'glacier', name: 'Glacier',
    sky: ['#0a1f3f', '#1f4f86', '#6fb3dc', '#d6f1ff'],
    sun: { color: '#ffffff', x: 0.25, y: 0.3, r: 40 },
    mountains: ['#8fb6d6', '#6a92b8', '#4a6f96'],
    top: hex('#e9f5ff'), deep: hex('#4b6c95'), edge: hex('#ffffff'), dirt: hex('#b9cfe6'),
    cloud: 'rgba(255,255,255,0.55)', fog: 'rgba(214,241,255,0.2)',
  },
  {
    id: 'verdant', name: 'Verdant Hills',
    sky: ['#12324f', '#2f6d8f', '#86c7c0', '#f3e7b0'],
    sun: { color: '#fff3c0', x: 0.82, y: 0.25, r: 46 },
    mountains: ['#5d8f8a', '#3f6e5e', '#2a4f3b'],
    top: hex('#5b9a37'), deep: hex('#3a2817'), edge: hex('#b5ec5c'), dirt: hex('#6b4a2b'),
    cloud: 'rgba(255,255,255,0.6)', fog: 'rgba(243,231,176,0.18)',
  },
  {
    id: 'night', name: 'Neon Night',
    sky: ['#020309', '#070b22', '#16204a', '#2c2a5e'],
    stars: true,
    sun: { color: '#dfe7ff', x: 0.18, y: 0.2, r: 30 },
    mountains: ['#1d2550', '#141a3a', '#0c1026'],
    top: hex('#38456e'), deep: hex('#0e1122'), edge: hex('#7ae2ff'), dirt: hex('#2c3558'),
    cloud: 'rgba(120,140,255,0.18)', fog: 'rgba(80,90,200,0.12)',
  },
  {
    id: 'ash', name: 'Ashlands',
    sky: ['#0d0606', '#2a0f0b', '#6b2416', '#c2541f'],
    sun: { color: '#ff9a4a', x: 0.5, y: 0.58, r: 80 },
    mountains: ['#3a1a14', '#2a120e', '#1a0a08'],
    top: hex('#4a3f3b'), deep: hex('#160f0e'), edge: hex('#ff7a2e'), dirt: hex('#3a302c'),
    cloud: 'rgba(80,50,40,0.45)', fog: 'rgba(255,110,40,0.12)',
  },
];
